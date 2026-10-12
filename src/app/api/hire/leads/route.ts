import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * /api/hire/leads — recruiter demo-batch requests (Phase 1 concierge MVP).
 *
 *   POST  public  — the /hire form posts here. Writes use the service-role
 *                   client so no public RLS policy is needed. A hidden
 *                   honeypot field swallows bots without telling them.
 *   GET   admin   — the operator reads the pipeline (new → hired).
 *
 * Field caps keep a hostile payload from bloating a row; the DB write is the
 * only side effect, so there is nothing to clean up on rejection.
 */

const MAX = {
  company: 120,
  contact_name: 120,
  email: 160,
  role_title: 120,
  notes: 1000,
} as const

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // Honeypot: real users never see or fill this field.
  if (clean(body?.website, 200)) {
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  const company = clean(body?.company, MAX.company)
  const contact_name = clean(body?.contact_name, MAX.contact_name)
  const email = clean(body?.email, MAX.email).toLowerCase()
  const role_title = clean(body?.role_title, MAX.role_title)
  const notes = clean(body?.notes, MAX.notes)
  const rawPositions = Number(body?.positions)
  const positions = Number.isFinite(rawPositions) ? Math.max(1, Math.min(1000, Math.trunc(rawPositions))) : null

  if (!company || !contact_name || !email || !role_title) {
    return NextResponse.json({ error: 'company, contact_name, email and role_title are required.' }, { status: 422 })
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid work email.' }, { status: 422 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('hire_leads')
    .insert({
      company,
      contact_name,
      email,
      role_title,
      positions,
      notes: notes || null,
      source: 'hire_page',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[hire-leads] insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, lead_id: data?.id ?? null }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('hire_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[hire-leads] list failed:', error.message)
    return NextResponse.json({ error: 'Failed to load leads.' }, { status: 500 })
  }

  return NextResponse.json({ leads: data || [] })
}

const LEAD_STATUSES = ['new', 'contacted', 'batch_sent', 'hired', 'closed'] as const

/** PATCH /api/hire/leads — move a lead through the pipeline (admin only). */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { id?: unknown; status?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  if (!id || !(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'id and a valid status are required.' }, { status: 422 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('hire_leads').update({ status }).eq('id', id)
  if (error) {
    console.error('[hire-leads] status update failed:', error.message)
    return NextResponse.json({ error: 'Failed to update lead.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
