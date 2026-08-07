import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/verify-college-email
 * Body: { token }
 * Verifies the college email linked to the token and marks the profile verified.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { token } = await request.json().catch(() => ({ token: '' }))

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
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

  // Mark token used
  await supabase.from('college_email_verifications').update({ used_at: new Date().toISOString() }).eq('id', ver.id)

  // Verify profile (is_verified requires verification; status change guarded by RLS)
  const { error: updateError } = await supabase
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
