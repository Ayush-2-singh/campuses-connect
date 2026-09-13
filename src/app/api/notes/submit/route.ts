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
 * Extract the authenticated user from cookies.
 *
 * Tries multiple strategies:
 *   1. Find sb-<ref>-auth-token cookie → parse JSON → get access_token
 *   2. Find any sb-*-auth-token cookie → try raw value as token
 *   3. Use the service-role client's getUser with the token
 */
async function getVerifiedUser(request: NextRequest) {
  try {
    const allCookies = request.cookies.getAll()

    // Strategy 1: Find the auth token cookie (may be chunked)
    const authCookie = allCookies.find((c) => c.name.match(/^sb-.*-auth-token$/))

    if (!authCookie) {
      console.error(
        '[notes/submit] No auth cookie found. Cookies:',
        allCookies.map((c) => c.name)
      )
      return null
    }

    let accessToken: string | undefined

    // Strategy 1a: Parse as JSON (standard @supabase/ssr format)
    try {
      const decoded = decodeURIComponent(authCookie.value)
      const parsed = JSON.parse(decoded)
      accessToken = parsed.access_token
    } catch {
      // Strategy 1b: Cookie value IS the access token (some setups)
      accessToken = authCookie.value
    }

    if (!accessToken) {
      console.error('[notes/submit] No access_token in cookie. Value preview:', authCookie.value.slice(0, 50))
      return null
    }

    // Verify via service-role client
    const admin = getSupabaseAdmin()
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(accessToken)

    if (error) {
      console.error('[notes/submit] getUser failed:', error.message)
      return null
    }

    return user
  } catch (err) {
    console.error('[notes/submit] getVerifiedUser error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  // ── Verify caller is authenticated ──────────────────────
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

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

  try {
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
      console.error('[notes/submit] Insert error:', insertError.message)
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
  } catch (err) {
    console.error('[notes/submit] Unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
