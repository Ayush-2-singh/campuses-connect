import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/middleware'

/**
 * POST /api/notes/upload — anyone signed in can contribute Library material by LINK.
 *
 * The Library is community-owned (Phase 3): students add books / notes / PYQs /
 * links, edit and delete their own. Admins keep every power and their material
 * is published immediately; a student's contribution is stored unverified and
 * is visible to the contributor and to admins until an admin verifies it.
 * `is_verified` is decided here, from the caller's real grants — it is NEVER
 * read from the request body.
 *
 * There is deliberately no file-upload branch here. Resources are stored as a
 * reference to a link the contributor already hosts (Google Drive, YouTube,
 * Notion…) and the UI opens that link directly. Dropping the Supabase Storage
 * path also removes the largest and slowest failure mode on this route: a
 * storage createBucket/upload call whose errors surfaced to the client as an
 * opaque HTTP 500 after ~700ms, with the real cause only in the server log.
 * Academic PDFs stay on external storage (Google Drive / R2) — never in
 * Supabase Storage.
 */

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin
}

/** Only real web links are accepted — never `javascript:` or a bare path. */
function normaliseLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response
  const userId = auth.auth.userId
  // Any admin grant publishes immediately; a plain student goes to review.
  const isAdmin = auth.auth.adminTypes.length > 0

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error('[notes/upload] could not read form body:', err)
    return NextResponse.json({ error: 'Could not read the submission. Please try again.' }, { status: 400 })
  }

  const title = ((formData.get('title') as string) || '').trim()
  const subject = ((formData.get('subject') as string) || '').trim()
  const resourceType = (formData.get('resource_type') as string) || 'notes'
  const description = ((formData.get('description') as string) || '').trim()
  const driveLink = normaliseLink(formData.get('drive_link'))
  const externalLink = normaliseLink(formData.get('external_link'))
  const visibility = (formData.get('visibility') as string) || 'campus'
  // Optional attribution fields (book author, discussion category).
  const author = ((formData.get('author') as string) || '').trim() || null
  const discussCategory = ((formData.get('discuss_category') as string) || '').trim() || null

  if (!title || !subject) {
    return NextResponse.json({ error: 'Title and subject are required.' }, { status: 400 })
  }

  const link = driveLink || externalLink
  if (!link) {
    return NextResponse.json(
      { error: 'A valid link is required (Google Drive, YouTube, Notion, etc.).' },
      { status: 400 }
    )
  }

  const admin = getSupabaseAdmin()

  // Scope the note to the poster's own campus/college/department.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('campus_id, college_id, department_id')
    .eq('id', userId)
    .single()

  if (profileError) {
    console.error('[notes/upload] profile lookup failed:', profileError.message)
    return NextResponse.json({ error: `Could not load your profile: ${profileError.message}` }, { status: 500 })
  }

  const { data: noteRow, error: insertError } = await admin
    .from('notes')
    .insert({
      uploaded_by: userId,
      campus_id: profile?.campus_id || null,
      college_id: profile?.college_id || null,
      department_id: profile?.department_id || null,
      title,
      subject,
      resource_type: resourceType,
      description: description || null,
      drive_link: driveLink,
      external_link: externalLink,
      storage_provider: 'link',
      external_file_url: link,
      external_file_id: null,
      file_size: null,
      mime_type: null,
      author,
      discuss_category: discussCategory,
      visibility: profile?.campus_id ? visibility : 'global',
      // Admins publish immediately; students wait in the moderation queue.
      // Derived from real grants above, not from the request.
      is_verified: isAdmin,
      verified_by: isAdmin ? userId : null,
      verified_at: isAdmin ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[notes/upload] insert failed:', insertError.message)
    return NextResponse.json({ error: `Could not save the note: ${insertError.message}` }, { status: 500 })
  }

  try {
    await admin.rpc('reward_note_upload', { p_note_id: noteRow?.id })
  } catch (err) {
    console.warn('[notes/upload] reward_note_upload failed:', err)
  }

  return NextResponse.json({
    success: true,
    note_id: noteRow?.id,
    storage_provider: 'link',
    is_verified: isAdmin,
    message: isAdmin
      ? 'Material posted!'
      : 'Thanks! Your resource is pending admin review and will appear in the Library shortly.',
  })
}
