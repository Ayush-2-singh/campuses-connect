import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Server-side client with service role — bypasses RLS.
// Lazy, request-time init — module-scope createClient() throws at build when
// SUPABASE_SERVICE_ROLE_KEY is absent, and a shared client risks cross-user state.
let _supabaseAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

/** Build an SSR-aware server client from request cookies (not next/headers). */
function createSSRClient(request: NextRequest) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {
        // Route handlers cannot set cookies on the request — ignore.
        // The middleware handles session refresh via response cookies.
      },
    },
  })
}

export async function POST(request: NextRequest) {
  // ── Verify caller is authenticated ──────────────────────
  // Read cookies directly from request (not cookies() from next/headers)
  // because the middleware's fire-and-forget getUser() may not have completed.
  const supabase = createSSRClient(request)

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const user = authUser

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
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('campus_id, college_id, department_id')
    .eq('id', user.id)
    .single()

  // ── Check if user is admin (auto-verify) ────────────────
  const { data: grants } = await getSupabaseAdmin().rpc('my_admin_grants')
  const grantsArr = (grants as any[]) || []
  const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')

  // ── Insert note using service role (bypasses RLS) ───────
  const { data: noteRow, error: insertError } = await getSupabaseAdmin()
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
      // Admin uploads are auto-verified; user submissions need review
      is_verified: isAdmin,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Reward upload (best-effort) ─────────────────────────
  try {
    await getSupabaseAdmin().rpc('reward_note_upload', { p_note_id: noteRow?.id })
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
