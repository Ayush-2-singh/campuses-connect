import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireAdmin } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * /api/admin/batches — assemble and list recruiter shortlists (admin only).
 *
 *   GET   list batches with their lead + student count
 *   POST  create a batch from selected students → returns its share token
 */

const MAX_STUDENTS = 50

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('batches')
    .select('id, token, title, status, lead_id, created_at, hire_leads(company), batch_students(user_id)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[batches] list failed:', error.message)
    return NextResponse.json({ error: 'Failed to load batches.' }, { status: 500 })
  }

  const batches = (data || []).map((b: any) => ({
    id: b.id,
    token: b.token,
    title: b.title,
    status: b.status,
    lead_id: b.lead_id,
    company: b.hire_leads?.company ?? null,
    student_count: Array.isArray(b.batch_students) ? b.batch_students.length : 0,
    created_at: b.created_at,
  }))

  return NextResponse.json({ batches })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const lead_id = typeof body?.lead_id === 'string' ? body.lead_id : null
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 160) : null
  const rawIds: unknown = body?.user_ids
  const user_ids: string[] = Array.isArray(rawIds)
    ? [...new Set<string>(rawIds.filter((v): v is string => typeof v === 'string'))]
    : []

  if (user_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one student.' }, { status: 422 })
  }
  if (user_ids.length > MAX_STUDENTS) {
    return NextResponse.json({ error: `A batch can hold at most ${MAX_STUDENTS} students.` }, { status: 422 })
  }

  const admin = getSupabaseAdmin()
  const token = randomBytes(16).toString('hex')

  const { data: batch, error: batchError } = await admin
    .from('batches')
    .insert({ lead_id, title, token, created_by: auth.auth.userId, status: 'draft' })
    .select('id, token')
    .single()

  if (batchError || !batch) {
    console.error('[batches] insert failed:', batchError?.message)
    return NextResponse.json({ error: 'Could not create the batch.' }, { status: 500 })
  }

  const rows = user_ids.map((user_id, index) => ({ batch_id: batch.id, user_id, position: index }))
  const { error: studentsError } = await admin.from('batch_students').insert(rows)

  if (studentsError) {
    console.error('[batches] students insert failed:', studentsError.message)
    // Roll back the empty batch so a failed create leaves nothing behind.
    await admin.from('batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: 'Could not add students to the batch.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: batch.id, token: batch.token }, { status: 201 })
}
