import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Judge uses the SERVICE ROLE client (server-only) so hidden test_cases
// bypass RLS. The public anon client is used for user-scoped writes.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env.
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { cookies: { getAll: () => [], setAll: () => {} } })
}

async function userClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

// ─── Judge endpoints ───────────────────────────────────────────────
// Piston: free public code-execution sandbox (no API key needed).
//
// CONTRACT (CodeChef-style): the user's program reads input from
// stdin and prints the answer to stdout. The judge feeds each hidden
// test case as stdin and compares stdout. No function-wrapping, so any
// language/format works and the contract is the same for every problem.
//
// Anti-abuse:
//   • hidden test cases never leave the server
//   • 12 submissions/problem/hour cap (dsa_rate_limit RPC)
//   • first accepted solve is the only one rewarded (UNIQUE ledger ref)
//   • output compare with float tolerance; time limit enforced
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute'
const LANG_MAP: Record<string, { language: string }> = {
  python: { language: 'python' },
  javascript: { language: 'javascript' },
  cpp: { language: 'c++' },
  java: { language: 'java' },
}

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

function outputsMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  const fa = parseFloat(na)
  const fb = parseFloat(nb)
  if (!isNaN(fa) && !isNaN(fb) && Math.abs(fa - fb) < 1e-4) return true
  return false
}

export async function POST(req: Request) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
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
      .select('id, slug, difficulty, test_cases, time_limit_ms')
      .eq('id', problemId)
      .single()
    problemData = res.data ?? null
  } catch { problemData = null }
  if (!problemData || !Array.isArray(problemData.test_cases)) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

  const tests = problemData.test_cases as { input: string; output: string }[]
  if (tests.length === 0) return NextResponse.json({ error: 'Problem has no test cases' }, { status: 500 })

  // ── Contest window check ──
  if (contestId) {
    const { data: contest } = await judge.from('contests').select('starts_at, ends_at').eq('id', contestId).single()
    if (contest) {
      const now = Date.now()
      if (now < new Date(contest.starts_at).getTime() || now > new Date(contest.ends_at).getTime()) {
        return NextResponse.json({ error: 'Contest is not live right now' }, { status: 403 })
      }
    }
  }

  // ── Execute against ALL hidden cases ──
  let passed = 0
  let firstFail = ''
  let verdict: string = 'accepted'
  let runtime = 0

  for (const t of tests) {
    const started = Date.now()
    let res: any
    try {
      const r = await fetch(PISTON_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: LANG_MAP[language].language,
          files: [{ name: 'main', content: code }],
          stdin: t.input,
          compile_timeout: 10000,
          run_timeout: Math.max(problemData.time_limit_ms || 3000, 3000),
        }),
        signal: AbortSignal.timeout(15000),
      })
      res = await r.json()
    } catch {
      verdict = 'runtime_error'
      firstFail = t.input.slice(0, 80)
      break
    }
    runtime = Math.max(runtime, Date.now() - started)

    if (res.compile?.stderr) {
      verdict = 'compile_error'
      firstFail = (res.compile.stderr || '').slice(0, 120)
      break
    }
    if (res.stderr) {
      verdict = 'runtime_error'
      firstFail = (res.stderr || '').slice(0, 120)
      break
    }
    if (res.run?.signal === 'SIGKILL' || (res.run?.time as number) >= (problemData.time_limit_ms || 3000) / 1000) {
      verdict = 'time_limit'
      firstFail = t.input.slice(0, 80)
      break
    }
    if (outputsMatch(res.run?.output ?? '', t.output)) {
      passed++
    } else {
      verdict = 'wrong_answer'
      firstFail = t.input.slice(0, 80)
      break
    }
  }

  // ── Record submission (judge inserts; clients cannot insert) ──
  await judge.from('dsa_submissions').insert({
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

  // ── Reward via the validated wrapper (idempotent, ungameable) ──
  if (verdict === 'accepted') {
    await supabase.rpc('reward_dsa_solve', { p_problem_id: problemId, p_contest_id: contestId })
  }

  return NextResponse.json({
    verdict,
    passed,
    total: tests.length,
    runtime_ms: runtime,
    first_fail_input: verdict === 'accepted' ? null : firstFail,
  })
}
