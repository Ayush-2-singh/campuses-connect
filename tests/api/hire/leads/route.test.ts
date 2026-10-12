import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { GET, POST } from '@/app/api/hire/leads/route'

/**
 * /api/hire/leads — the concierge MVP's capture endpoint.
 *
 * Promises guarded here:
 *   1. the public POST validates and normalizes input, and swallows bots via
 *      the honeypot WITHOUT touching the database;
 *   2. anonymous/unauthorized callers can never read the lead pipeline;
 *   3. the GET is admin-only.
 */

const adminClient: any = { from: vi.fn() }
let insertSingle: ReturnType<typeof vi.fn>
let listLimit: ReturnType<typeof vi.fn>
let insertedPayload: any

vi.mock('@/lib/auth', () => ({ getSupabaseAdmin: () => adminClient }))

let requireAdminMock: any
vi.mock('@/lib/api/middleware', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(requireAdminMock)),
}))

function wireAdmin() {
  insertedPayload = undefined
  insertSingle = vi.fn(async () => ({ data: { id: 'lead-1' }, error: null }))
  listLimit = vi.fn(async () => ({ data: [{ id: 'lead-1', company: 'Acme' }], error: null }))
  adminClient.from.mockImplementation(() => ({
    insert: (payload: any) => {
      insertedPayload = payload
      return { select: () => ({ single: insertSingle }) }
    },
    select: () => ({ order: () => ({ limit: listLimit }) }),
  }))
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/hire/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID = {
  company: 'Acme',
  contact_name: 'Ada Lovelace',
  email: 'Ada@Acme.com',
  role_title: 'Backend Engineer',
  positions: 3,
}

describe('POST /api/hire/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireAdmin()
  })

  it('saves a valid lead and returns 201', async () => {
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(201)
    const json = (await res.json()) as { ok: boolean; lead_id: string }
    expect(json.ok).toBe(true)
    expect(json.lead_id).toBe('lead-1')
    expect(insertedPayload.company).toBe('Acme')
    expect(insertedPayload.source).toBe('hire_page')
  })

  it('normalizes the email to lowercase', async () => {
    await POST(postRequest(VALID))
    expect(insertedPayload.email).toBe('ada@acme.com')
  })

  it('clamps positions to a sane range', async () => {
    await POST(postRequest({ ...VALID, positions: 5000 }))
    expect(insertedPayload.positions).toBe(1000)
  })

  it('rejects a missing required field with 422', async () => {
    const res = await POST(postRequest({ ...VALID, role_title: '' }))
    expect(res.status).toBe(422)
    expect(adminClient.from).not.toHaveBeenCalled()
  })

  it('rejects an invalid email with 422', async () => {
    const res = await POST(postRequest({ ...VALID, email: 'not-an-email' }))
    expect(res.status).toBe(422)
    expect(adminClient.from).not.toHaveBeenCalled()
  })

  it('swallows a bot that fills the honeypot — no DB write', async () => {
    const res = await POST(postRequest({ ...VALID, website: 'http://spam.example' }))
    expect(res.status).toBe(201)
    expect(adminClient.from).not.toHaveBeenCalled()
  })

  it('rejects a malformed JSON body with 400', async () => {
    const req = new NextRequest('http://localhost/api/hire/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/hire/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireAdmin()
  })

  it('returns 403 for a non-admin caller and never reads the table', async () => {
    requireAdminMock = {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 }),
    }
    const res = await GET(new NextRequest('http://localhost/api/hire/leads'))
    expect(res.status).toBe(403)
    expect(adminClient.from).not.toHaveBeenCalled()
  })

  it('returns the lead pipeline for an admin', async () => {
    requireAdminMock = { ok: true, auth: { userId: 'admin-1', profile: { id: 'admin-1' } } }
    const res = await GET(new NextRequest('http://localhost/api/hire/leads'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { leads: any[] }
    expect(json.leads).toHaveLength(1)
  })
})
