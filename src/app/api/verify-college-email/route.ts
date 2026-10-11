import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

/**
 * POST /api/verify-college-email
 * Body: { token }
 * Verifies the college email linked to the token and marks the profile verified.
 *
 * The token lookup runs on the CALLER's client, so RLS scopes it to their
 * own pending tokens — a stranger guessing tokens reads nothing. The final
 * writes run on the service role: the profiles privilege guard (migration
 * 20261012) only lets moderators or trusted server code move is_verified.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { token } = await request.json().catch(() => ({ token: '' }))

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Rate limit token guesses — 10/hour, generous for a single link click.
  if (user && !(await checkRateLimit(user.id, 'verify:college-email', 10, 60))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })
  }

  const { data: ver, error } = await supabase
    .from('college_email_verifications')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !ver) {
    return NextResponse.json({ error: 'Invalid verification link' }, { status: 400 })
  }
  if (ver.used_at) {
    return NextResponse.json({ error: 'Link already used' }, { status: 400 })
  }
  if (new Date(ver.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 400 })
  }

  // Mark token used (service role: single-use links must not depend on an
  // UPDATE policy existing for the caller).
  const admin = getSupabaseAdmin()
  await admin.from('college_email_verifications').update({ used_at: new Date().toISOString() }).eq('id', ver.id)

  // Verify profile — service role, because the profiles privilege guard
  // (20261012) only allows moderators or server code to move is_verified.
  const { error: updateError } = await admin
    .from('profiles')
    .update({ college_email: ver.email, college_email_verified: true, is_verified: true })
    .eq('id', ver.user_id)

  if (updateError) {
    return NextResponse.json(
      { error: 'Could not verify — sign in with the account that requested this link, then open it again' },
      { status: 403 }
    )
  }

  await supabase.rpc('log_audit', {
    p_action: 'college_email_verified',
    p_entity_type: 'profile',
    p_entity_id: ver.user_id,
    p_metadata: { email: ver.email },
  })

  return NextResponse.json({ ok: true })
}
