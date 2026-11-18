import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/compete/daily/ensure — top up the Daily Challenge schedule.
 *
 * The scheduler itself lives in `ensure_daily_challenge(days)`: deterministic,
 * idempotent, and safe to call as often as you like. This route exists so an
 * external cron can keep a rolling 30-day window filled without a user ever
 * opening the tab. The page also calls the RPC when today has no resolvable
 * problem, so a project with no cron configured still never shows an empty
 * Daily Challenge.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set (the
 * shape Vercel Cron sends); otherwise a signed-in user is required, which keeps
 * the endpoint from being an anonymous write surface.
 *
 * `?days=` is clamped to 1..120 by the function itself.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (secret) {
    const provided = request.headers.get('authorization') || ''
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = Number(new URL(request.url).searchParams.get('days') ?? 30)
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 120) : 30

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.rpc('ensure_daily_challenge', { p_days: days })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
