/**
 * Regression test — who is allowed to delete a post.
 *
 * It pins down three bugs that were live in the admin moderation path:
 *
 *   1. `requireAuth()` / `requireAuthLite()` / `requireAdmin()` called with no
 *      request argument resolved to "no session" and answered 401 — 15 routes
 *      were dead. The session must still resolve through `next/headers`.
 *   2. Grants were read via `my_admin_grants()` on the service-role client.
 *      That RPC filters on `auth.uid()`, which is NULL without a user JWT, so an
 *      admin always had zero grants and got 403 on every delete. Grants must be
 *      read from `admin_grants`, scoped to the verified user.
 *   3. The handler had no scope check, so any admin could hard-delete any post
 *      anywhere on the platform.
 *
 * The fake Supabase client exposes ONLY `from()` — no `rpc()` — so reverting to
 * the `my_admin_grants()` call makes these tests fail loudly instead of quietly
 * returning an empty grant list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    admin_grants: [] as Row[],
    posts: [] as Row[],
    post_comments: [] as Row[],
    deletes: [] as { table: string; ids: string[] }[],
    inserts: [] as { table: string; row: any }[],
    user: null as { id: string } | null,
    cookieHeader: '',
  }

  /** Minimal chainable stand-in for a Supabase service-role client. */
  function createClient() {
    return {
      from(table: string) {
        let mode: 'select' | 'delete' | 'insert' = 'select'
        let ids: string[] | null = null
        let eq: { col: string; val: any } | null = null
        let single = false
        let inserted: any = null

        const settle = () => {
          if (mode === 'delete') {
            state.deletes.push({ table, ids: ids ?? [] })
            return { data: null, error: null }
          }
          if (mode === 'insert') {
            state.inserts.push({ table, row: inserted })
            return { data: null, error: null }
          }
          let rows = ((state as Row)[table] ?? []) as Row[]
          if (ids) rows = rows.filter((r) => ids!.includes(r.id))
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
          in: (_col: string, values: string[]) => {
            ids = values
            return builder
          },
          single: () => {
            single = true
            return builder
          },
          delete: () => {
            mode = 'delete'
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

// Only the transport is faked. The guards and the route handler are real.
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

import { DELETE } from '@/app/api/admin/content/route'
import { requireAuth } from '@/lib/api/middleware'

/** A signed-in DELETE request (the cookie itself is irrelevant — auth is faked). */
const request = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers({ cookie: 'sb-test-auth-token=stub' }),
  }) as any

function signIn(userId: string, grants: Row[] = []) {
  mock.state.user = { id: userId }
  mock.state.profiles = [{ id: userId, campus_id: 'campus-a', college_id: 'college-a' }]
  mock.state.admin_grants = grants.map((g) => ({ user_id: userId, ...g }))
}

const post = (id: string, over: Row = {}) => ({
  id,
  campus_id: 'campus-a',
  college_id: 'college-a',
  community_id: null,
  ...over,
})

beforeEach(() => {
  mock.state.profiles = []
  mock.state.admin_grants = []
  mock.state.posts = []
  mock.state.post_comments = []
  mock.state.deletes = []
  mock.state.inserts = []
  mock.state.user = null
  mock.state.cookieHeader = ''
})

describe('DELETE /api/admin/content — posts', () => {
  it('lets a platform admin delete another user’s post', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])
    mock.state.posts = [post('post-1')]

    const res = await DELETE(request({ type: 'posts', ids: ['post-1'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, deleted: 1, type: 'posts' })
    expect(mock.state.deletes).toEqual([{ table: 'posts', ids: ['post-1'] }])
    expect(mock.state.inserts.map((i) => i.table)).toContain('audit_log')
  })

  it('does NOT let a student delete a post', async () => {
    signIn('student-1')
    mock.state.posts = [post('post-1')]

    const res = await DELETE(request({ type: 'posts', ids: ['post-1'] }))

    expect(res.status).toBe(403)
    expect(mock.state.deletes).toHaveLength(0)
    expect(mock.state.inserts).toHaveLength(0)
  })

  it('answers 401 for an anonymous caller', async () => {
    mock.state.posts = [post('post-1')]

    const res = await DELETE(request({ type: 'posts', ids: ['post-1'] }))

    expect(res.status).toBe(401)
    expect(mock.state.deletes).toHaveLength(0)
  })

  it('lets a campus admin delete a post on their own campus', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.posts = [post('post-1')]

    const res = await DELETE(request({ type: 'posts', ids: ['post-1'] }))

    expect(res.status).toBe(200)
    expect(mock.state.deletes).toEqual([{ table: 'posts', ids: ['post-1'] }])
  })

  it('stops a campus admin deleting a post on another campus', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.posts = [post('post-other', { campus_id: 'campus-b', college_id: 'college-b' })]

    const res = await DELETE(request({ type: 'posts', ids: ['post-other'] }))

    expect(res.status).toBe(403)
    expect(mock.state.deletes).toHaveLength(0)
  })

  it('lets a community admin delete a post inside their community', async () => {
    signIn('community-admin', [{ admin_type: 'community_admin', community_id: 'community-1' }])
    mock.state.posts = [post('post-1', { campus_id: null, college_id: null, community_id: 'community-1' })]

    const res = await DELETE(request({ type: 'posts', ids: ['post-1'] }))

    expect(res.status).toBe(200)
    expect(mock.state.deletes).toEqual([{ table: 'posts', ids: ['post-1'] }])
  })

  it('deletes only the in-scope rows of a mixed batch', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.posts = [post('mine'), post('theirs', { campus_id: 'campus-b', college_id: 'college-b' })]

    const res = await DELETE(request({ type: 'posts', ids: ['mine', 'theirs'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ deleted: 1, skipped: 1 })
    expect(mock.state.deletes).toEqual([{ table: 'posts', ids: ['mine'] }])
  })
})

describe('DELETE /api/admin/content — comments', () => {
  it('scopes a comment delete through the post it lives on', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.posts = [post('in-scope'), post('out-of-scope', { campus_id: 'campus-b', college_id: 'college-b' })]
    mock.state.post_comments = [
      { id: 'c-mine', post_id: 'in-scope' },
      { id: 'c-theirs', post_id: 'out-of-scope' },
    ]

    const res = await DELETE(request({ type: 'comments', ids: ['c-mine', 'c-theirs'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ deleted: 1, skipped: 1 })
    expect(mock.state.deletes).toEqual([{ table: 'post_comments', ids: ['c-mine'] }])
  })

  it('refuses a comment on a post outside the admin’s scope', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.posts = [post('out-of-scope', { campus_id: 'campus-b', college_id: 'college-b' })]
    mock.state.post_comments = [{ id: 'c-theirs', post_id: 'out-of-scope' }]

    const res = await DELETE(request({ type: 'comments', ids: ['c-theirs'] }))

    expect(res.status).toBe(403)
    expect(mock.state.deletes).toHaveLength(0)
  })
})

describe('shared API guards without a request argument', () => {
  it('resolves the session from next/headers cookies (regression: used to 401)', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])
    mock.state.cookieHeader = 'sb-test-auth-token=stub'

    const result = await requireAuth()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.auth.userId).toBe('admin-1')
      // Grants come from the admin_grants table, not from an auth.uid() RPC.
      expect(result.auth.adminTypes).toEqual(['platform_admin'])
    }
  })

  it('still rejects a caller with no session cookie', async () => {
    mock.state.cookieHeader = ''

    const result = await requireAuth()

    expect(result.ok).toBe(false)
  })
})
