import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/auth'
import { requireAdmin } from '@/lib/api/middleware'

export async function POST(request: NextRequest) {
  // ── Verify caller is an admin ───────────────────────────
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const user = { id: auth.auth.userId } as any

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
    const admin = getSupabaseAdmin()

    // ── Get user profile for campus/college context ─────────
    const { data: profile } = await admin
      .from('profiles')
      .select('campus_id, college_id, department_id')
      .eq('id', user.id)
      .single()

    // requireAdmin already verified admin status — auto-verify the note
    const isAdmin = true

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
    } catch {}

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
