/**
 * Route tests for the DSA judge surface: /api/compete/run, /api/compete/submit
 * and /api/compete/judge/health.
 *
 * The judge binary is never called. `runCode` is stubbed so each test pins the
 * mapping from a runner result to the response the browser renders:
 *
 *   runner result                → run verdict        → submit verdict
 *   ------------------------------------------------------------------
 *   ok: false (transport)        → 503, nothing run   → 503 internal_error, no row
 *   compile_output non-empty     → compile_error      → compile_error (stop)
 *   timedOut                     → time_limit        → time_limit (stop)
 *   stderr / exitCode !== 0      → runtime_error     → runtime_error (stop)
 *   stdout mismatch              → wrong_answer      → wrong_answer (all cases graded)
 *   stdout match                 → passed            → accepted
 *
 * Two behaviors are security-relevant and asserted directly:
 *   • Run only ever selects `examples` — the hidden `test_cases` column is not
 *     in its select list, so it cannot leak through that route.
 *   • Submit never returns hidden inputs/expected values; a failing case comes
 *     back with only index/status/passed/time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type RunCodeResult = {
  ok: boolean
  stdout: string
  stderr: string
  compileOutput: string
  exitCode: number
  timeMs: number
  timedOut: boolean
  statusId: number | null
}

const ok = (stdout: string, extra: Partial<RunCodeResult> = {}): RunCodeResult => ({
  ok: true,
  stdout,
  stderr: '',
  compileOutput: '',
  exitCode: 0,
  timeMs: 10,
  timedOut: false,
  statusId: 3,
  ...extra,
})

const mock = vi.hoisted(() => {
  const state = {
    user: null as { id: string } | null,
    rateLimit: true as boolean | null,
    problem: null as Record<string, any> | null,
    submissions: [] as Record<string, any>[],
    insertError: null as string | null,
    codes: [] as string[],
    selects: [] as { table: string; cols: string; service: boolean }[],
    rpcCalls: [] as { fn: string; args: unknown }[],
    runCode: null as unknown as (args: {
      language: string
      code: string
      stdin: string
      timeLimitMs: number
    }) => Promise<RunCodeResult>,
  }

  const resultFor = (table: string) => {
    if (table === 'dsa_problems') {
      return state.problem ? { data: state.problem, error: null } : { data: null, error: { message: 'no rows' } }
    }
    if (table === 'dsa_submissions') return { data: state.submissions, error: null }
    return { data: null, error: null }
  }

  function from(table: string, service: boolean) {
    let inserted: Record<string, any> | null = null
    const builder: any = {
      select: (cols: string) => {
        state.selects.push({ table, cols, service })
        return builder
      },
      eq: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: (row: Record<string, any>) => {
        inserted = row
        return builder
      },
      then: (res: any, rej: any) =>
        Promise.resolve(
          inserted
            ? state.insertError
              ? { data: null, error: { message: state.insertError } }
              : (state.submissions.push(inserted), { data: null, error: null })
            : resultFor(table)
        ).then(res, rej),
    }
    return builder
  }

  function createServerClient(_url: string, key: string) {
    const service = key === 'service-key'
    return {
      auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
      from: (table: string) => from(table, service),
      rpc: async (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args })
        if (fn === 'dsa_rate_limit') return { data: state.rateLimit, error: null }
        return { data: null, error: null }
      },
    }
  }

  return { state, createServerClient }
})

vi.mock('@supabase/ssr', () => ({ createServerClient: mock.createServerClient }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))

vi.mock('@/lib/compete/judge', () => ({
  JUDGE0_URL: 'http://judge.test',
  LANG_MAP: { python: { language: 'Python', id: 71 } },
  outputsMatch: (actual: string, expected: string) => actual.trim() === expected.trim(),
  allowRun: () => true,
  runCode: (args: Parameters<typeof mock.state.runCode>[0]) => {
    mock.state.codes.push(args.code)
    return mock.state.runCode(args)
  },
}))

import { POST as runPOST } from '@/app/api/compete/run/route'
import { POST as submitPOST } from '@/app/api/compete/submit/route'
import { GET as healthGET } from '@/app/api/compete/judge/health/route'

const jsonRequest = (body: unknown) =>
  new Request('http://localhost/api/compete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const validBody = { problem_id: 'p1', code: 'print(1)', language: 'python' }

beforeEach(() => {
  mock.state.user = { id: 'user-1' }
  mock.state.rateLimit = true
  mock.state.submissions = []
  mock.state.insertError = null
  mock.state.selects = []
  mock.state.rpcCalls = []
  mock.state.codes = []
  mock.state.problem = {
    id: 'p1',
    slug: 'reverse-string',
    difficulty: 'easy',
    is_active: true,
    time_limit_ms: 2000,
    examples: [
      { input: 'hello', output: 'olleh' },
      { input: 'abc', output: 'cba' },
    ],
    // Function contract: the driver is appended server-side, hidden inputs
    // are fed to it, and only the student's function is ever returned.
    starter_code: {
      python: 'class Solution:\n    def reverseString(self, s: str) -> str:\n        pass\n',
      _meta: { entry: 'reverseString', params: ['string'], names: ['s'], returns: 'string' },
    },
    test_cases: [
      { input: 'secret-1', output: '1tnerces' },
      { input: 'secret-2', output: '2tnerces' },
    ],
  }
  mock.state.runCode = async () => ok('')
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
})

describe('POST /api/compete/run', () => {
  it('refuses signed-out callers before touching the judge', async () => {
    mock.state.user = null
    const res = await runPOST(jsonRequest(validBody))
    expect(res.status).toBe(401)
    expect(mock.state.selects).toHaveLength(0)
  })

  it('runs only the public examples and reports per-case input/actual/expected', async () => {
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'hello' ? 'olleh' : 'abc')
    const res = await runPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ verdict: 'wrong_answer', passed: 1, total: 2 })
    expect(body.cases[0]).toMatchObject({
      index: 1,
      status: 'passed',
      passed: true,
      input: 'hello',
      expected: 'olleh',
      actual: 'olleh',
    })
    expect(body.cases[1]).toMatchObject({
      index: 2,
      status: 'wrong_answer',
      input: 'abc',
      expected: 'cba',
      actual: 'abc',
    })

    // The hidden column must never appear in the Run route's select list.
    const problemSelect = mock.state.selects.find((s) => s.table === 'dsa_problems')
    expect(problemSelect?.cols).not.toContain('test_cases')
    expect(problemSelect?.cols).toContain('examples')
  })

  it('maps a compile failure to compile_error and stops running further cases', async () => {
    let calls = 0
    mock.state.runCode = async () => (calls++, ok('', { compileOutput: 'error: nope', statusId: 6 }))
    const res = await runPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(body).toMatchObject({ verdict: 'compile_error', passed: 0, total: 1 })
    expect(body.cases[0].compile_output).toBe('error: nope')
    expect(calls).toBe(1)
  })

  it('reports a dead runner as 503 instead of a wrong answer', async () => {
    mock.state.runCode = async () => ({ ...ok(''), ok: false })
    const res = await runPOST(jsonRequest(validBody))

    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/judge is unavailable/i)
  })
})

describe('POST /api/compete/submit', () => {
  it('returns internal_error and writes no submission when the judge is down', async () => {
    mock.state.runCode = async () => ({ ...ok(''), ok: false })
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.verdict).toBe('internal_error')
    expect(mock.state.submissions).toHaveLength(0)
    expect(mock.state.rpcCalls.map((c) => c.fn)).not.toContain('reward_dsa_solve')
  })

  it('accepts a correct program, records it, and rewards the first solve', async () => {
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'secret-1' ? '1tnerces' : '2tnerces')
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(body).toMatchObject({ verdict: 'accepted', passed: 2, total: 2 })
    expect(body.cases.map((c: { status: string }) => c.status)).toEqual(['accepted', 'accepted'])
    expect(mock.state.submissions).toHaveLength(1)
    expect(mock.state.submissions[0]).toMatchObject({
      user_id: 'user-1',
      problem_id: 'p1',
      language: 'python',
      verdict: 'accepted',
      passed: 2,
      total: 2,
    })
    expect(mock.state.rpcCalls.map((c) => c.fn)).toContain('reward_dsa_solve')
  })

  it('reads hidden cases through the service client, never the user client', async () => {
    mock.state.runCode = async () => ok('x')
    await submitPOST(jsonRequest(validBody))

    const serviceRead = mock.state.selects.find((s) => s.service && s.cols.includes('test_cases'))
    expect(serviceRead).toBeTruthy()
    expect(mock.state.selects.filter((s) => !s.service).some((s) => s.cols.includes('test_cases'))).toBe(false)
  })

  it('rejects an unknown contest id instead of recording an unverifiable attempt', async () => {
    mock.state.runCode = async () => ok('x')
    const res = await submitPOST(jsonRequest({ ...validBody, contest_id: 'missing-contest' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatch(/contest not found/i)
    expect(mock.state.submissions).toHaveLength(0)
    expect(mock.state.rpcCalls.map((c) => c.fn)).not.toContain('reward_dsa_solve')
  })

  it('reports a failed submission write instead of a false success, and does not reward', async () => {
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'secret-1' ? '1tnerces' : '2tnerces')
    mock.state.insertError = 'permission denied for table dsa_submissions'
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/could not be saved/i)
    expect(mock.state.submissions).toHaveLength(0)
    expect(mock.state.rpcCalls.map((c) => c.fn)).not.toContain('reward_dsa_solve')
  })

  it('grades every hidden case and counts each pass, without exposing hidden inputs or outputs', async () => {
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'secret-2' ? 'WRONG' : '1tnerces')
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(body).toMatchObject({ verdict: 'wrong_answer', passed: 1, total: 2 })
    expect(JSON.stringify(body)).not.toContain('secret-2')
    // A later wrong answer must not stop the earlier cases from being graded.
    expect(body.cases).toEqual([
      { index: 1, status: 'accepted', passed: true, time_ms: 10 },
      { index: 2, status: 'wrong_answer', passed: false, time_ms: 10 },
    ])
    expect(JSON.stringify(body)).not.toContain('2tnerces')
    expect(mock.state.submissions[0]).toMatchObject({ verdict: 'wrong_answer', passed: 1 })
  })

  it('keeps grading after a runtime error so the remaining cases still count', async () => {
    mock.state.runCode = async ({ stdin }) =>
      stdin === 'secret-1' ? ok('', { stderr: 'Traceback', exitCode: 1 }) : ok('2tnerces')
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(body).toMatchObject({ verdict: 'runtime_error', passed: 1, total: 2 })
    expect(body.cases.map((c: { status: string }) => c.status)).toEqual(['runtime_error', 'accepted'])
  })

  it('appends the hidden driver on the server and stores only the student code', async () => {
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'secret-1' ? '1tnerces' : '2tnerces')
    const submitted = 'class Solution:\n    def reverseString(self, s):\n        return s[::-1]'
    await submitPOST(jsonRequest({ ...validBody, code: submitted }))

    const program = mock.state.codes[0]
    expect(program).toContain('def reverseString(self, s):')
    expect(program).toContain('_ctc_main()')
    expect(program).toContain('Solution().reverseString(*_args)')

    // The stored submission is the student's function only — no driver, no
    // hidden inputs. This is what the submissions tab shows back to them.
    expect(mock.state.submissions[0].code).toBe(submitted)
    expect(mock.state.submissions[0].code).not.toContain('_ctc_main')
  })

  it('leaves code untouched for a problem with no function contract', async () => {
    mock.state.problem = { ...mock.state.problem, starter_code: { python: 'print(1)' } }
    mock.state.runCode = async ({ stdin }) => ok(stdin === 'secret-1' ? '1tnerces' : '2tnerces')
    await submitPOST(jsonRequest(validBody))

    expect(mock.state.codes[0]).toBe(validBody.code)
  })

  it('records a compile error with its compiler output and stops', async () => {
    mock.state.runCode = async () => ok('', { compileOutput: 'main.py:1 syntax error', statusId: 6 })
    const res = await submitPOST(jsonRequest(validBody))
    const body = await res.json()

    expect(body).toMatchObject({ verdict: 'compile_error', compile_output: 'main.py:1 syntax error', passed: 0 })
    expect(body.cases).toHaveLength(1)
    expect(mock.state.submissions[0].verdict).toBe('compile_error')
  })

  it('enforces the per-problem submission cap before judging', async () => {
    mock.state.rateLimit = false
    const res = await submitPOST(jsonRequest(validBody))

    expect(res.status).toBe(429)
    expect(mock.state.submissions).toHaveLength(0)
  })
})

describe('GET /api/compete/judge/health', () => {
  it('reports ok when the runner answers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    const res = await healthGET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, provider: 'judge0', endpoint: 'http://judge.test' })
    expect(fetchSpy).toHaveBeenCalledWith('http://judge.test/languages', expect.anything())
    fetchSpy.mockRestore()
  })

  it('reports 503 when the runner is unreachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await healthGET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    fetchSpy.mockRestore()
  })
})
