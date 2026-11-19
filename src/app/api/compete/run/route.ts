import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { LANG_MAP, Verdict, allowRun, outputsMatch, runCode } from '@/lib/compete/judge'
import { contractFromStarter, wrapForJudge } from '@/lib/compete/harness'

// ─── Run vs Submit ─────────────────────────────────────────────────────────
// `Run` executes the code against the problem's PUBLIC examples (the same
// ones shown in the statement) and returns input / expected / actual for
// each. Hidden test cases are never read here, so nothing secret can leak:
// this route only ever selects `examples`.
//
// `Submit` remains the only path that touches hidden cases and awards karma.

async function userClient() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })
}

type Example = { input?: unknown; output?: unknown; explanation?: unknown }

export async function POST(req: Request) {
  const supabase = await userClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to run code' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const problemId = body?.problem_id as string
  const code = body?.code as string
  const language = body?.language as string
  const exampleIndex = typeof body?.example_index === 'number' ? body.example_index : null

  if (!problemId || !code || !LANG_MAP[language]) {
    return NextResponse.json({ error: 'problem_id, code and language are required' }, { status: 400 })
  }
  if (code.length > 20000) return NextResponse.json({ error: 'Code too long' }, { status: 400 })

  if (!allowRun(user.id)) {
    return NextResponse.json({ error: 'Slow down a little — too many runs in a minute.' }, { status: 429 })
  }

  const { data: problem, error } = await supabase
    .from('dsa_problems')
    .select('id, examples, starter_code, time_limit_ms, is_active')
    .eq('id', problemId)
    .eq('is_active', true)
    .single()

  if (error || !problem) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

  const all = (Array.isArray(problem.examples) ? problem.examples : []) as Example[]
  const usable: { index: number; input: string; output: string; explanation?: string }[] = []
  all.forEach((ex, i) => {
    if (typeof ex?.input === 'string' && typeof ex?.output === 'string') {
      usable.push({
        index: i,
        input: ex.input,
        output: ex.output,
        explanation: typeof ex?.explanation === 'string' ? ex.explanation : undefined,
      })
    }
  })

  if (usable.length === 0) {
    return NextResponse.json({ error: 'This problem has no example cases to run against' }, { status: 400 })
  }

  const selected =
    exampleIndex !== null && exampleIndex >= 0 && exampleIndex < usable.length
      ? [usable[exampleIndex]]
      : usable.slice(0, 6)

  // Same hidden driver as Submit: the student writes a function, the driver
  // reads the sample input and calls it. Legacy stdin problems run unchanged.
  const contract = contractFromStarter(problem.starter_code)
  const program = contract ? wrapForJudge(language as 'python' | 'javascript' | 'cpp' | 'java', contract, code) : code

  const timeLimit = problem.time_limit_ms || 3000
  const cases: {
    index: number
    status: Verdict | 'passed'
    passed: boolean
    time_ms: number
    input: string
    expected: string
    actual?: string
    stderr?: string
    compile_output?: string
  }[] = []

  let verdict: Verdict | 'passed' = 'passed'
  let runtime = 0

  for (const ex of selected) {
    const res = await runCode({ language, code: program, stdin: ex.input, timeLimitMs: timeLimit })

    if (!res.ok) {
      // Infrastructure failure, not a wrong answer. Nothing is charged to
      // the student and the UI shows "judge unavailable".
      return NextResponse.json(
        { error: 'The judge is unavailable right now — try again in a moment.' },
        { status: 503 }
      )
    }

    runtime = Math.max(runtime, res.timeMs)

    if (res.compileOutput.trim()) {
      cases.push({
        index: ex.index + 1,
        status: 'compile_error',
        passed: false,
        time_ms: res.timeMs,
        input: ex.input,
        expected: ex.output,
        compile_output: res.compileOutput.trim(),
      })
      verdict = 'compile_error'
      break // every further case would fail the same compile
    }

    if (res.timedOut) {
      cases.push({
        index: ex.index + 1,
        status: 'time_limit',
        passed: false,
        time_ms: res.timeMs,
        input: ex.input,
        expected: ex.output,
      })
      verdict = verdict === 'passed' ? 'time_limit' : verdict
      continue
    }

    if (res.stderr.trim() || res.exitCode !== 0) {
      cases.push({
        index: ex.index + 1,
        status: 'runtime_error',
        passed: false,
        time_ms: res.timeMs,
        input: ex.input,
        expected: ex.output,
        stderr: res.stderr.trim() || `Exited with code ${res.exitCode}`,
      })
      verdict = verdict === 'passed' ? 'runtime_error' : verdict
      continue
    }

    const passed = outputsMatch(res.stdout, ex.output)
    cases.push({
      index: ex.index + 1,
      status: passed ? 'passed' : 'wrong_answer',
      passed,
      time_ms: res.timeMs,
      input: ex.input,
      expected: ex.output,
      actual: res.stdout,
    })
    if (!passed && verdict === 'passed') verdict = 'wrong_answer'
  }

  const passedCount = cases.filter((c) => c.passed).length

  return NextResponse.json({
    verdict,
    passed: passedCount,
    total: cases.length,
    runtime_ms: runtime,
    cases,
  })
}
