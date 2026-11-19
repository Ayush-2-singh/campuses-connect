// ═══════════════════════════════════════════════════════════════════════════
// Judge core — one runner shared by /api/compete/run and
// /api/compete/submit, plus the output comparison used by both.
//
// BACKEND: Judge0 (https://github.com/judge0/judge0). Piston's public API went
// whitelist-only in Feb 2026 and now answers 401 to everyone, so it can no
// longer be the zero-config judge. Judge0 CE's demo endpoint still accepts
// anonymous submissions and — unlike Piston — reports distinct status codes
// for Accepted / Wrong Answer / TLE / Compile Error / Runtime Error.
//
// For production, self-host Judge0 and set JUDGE0_URL (and JUDGE0_API_KEY if
// your instance requires one). Nothing else in the app needs to change.
//
// CONTRACT (CodeChef-style): the program reads stdin and prints stdout.
// This module never sees hidden test cases; callers decide what to feed and
// what may be returned to the browser.
// ═══════════════════════════════════════════════════════════════════════════

export const JUDGE0_URL = (process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '')
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || ''

export const LANG_MAP: Record<string, { language: string; id: number }> = {
  python: { language: 'Python', id: 71 }, // Python 3.8.1
  javascript: { language: 'JavaScript', id: 63 }, // Node.js 12.14.0
  cpp: { language: 'C++', id: 54 }, // GCC 9.2.0
  java: { language: 'Java', id: 62 }, // OpenJDK 13.0.1
}

/** Verdicts the database accepts. `internal_error` is never persisted. */
export type StoredVerdict = 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error' | 'compile_error'
export type Verdict = StoredVerdict | 'internal_error'

export type PistonRun = {
  ok: boolean
  stdout: string
  stderr: string
  compileOutput: string
  exitCode: number
  timeMs: number
  timedOut: boolean
  statusId: number | null
}

const MAX_COMPILE_OUTPUT = 4000
const MAX_STDERR = 4000

// Judge0 status ids (subset we act on).
// 1 In Queue · 2 Processing · 3 Accepted · 4 Wrong Answer · 5 TLE
// 6 Compilation Error · 7–12 Runtime errors · 13 Internal Error · 14 Exec Format Error
const STATUS_ACCEPTED = 3
const STATUS_TLE = 5
const STATUS_COMPILE_ERROR = 6
const STATUS_INTERNAL = 13
const STATUS_EXEC_FORMAT = 14

function failed(): PistonRun {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    compileOutput: '',
    exitCode: 0,
    timeMs: 0,
    timedOut: false,
    statusId: null,
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (JUDGE0_API_KEY) h['X-Auth-Token'] = JUDGE0_API_KEY
  return h
}

type Judge0Submission = {
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  message?: string | null
  time?: string | null
  token?: string
  status?: { id?: number; description?: string }
}

async function poll(token: string): Promise<Judge0Submission | null> {
  // `wait=true` usually blocks until the run finishes, but a busy queue can
  // return "In Queue"/"Processing". Poll briefly rather than reporting a
  // bogus verdict for a run that is still going.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 700))
    try {
      const res = await fetch(`${JUDGE0_URL}/submissions/${token}?base64_encoded=true`, {
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return null
      const data = (await res.json()) as Judge0Submission
      const id = data.status?.id ?? 0
      if (id !== 1 && id !== 2) return data
    } catch {
      return null
    }
  }
  return null
}

function decode(value?: string | null): string {
  if (!value) return ''
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function normalizeJson(data: Judge0Submission): PistonRun {
  const statusId = data.status?.id ?? null

  if (statusId === STATUS_INTERNAL || statusId === STATUS_EXEC_FORMAT) return failed()

  const rawTime = typeof data.time === 'string' ? parseFloat(data.time) : NaN
  const timeMs = Number.isFinite(rawTime) ? Math.max(1, Math.round(rawTime * 1000)) : 1

  return {
    ok: true,
    stdout: decode(data.stdout),
    stderr: (decode(data.stderr) || decode(data.message)).slice(0, MAX_STDERR),
    compileOutput: decode(data.compile_output).slice(0, MAX_COMPILE_OUTPUT),
    exitCode: statusId !== null && statusId >= 7 && statusId <= 12 ? 1 : 0,
    timeMs,
    timedOut: statusId === STATUS_TLE,
    statusId,
  }
}

/**
 * Run one program once. Transport/HTTP failures return `ok: false` so the
 * caller can say "judge unavailable" instead of blaming the student's code.
 */
export async function runCode(args: {
  language: string
  code: string
  stdin: string
  timeLimitMs: number
}): Promise<PistonRun> {
  const lang = LANG_MAP[args.language]
  if (!lang) return failed()

  const seconds = Math.max(1, Math.round(args.timeLimitMs / 100) / 10)

  try {
    // base64 mode: Judge0 rejects some plain-text submissions with a UTF-8
    // conversion error, and it also keeps non-ASCII source safe.
    const res = await fetch(`${JUDGE0_URL}/submissions?wait=true&base64_encoded=true`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        source_code: Buffer.from(args.code, 'utf8').toString('base64'),
        language_id: lang.id,
        stdin: Buffer.from(args.stdin, 'utf8').toString('base64'),
        cpu_time_limit: seconds,
        wall_time_limit: Math.max(5, Math.ceil(seconds) + 3),
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) return failed()
    const body = (await res.json()) as Judge0Submission | { token?: string }

    // Some deployments answer `wait=true` with only a token.
    if (!('status' in body) || !body.status) {
      const token = (body as { token?: string }).token
      if (!token) return failed()
      const polled = await poll(token)
      return polled ? normalizeJson(polled) : failed()
    }

    const id = body.status?.id ?? 0
    if (id === 1 || id === 2) {
      const token = body.token
      if (!token) return failed()
      const polled = await poll(token)
      return polled ? normalizeJson(polled) : failed()
    }

    return normalizeJson(body as Judge0Submission)
  } catch {
    return failed()
  }
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

/**
 * Compare stdout with the expected answer. Whitespace-insensitive, float
 * tolerant, and JSON-aware so `[0,1]` and `[0, 1]` both pass.
 */
export function outputsMatch(actual: string, expected: string): boolean {
  const a = normalize(actual)
  const b = normalize(expected)
  if (a === b) return true

  const fa = parseFloat(a)
  const fb = parseFloat(b)
  if (!isNaN(fa) && !isNaN(fb) && Math.abs(fa - fb) < 1e-4) return true

  try {
    return deepEqual(JSON.parse(a), JSON.parse(b))
  } catch {
    return false
  }
}

// ─── Run throttle (per warm server instance) ───────────────────────────────
// Submissions have a database-backed 12/hour cap. Runs are cheaper but can be
// spammed, so they get a small in-memory window. A cold instance resets it,
// which is acceptable for a convenience endpoint that writes nothing.
const runHits = new Map<string, number[]>()

export function allowRun(userId: string, limit = 40, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (runHits.get(userId) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    runHits.set(userId, recent)
    return false
  }
  recent.push(now)
  runHits.set(userId, recent)
  return true
}

export { STATUS_ACCEPTED, STATUS_TLE, STATUS_COMPILE_ERROR }
