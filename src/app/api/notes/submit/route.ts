import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Service-role client (bypasses RLS, always available) ─────
let _supabaseAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

/**
 * Extract the authenticated user from cookies using the service-role client.
 *
 * Why service-role? The middleware does fire-and-forget getUser() on public
 * routes, so the session refresh may not have completed by the time this
 * route handler runs. The browser's httpOnly cookies still carry a valid
 * access_token — we just need to verify it. The service-role client can call
 * auth.getUser(token) to validate any access token directly.
 */
async function getVerifiedUser(request: NextRequest) {
  // 1. Find the auth cookie — @supabase/ssr stores it as sb-<ref>-auth-token
  //    (may be chunked as .0, .1, etc.)
  const allCookies = request.cookies.getAll()
  const tokenCookie = allCookies.find((c) => c.name.match(/^sb-.*-auth-token$/))
  if (!tokenCookie) return null

  // 2. Parse the JSON session blob
  let accessToken: string | undefined
  try {
    const parsed = JSON.parse(decodeURIComponent(tokenCookie.value))
    accessToken = parsed.access_token
  } catch {
    // Cookie might be base64url-encoded or stored as plain access_token
    // Try using the raw value as the access token directly
    accessToken = tokenCookie.value
  }
  if (!accessToken) return null

  // 3. Verify via service-role client (works even if anon key is bad)
  const admin = getSupabaseAdmin()
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

export async function POST(request: NextRequest) {
  // ── Verify caller is authenticated ──────────────────────
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────
  const body = await request.json()
  const {
    title,
    subject,
    resource_type = 'notes',
    description = '',
    drive_link = null,
    external_link = null,
    visibility = 'campus',
  } = body

  if (!title?.trim() || !subject?.trim()) {
    return NextResponse.json({ error: 'Title and subject are required' }, { status: 400 })
  }

  // ── Get user profile for campus/college context ─────────
  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('campus_id, college_id, department_id')
    .eq('id', user.id)
    .single()

  // ── Check if user is admin (auto-verify) ────────────────
  const { data: grants } = await admin.rpc('my_admin_grants')
  const grantsArr = (grants as any[]) || []
  const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')

  // ── Insert note using service role (bypasses RLS) ───────
  const { data: noteRow, error: insertError } = await admin
    .from('notes')
    .insert({
      uploaded_by: user.id,
      campus_id: profile?.campus_id || null,
      college_id: profile?.college_id || null,
      department_id: profile?.department_id || null,
      title: title.trim(),
      subject: subject.trim(),
      resource_type,
      description: description || null,
      drive_link: drive_link || null,
      external_link: external_link || null,
      visibility: profile?.campus_id ? visibility : 'global',
      is_verified: isAdmin,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Reward upload (best-effort) ─────────────────────────
  try {
    await admin.rpc('reward_note_upload', { p_note_id: noteRow?.id })
  } catch {
    // ignore — reward is optional
  }

  return NextResponse.json({
    success: true,
    note_id: noteRow?.id,
    is_verified: isAdmin,
    message: isAdmin ? 'Note uploaded and auto-verified!' : 'Note submitted! It will be visible after admin review.',
  })
}
