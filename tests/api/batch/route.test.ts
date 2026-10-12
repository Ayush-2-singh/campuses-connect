import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/batch/[token]/route'

/**
 * GET /api/batch/[token] — the public recruiter shortlist.
 *
 * Promises guarded: unknown/short tokens 404; a known token returns the batch
 * with candidate cards in position order, exposing only recruiter-safe fields
 * (no email, no private data).
 */

const admin: any = { from: vi.fn() }
vi.mock('@/lib/auth', () => ({ getSupabaseAdmin: () => admin }))

const results: Record<string, any> = {}

// A chainable, awaitable query builder: eq/in/order/select all return itself,
// and `await builder` resolves to the per-table result.
function builder(result: any) {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    maybeSingle: async () => result,
    then: (resolve: any) => resolve(result),
  }
  return b
}

function wire(overrides: Record<string, any> = {}) {
  Object.assign(results, {
    batches: {
      data: { id: 'batch-1', title: 'Acme — Backend', status: 'sent', created_at: '2026-01-01' },
      error: null,
    },
    batch_students: {
      data: [
        { user_id: 'u1', position: 0 },
        { user_id: 'u2', position: 1 },
      ],
      error: null,
    },
    profiles: {
      data: [
        {
          id: 'u1',
          full_name: 'Ada',
          username: 'ada',
          avatar_url: null,
          headline: 'Backend',
          skills: ['node'],
          college_id: 'c1',
        },
        { id: 'u2', full_name: 'Bob', username: 'bob', avatar_url: null, headline: null, skills: [], college_id: null },
      ],
      error: null,
    },
    integration_stats: {
      data: [
        { user_id: 'u1', platform: 'github', stats: { total_contributions: 420 } },
        { user_id: 'u1', platform: 'leetcode', stats: { total_solved: 310, rating: 1800 } },
      ],
      error: null,
    },
    colleges: { data: [{ id: 'c1', name: 'Tier Two Institute' }], error: null },
    ...overrides,
  })
  admin.from.mockImplementation((table: string) => builder(results[table] ?? { data: [], error: null }))
}

function call(token: string) {
  return GET(new NextRequest(`http://localhost/api/batch/${token}`), {
    params: Promise.resolve({ token }),
  })
}

describe('GET /api/batch/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wire()
  })

  it('404s a short/invalid token without touching the DB', async () => {
    const res = await call('short')
    expect(res.status).toBe(404)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('404s an unknown token', async () => {
    wire({ batches: { data: null, error: null } })
    const res = await call('0123456789abcdef0123456789abcdef')
    expect(res.status).toBe(404)
  })

  it('returns candidates in position order with recruiter-safe fields', async () => {
    const res = await call('0123456789abcdef0123456789abcdef')
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.candidates).toHaveLength(2)
    expect(json.candidates[0].full_name).toBe('Ada')
    expect(json.candidates[1].full_name).toBe('Bob')
    // verified skill signals merged from integration_stats
    expect(json.candidates[0].github_contributions).toBe(420)
    expect(json.candidates[0].leetcode_solved).toBe(310)
    expect(json.candidates[0].leetcode_rating).toBe(1800)
    expect(json.candidates[0].college).toBe('Tier Two Institute')
    // never leaks private fields
    expect(json.candidates[0]).not.toHaveProperty('email')
    expect(json.candidates[0]).not.toHaveProperty('college_id')
  })

  it('returns an empty candidate list for an empty batch', async () => {
    wire({ batch_students: { data: [], error: null } })
    const res = await call('0123456789abcdef0123456789abcdef')
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.candidates).toEqual([])
  })
})
