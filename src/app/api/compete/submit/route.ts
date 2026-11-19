import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { LANG_MAP, StoredVerdict, Verdict, outputsMatch, runCode } from '@/lib/compete/judge'
import { contractFromStarter, wrapForJudge } from '@/lib/compete/harness'

// Judge uses the SERVICE ROLE client (server-only) so hidden test_cases
// bypass RLS. The public anon client is used for user-scoped writes.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env.
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

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

// ─── Submit ────────────────────────────────────────────────────────────────
// Runs the solution against ALL hidden cases (a compile error stops the run),
// so every passing case is graded and counted — a single wrong case no longer
// hides the work done on the others. Records the submission and returns a
// per-case summary. Hidden inputs are never returned.
//
// Anti-abuse:
//   • hidden test cases never leave the server
//   • 12 submissions/problem/hour cap (dsa_rate_limit RPC)
//   • first accepted solve is the only one rewarded (UNIQUE ledger ref)
//   • a judge outage returns internal_error and writes no submission
export async function POST(req: Request) {
  const supabase = await userClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const judge = serviceClient()

  const body = await req.json().catch(() => null)
  const problemId = body?.problem_id as string
  const code = body?.code as string
  const language = body?.language as string
  const contestId = body?.contest_id as string | null

  if (!problemId || !code || !LANG_MAP[language]) {
    return NextResponse.json({ error: 'problem_id, code and language are required' }, { status: 400 })
  }
  if (code.length > 20000) return NextResponse.json({ error: 'Code too long' }, { status: 400 })

  // ── Rate limit: 12 submissions/problem/hour ──
  const { data: canSubmit } = await supabase.rpc('dsa_rate_limit', { p_problem_id: problemId })
  if (canSubmit === false) {
    return NextResponse.json({ error: 'Too many attempts for this problem — take a break.' }, { status: 429 })
  }

  // Read-only problem access for the client (hidden test_cases excluded)
  const { data: meta } = await supabase
    .from('dsa_problems')
    .select('id, slug, difficulty, time_limit_ms')
    .eq('id', problemId)
    .single()
  if (!meta) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

  // ── Load hidden test cases via SERVICE ROLE (server-only) ──
  let problemData: any = null
  try {
    const res = await judge
      .from('dsa_problems')
      .select('id, slug, difficulty, test_cases, time_limit_ms, starter_code')
      .eq('id', problemId)
      .single()
    problemData = res.data ?? null
  } catch {
    problemData = null
  }
  if (!problemData || !Array.isArray(problemData.test_cases)) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
  }

  const tests = problemData.test_cases as { input: string; output: string }[]
  if (tests.length === 0) return NextResponse.json({ error: 'Problem has no test cases' }, { status: 500 })

  // ── Contest window check ──
  // An unknown contest id must not be silently accepted: the row would be
  // recorded against a contest that does not exist and could be rewarded.
  if (contestId) {
    const { data: contest, error: contestError } = await judge
      .from('contests')
      .select('starts_at, ends_at')
      .eq('id', contestId)
      .maybeSingle()
    if (contestError) {
      return NextResponse.json({ error: 'Could not verify the contest right now' }, { status: 503 })
    }
    if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })

    const now = Date.now()
    if (now < new Date(contest.starts_at).getTime() || now > new Date(contest.ends_at).getTime()) {
      return NextResponse.json({ error: 'Contest is not live right now' }, { status: 403 })
    }
  }

  // ── LeetCode-style wrapper ──
  // Hidden driver is appended server-side; the student's submission stays
  // the solution function only. Problems without a contract (legacy rows) run
  // their code unchanged on the stdin/stdout contract.
  const contract = contractFromStarter(problemData.starter_code)
  const program = contract ? wrapForJudge(language as 'python' | 'javascript' | 'cpp' | 'java', contract, code) : code

  // ── Execute against ALL hidden cases ──
  const timeLimit = problemData.time_limit_ms || 3000
  let passed = 0
  let verdict: StoredVerdict = 'accepted'
  let runtime = 0
  let compileOutput: string | null = null
  let stderr: string | null = null
  const cases: { index: number; status: Verdict; passed: boolean; time_ms: number }[] = []

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]
    const res = await runCode({ language, code: program, stdin: t.input, timeLimitMs: timeLimit })

    // Judge outage: no verdict, no submission, no rate-limit consumed.
    if (!res.ok) {
      return NextResponse.json(
        { error: 'The judge is unavailable right now — your attempt was not counted.', verdict: 'internal_error' },
        { status: 503 }
      )
    }

    runtime = Math.max(runtime, res.timeMs)

    if (res.compileOutput.trim()) {
      verdict = 'compile_error'
      compileOutput = res.compileOutput.trim()
      cases.push({ index: i + 1, status: verdict, passed: false, time_ms: res.timeMs })
      break
    }

    if (res.timedOut) {
      if (verdict === 'accepted') verdict = 'time_limit'
      cases.push({ index: i + 1, status: 'time_limit', passed: false, time_ms: res.timeMs })
      continue
    }

    if (res.stderr.trim() || res.exitCode !== 0) {
      if (verdict === 'accepted') verdict = 'runtime_error'
      stderr = res.stderr.trim() || `Exited with code ${res.exitCode}`
      cases.push({ index: i + 1, status: 'runtime_error', passed: false, time_ms: res.timeMs })
      continue
    }

    if (outputsMatch(res.stdout, t.output)) {
      passed++
      cases.push({ index: i + 1, status: 'accepted', passed: true, time_ms: res.timeMs })
      continue
    }

    if (verdict === 'accepted') verdict = 'wrong_answer'
    cases.push({ index: i + 1, status: 'wrong_answer', passed: false, time_ms: res.timeMs })
  }

  // ── Record submission (judge inserts; clients cannot insert) ──
  // A failed write must never look like a graded attempt: report it and skip
  // the reward, otherwise the UI shows a verdict for a row that does not exist.
  const { error: insertError } = await judge.from('dsa_submissions').insert({
    user_id: user.id,
    problem_id: problemId,
    contest_id: contestId,
    language,
    code,
    verdict,
    passed,
    total: tests.length,
    runtime_ms: runtime,
  })
  if (insertError) {
    return NextResponse.json(
      { error: 'Your submission could not be saved, so it was not counted. Please try again.' },
      { status: 500 }
    )
  }

  // ── Reward via the validated wrapper (idempotent, ungameable) ──
  if (verdict === 'accepted') {
    await supabase.rpc('reward_dsa_solve', { p_problem_id: problemId, p_contest_id: contestId })
  }

  return NextResponse.json({
    verdict,
    passed,
    total: tests.length,
    runtime_ms: runtime,
    cases,
    compile_output: compileOutput,
    stderr,
  })
}
