import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/colleges/search/route'

type SupabaseBuilder = {
  select: (q: string) => SupabaseBuilder
  eq: (k: string, v: unknown) => SupabaseBuilder
  ilike: (k: string, v: string) => SupabaseBuilder
  limit: (n: number) => SupabaseBuilder
  order: (k: string) => Promise<{ data: any; error: any }>
}

interface MockSupabase {
  from: ReturnType<typeof vi.fn>
}

let mockSupabase: MockSupabase
let orderFn: Mock<() => Promise<{ data: any; error: any }>>

const createMockSupabase = (): MockSupabase => {
  const filters: Array<{ key: string; value: unknown }> = []
  let limitVal: number | undefined

  const builder: SupabaseBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn((key, value) => {
      filters.push({ key, value })
      return builder
    }),
    ilike: vi.fn(() => builder),
    limit: vi.fn((n: number) => {
      limitVal = n
      return builder
    }),
    order: vi.fn(async () => {
      const rowset = await orderFn()
      let data = rowset.data as Array<Record<string, unknown>> | undefined
      if (Array.isArray(data)) {
        const filtered = data.filter((row) => {
          return filters.every((filter) => {
            // Only apply an `is_active` filter to rows that carry the key;
            // rows without it are considered active (see "successful").
            if (filter.key === 'is_active') {
              if (Object.prototype.hasOwnProperty.call(row, 'is_active')) {
                return row[filter.key] === filter.value
              }
              return true
            }
            return true
          })
        })
        if (limitVal != null && limitVal > 0) {
          data = filtered.slice(0, limitVal)
        } else {
          data = filtered
        }
      }
      return { data, error: rowset.error }
    }),
  }
  const from = vi.fn(() => builder)
  mockSupabase = { from }
  orderFn = vi.fn(async () => ({ data: [], error: null }))
  return mockSupabase
}

function request(url: string): NextRequest {
  return new NextRequest(url)
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

let requireAuthLiteMock: any

vi.mock('@/lib/api/middleware', () => ({
  requireAuthLite: vi.fn().mockImplementation(async () => requireAuthLiteMock),
}))

describe('GET /api/colleges/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    orderFn = vi.fn(async () => ({ data: [], error: null }))
    requireAuthLiteMock = {
      ok: true,
      auth: { userId: 'user-1', profile: { id: 'user-1' }, adminTypes: [], grants: [] },
    }
  })

  it('unauthenticated request returns 401', async () => {
    requireAuthLiteMock = {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401 }),
    }
    const res = await GET(request('http://localhost/api/colleges/search?q=iit'))
    expect(res.status).toBe(401)
  })

  it('missing q returns 400', async () => {
    const res = await GET(request('http://localhost/api/colleges/search'))
    expect(res.status).toBe(400)
  })

  it('query shorter than 2 characters returns 400', async () => {
    const res = await GET(request('http://localhost/api/colleges/search?q=a'))
    expect(res.status).toBe(400)
  })

  it('query longer than 80 characters returns 400', async () => {
    const q = 'a'.repeat(81)
    const res = await GET(request('http://localhost/api/colleges/search?q=' + encodeURIComponent(q)))
    expect(res.status).toBe(400)
  })

  it('trims whitespace around query', async () => {
    const res = await GET(request('http://localhost/api/colleges/search?q=  iit  '))
    expect(res.status).toBe(200)
  })

  it('successful authenticated search returns only id, name, city, state', async () => {
    const rows = [
      { id: 'c-1', name: 'Indian Institute of Technology Delhi', city: 'New Delhi', state: 'Delhi' },
      { id: 'c-2', name: 'Indian Institute of Technology Bombay', city: 'Mumbai', state: 'Maharashtra' },
    ]
    orderFn.mockResolvedValue({ data: rows, error: null })

    const res = await GET(request('http://localhost/api/colleges/search?q=iit'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      colleges?: Array<{ id: string; name: string; city: string | null; state: string | null }>
    }
    expect(json).toHaveProperty('colleges')
    expect(json.colleges).toHaveLength(2)
    for (const c of json.colleges as Array<{ id: string; name: string; city: string | null; state: string | null }>) {
      expect(c).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          city: expect.any(String),
          state: expect.any(String),
        })
      )
      expect(Object.keys(c)).toEqual(['id', 'name', 'city', 'state'])
    }
  })

  it('search against name matches partial text', async () => {
    const rows = [{ id: 'c-1', name: 'Indian Institute of Technology Delhi', city: 'New Delhi', state: 'Delhi' }]
    orderFn.mockResolvedValue({ data: rows, error: null })

    const res = await GET(request('http://localhost/api/colleges/search?q=iit'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      colleges?: Array<{ id: string; name: string; city: string | null; state: string | null }>
    }
    expect(json.colleges).toHaveLength(1)
    expect(json.colleges?.[0]?.name).toMatch(/delhi/i)
  })

  it('search against city/state matches location text', async () => {
    const rows = [{ id: 'c-1', name: 'Small College', city: 'Bangalore', state: 'Karnataka' }]
    orderFn.mockResolvedValue({ data: rows, error: null })

    const res = await GET(request('http://localhost/api/colleges/search?q=bangalore'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      colleges?: Array<{ id: string; name: string; city: string | null; state: string | null }>
    }
    expect(json.colleges).toHaveLength(1)
    expect(json.colleges?.[0]?.city).toMatch(/bangalore/i)
  })

  it('excludes inactive colleges', async () => {
    const rows = [
      { id: 'c-1', name: 'Active College', city: 'Bangalore', state: 'Karnataka', is_active: true },
      { id: 'c-2', name: 'Inactive College', city: 'Delhi', state: 'Delhi', is_active: false },
    ]
    orderFn.mockResolvedValue({ data: rows, error: null })

    const res = await GET(request('http://localhost/api/colleges/search?q=college'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      colleges?: Array<{ id: string; name: string; city: string | null; state: string | null }>
    }
    expect(json.colleges).toHaveLength(1)
    expect(json.colleges?.[0]?.id).toBe('c-1')
  })

  it('limits results to 20', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `c-${i}`,
      name: `College ${i}`,
      city: 'Bangalore',
      state: 'Karnataka',
      is_active: true,
    }))
    orderFn.mockResolvedValue({ data: rows, error: null })

    const res = await GET(request('http://localhost/api/colleges/search?q=college'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      colleges?: Array<{ id: string; name: string; city: string | null; state: string | null }>
    }
    expect(json.colleges).toHaveLength(20)
  })

  it('supabase/database failure returns 500', async () => {
    const error = new Error('db down') as Error
    const errorRowset = { data: null, error }
    orderFn.mockImplementation(async () => errorRowset)

    const res = await GET(request('http://localhost/api/colleges/search?q=iit'))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Failed to search colleges')
  })
})
