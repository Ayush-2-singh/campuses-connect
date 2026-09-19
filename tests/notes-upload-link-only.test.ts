/**
 * Regression test — admins publish study material as a LINK.
 *
 * This route used to accept an optional file and push it to Supabase Storage.
 * That branch is what produced the live failure being fixed here: a
 * `createBucket` + `upload` round-trip that failed ~730ms in, was swallowed by
 * the handler's catch-all, and reached the client as a bare HTTP 500 with the
 * real cause only in the server log. Meanwhile the UI still offered a file
 * picker, so the admin had no way to post material at all.
 *
 * The contract now: no file ever reaches storage, at least one validated
 * http(s) link is required, and only admins may post.
 *
 * The fake Supabase client deliberately exposes ONLY `from()` — no `storage`
 * and no `rpc()`. Re-introducing a storage upload makes these tests throw
 * instead of quietly 500ing in production, which is the point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    admin_grants: [] as Row[],
    inserts: [] as { table: string; row: any }[],
    user: null as { id: string } | null,
    cookieHeader: '',
    /** Set to fake a database rejection on insert. */
    insertError: null as { message: string } | null,
  }

  function createClient() {
    return {
      from(table: string) {
        let mode: 'select' | 'insert' = 'select'
        let eq: { col: string; val: any } | null = null
        let single = false
        let inserted: any = null

        const settle = () => {
          if (mode === 'insert') {
            state.inserts.push({ table, row: inserted })
            if (state.insertError) return { data: null, error: state.insertError }
            return { data: single ? { id: 'note-1' } : null, error: null }
          }
          let rows = ((state as unknown as Record<string, Row[]>)[table] ?? []) as Row[]
          if (eq) rows = rows.filter((r) => r[eq!.col] === eq!.val)
          if (single) {
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } }
          }
          return { data: rows, error: null }
        }

        const builder: any = {
          select: () => builder,
          eq: (col: string, val: any) => {
            eq = { col, val }
            return builder
          },
          single: () => {
            single = true
            return builder
          },
          insert: (row: any) => {
            mode = 'insert'
            inserted = row
            return builder
          },
          then: (res: any, rej: any) => Promise.resolve(settle()).then(res, rej),
        }
        return builder
      },
    }
  }

  return { state, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }))

// Only the transport is faked — the guards and the handler are real.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...actual,
    getSupabaseAdmin: mock.createClient,
    getVerifiedUserFromCookie: async () => mock.state.user,
    getVerifiedUser: async (request?: unknown) => (request ? mock.state.user : null),
  }
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers(mock.state.cookieHeader ? { cookie: mock.state.cookieHeader } : {}),
}))

import { POST } from '@/app/api/notes/upload/route'

/** A signed-in submission. `file` is accepted here only to prove it is ignored. */
const request = (fields: Record<string, string | File>) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.append(key, value)
  return {
    formData: async () => formData,
    headers: new Headers({ cookie: 'sb-test-auth-token=stub' }),
  } as any
}

const DRIVE_LINK = 'https://drive.google.com/file/d/abc123/view'

function signIn(userId: string, grants: Row[] = []) {
  mock.state.user = { id: userId }
  mock.state.profiles = [{ id: userId, campus_id: 'campus-a', college_id: 'college-a', department_id: 'dept-1' }]
  mock.state.admin_grants = grants.map((g) => ({ user_id: userId, ...g }))
}

const validFields = { title: 'OS Notes', subject: 'Operating Systems', drive_link: DRIVE_LINK }

beforeEach(() => {
  mock.state.profiles = []
  mock.state.admin_grants = []
  mock.state.inserts = []
  mock.state.user = null
  mock.state.cookieHeader = ''
  mock.state.insertError = null
})

describe('POST /api/notes/upload — link-only publishing', () => {
  it('stores the link and publishes immediately for an admin', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(request(validFields))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      storage_provider: 'link',
      is_verified: true,
    })

    const note = mock.state.inserts.find((i) => i.table === 'notes')
    expect(note?.row).toMatchObject({
      uploaded_by: 'admin-1',
      title: 'OS Notes',
      subject: 'Operating Systems',
      storage_provider: 'link',
      external_file_url: DRIVE_LINK,
      drive_link: DRIVE_LINK,
      external_link: null,
      is_verified: true,
      // Scope comes from the poster's profile, never from the request body.
      campus_id: 'campus-a',
      college_id: 'college-a',
      department_id: 'dept-1',
    })
  })

  it('accepts an external link when no Drive link is given', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(
      request({ title: 'DBMS PYQ', subject: 'DBMS', external_link: 'https://youtu.be/dQw4w9WgXcQ' })
    )

    expect(res.status).toBe(200)
    const note = mock.state.inserts.find((i) => i.table === 'notes')
    expect(note?.row.external_file_url).toBe('https://youtu.be/dQw4w9WgXcQ')
    expect(note?.row.drive_link).toBeNull()
  })

  it('never sends a submitted file to storage', async () => {
    // The fake client has no `storage` at all: reaching the old upload branch
    // throws here rather than failing silently in production.
    signIn('admin-1', [{ admin_type: 'platform_admin' }])
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.pdf', { type: 'application/pdf' })

    const res = await POST(request({ ...validFields, file }))

    expect(res.status).toBe(200)
    const note = mock.state.inserts.find((i) => i.table === 'notes')
    expect(note?.row).toMatchObject({ storage_provider: 'link', file_size: null, mime_type: null })
  })
})

describe('POST /api/notes/upload — validation', () => {
  it('rejects a submission with no link at all', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(request({ title: 'OS Notes', subject: 'Operating Systems' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/link is required/i) })
    expect(mock.state.inserts).toEqual([])
  })

  it('rejects blank / whitespace-only links', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(request({ ...validFields, drive_link: '   ', external_link: '' }))

    expect(res.status).toBe(400)
    expect(mock.state.inserts).toEqual([])
  })

  it('rejects a non-http(s) link scheme', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(request({ ...validFields, drive_link: 'javascript:alert(1)' }))

    expect(res.status).toBe(400)
    expect(mock.state.inserts).toEqual([])
  })

  it('requires a title and a subject', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])

    const res = await POST(request({ ...validFields, subject: '   ' }))

    expect(res.status).toBe(400)
    expect(mock.state.inserts).toEqual([])
  })

  it('surfaces a database rejection instead of a bare 500', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])
    mock.state.insertError = { message: 'column notes.foo does not exist' }

    const res = await POST(request(validFields))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('column notes.foo does not exist'),
    })
  })
})

describe('POST /api/notes/upload — authorization', () => {
  it('refuses a signed-in user with no admin grant', async () => {
    signIn('student-1')

    const res = await POST(request(validFields))

    expect(res.status).toBe(403)
    expect(mock.state.inserts).toEqual([])
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await POST(request(validFields))

    expect(res.status).toBe(401)
    expect(mock.state.inserts).toEqual([])
  })
})
