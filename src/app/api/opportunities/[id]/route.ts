/**
 * PUT    /api/opportunities/:id  — admin only
 * DELETE /api/opportunities/:id  — admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/middleware'

// ─── PUT /api/opportunities/:id ───────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdmin()
  if (!authResult.ok) return authResult.response

  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing opportunity id.' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // Whitelist updatable fields — schema stays identical
  const allowed = [
    'title', 'description', 'opp_type', 'company_org',
    'apply_link', 'deadline', 'is_paid', 'stipend_range',
    'location_type', 'skills_required', 'is_active',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = key === 'skills_required'
      ? (Array.isArray(body[key]) ? body[key].map(String).filter(Boolean).slice(0, 12) : null)
      : body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 422 })
  }

  if ('title' in updates && (!updates.title || typeof updates.title !== 'string' || !(updates.title as string).trim())) {
    return NextResponse.json({ error: 'title cannot be empty.' }, { status: 422 })
  }

  const supabase = await createClient()

  // Confirm the opportunity exists
  const { data: existing, error: fetchError } = await supabase
    .from('opportunities')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('opportunities')
    .update(updates)
    .eq('id', id)
    .select('*, profiles(full_name, username)')
    .single()

  if (error) {
    console.error('[PUT /api/opportunities/:id]', error.message)
    return NextResponse.json({ error: 'Failed to update opportunity.' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ─── DELETE /api/opportunities/:id ────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdmin()
  if (!authResult.ok) return authResult.response

  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing opportunity id.' }, { status: 400 })
  }

  const supabase = await createClient()

  // Confirm the opportunity exists before attempting delete
  const { data: existing, error: fetchError } = await supabase
    .from('opportunities')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/opportunities/:id]', error.message)
    return NextResponse.json({ error: 'Failed to delete opportunity.' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Opportunity deleted.' }, { status: 200 })
}
