import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { POST } from '@/app/api/admin/batches/route'

/**
 * POST /api/admin/batches — assemble a recruiter shortlist.
 *
 * Promises guarded: admin-only; at least one student; a cap of 50; the batch
 * row and its students are written together, and a failed student insert
 * rolls the empty batch back so nothing half-built is left behind.
 */

const admin: any = { from: vi.fn() }
vi.mock('@/lib/auth', () => ({ getSupabaseAdmin: () => admin }))

let requireAdminMock: any
vi.mock('@/lib/api/middleware', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(requireAdminMock)),
}))

let insertSingle: ReturnType<typeof vi.fn>
let studentsInsert: ReturnType<typeof vi.fn>
let deleteEq: ReturnType<typeof vi.fn>

function wire(opts: { batchError?: any; studentsError?: any } = {}) {
  insertSingle = vi.fn(async () =>
    opts.batchError ? { data: null, error: opts.batchError } : { data: { id: 'batch-1', token: 'abc123' }, error: null }
  )
  studentsInsert = vi.fn(async () => ({ error: opts.studentsError ?? null }))
  deleteEq = vi.fn(async () => ({ error: null }))

  admin.from.mockImplementation((table: string) => {
    if (table === 'batches') {
      return {
        insert: () => ({ select: () => ({ single: insertSingle }) }),
        delete: () => ({ eq: deleteEq }),
      }
    }
    if (table === 'batch_students') return { insert: studentsInsert }
    return {}
  })
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/batches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wire()
    requireAdminMock = { ok: true, auth: { userId: 'admin-1', profile: { id: 'admin-1' } } }
  })

  it('rejects a non-admin caller', async () => {
    requireAdminMock = {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 }),
    }
    const res = await POST(req({ user_ids: ['u1'] }))
    expect(res.status).toBe(403)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('rejects an empty selection with 422', async () => {
    const res = await POST(req({ user_ids: [] }))
    expect(res.status).toBe(422)
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('rejects more than 50 students with 422', async () => {
    const user_ids = Array.from({ length: 51 }, (_, i) => `u${i}`)
    const res = await POST(req({ user_ids }))
    expect(res.status).toBe(422)
  })

  it('creates a batch and returns its token', async () => {
    const res = await POST(req({ lead_id: 'lead-1', user_ids: ['u1', 'u2'] }))
    expect(res.status).toBe(201)
    const json = (await res.json()) as { ok: boolean; token: string }
    expect(json.ok).toBe(true)
    expect(json.token).toBe('abc123')
    // students written with positions
    const rows = studentsInsert.mock.calls[0][0] as Array<{ position: number }>
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.position)).toEqual([0, 1])
  })

  it('dedupes repeated student ids', async () => {
    await POST(req({ user_ids: ['u1', 'u1', 'u2'] }))
    const rows = studentsInsert.mock.calls[0][0] as Array<unknown>
    expect(rows).toHaveLength(2)
  })

  it('rolls the batch back when the student insert fails', async () => {
    wire({ studentsError: { message: 'boom' } })
    const res = await POST(req({ user_ids: ['u1'] }))
    expect(res.status).toBe(500)
    expect(deleteEq).toHaveBeenCalledWith('id', 'batch-1')
  })
})
