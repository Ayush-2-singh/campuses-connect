import { NextResponse } from 'next/server'
import { JUDGE0_URL } from '@/lib/compete/judge'

// ─── Judge health ──────────────────────────────────────────────────────────
// A cheap reachability probe, not a real submission: fetching the runtime list
// proves the runner answers without spending a judging slot. The workspace
// uses this to show a banner instead of letting a dead judge look like a
// student's wrong answer.

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()

  const body = (ok: boolean) => ({
    ok,
    provider: 'judge0',
    endpoint: JUDGE0_URL,
    latency_ms: Date.now() - started,
    checked_at: new Date().toISOString(),
  })

  try {
    const res = await fetch(`${JUDGE0_URL}/languages`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    return NextResponse.json(body(res.ok), { status: res.ok ? 200 : 503 })
  } catch {
    return NextResponse.json(body(false), { status: 503 })
  }
}
