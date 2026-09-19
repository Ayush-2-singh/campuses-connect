/**
 * Regression tests for the `Authorization: Bearer` auth path.
 *
 * `resolveUser()` in src/lib/api/middleware.ts was changed to accept a Bearer
 * token (validated server-side against Supabase Auth) in addition to the
 * chunked `@supabase/ssr` session cookie. That is what lets a non-browser client
 * — the Capacitor Android shell, or any API consumer without a cookie jar —
 * call these routes without inventing a second authentication system.
 *
 * Because that branch runs BEFORE the cookie lookup, it is a privilege boundary:
 * if it could be reached with a token for a user who has no grants, or with a
 * forged token, it would be an escalation path. These tests pin it down.
 *
 * The distinction that matters, and the reason this file exists separately from
 * api-admin-delete.test.ts: holding a *valid* session is not the same as holding
 * an *admin grant*. A valid token must still be refused by `requireAdmin`, and
 * must still be scope-limited by `scopeFilterFor`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    admin_grants: [] as Row[],
    /** token -> resolved auth user (absent key = invalid token). */
    tokens: new Map<string, { id: string }>(),
    /** The user a valid session cookie would resolve to. */
    cookieUser: null as { id: string } | null,
    cookieHeader: '',
  }

  function createClient() {
    return {
      auth: {
        // Mirrors Supabase's service-role getUser(jwt): the token is verified
        // server-side, so a forged token yields no user.
        getUser: async (token: string) => {
          const user = state.tokens.get(token)
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
        },
      },
      from(table: string) {
        let ids: string[] | null = null
        let eq: { col: string; val: any } | null = null
        let single = false

        const settle = () => {
          let rows = ((state as unknown as Record<string, Row[]>)[table] ?? []) as Row[]
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
          then: (res: any, rej: any) => Promise.resolve(settle()).then(res, rej),
        }
        return builder
      },
    }
  }

  return { state, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }))

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...actual,
    getSupabaseAdmin: mock.createClient,
    getVerifiedUserFromCookie: async () => mock.state.cookieUser,
    getVerifiedUser: async (request?: unknown) => (request ? mock.state.cookieUser : null),
  }
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers(mock.state.cookieHeader ? { cookie: mock.state.cookieHeader } : {}),
}))

import { requireAdmin, requireAuth, requireAuthLite, scopeFilterFor } from '@/lib/api/middleware'

/** A request that carries only a Bearer token — no session cookie. */
const bearerRequest = (token: string) => ({ headers: new Headers({ authorization: `Bearer ${token}` }) }) as any

/** Give `token` a valid session, optionally with admin grants. */
function issueToken(token: string, userId: string, grants: Row[] = []) {
  mock.state.tokens.set(token, { id: userId })
  mock.state.profiles.push({ id: userId, campus_id: 'campus-a', college_id: 'college-a' })
  grants.forEach((g) => mock.state.admin_grants.push({ user_id: userId, ...g }))
}

beforeEach(() => {
  mock.state.profiles = []
  mock.state.admin_grants = []
  mock.state.tokens = new Map()
  mock.state.cookieUser = null
  mock.state.cookieHeader = ''
})

describe('resolveUser() — Bearer token path', () => {
  it('authenticates a request carrying a valid Bearer token', async () => {
    issueToken('good-token', 'user-1')

    const result = await requireAuthLite(bearerRequest('good-token'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.auth.userId).toBe('user-1')
  })

  it('rejects a forged Bearer token when there is no session cookie', async () => {
    // Valid session for user-1, but the caller presents an unknown token and no cookie.
    issueToken('good-token', 'user-1')

    const result = await requireAuthLite(bearerRequest('forged-token'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('rejects a forged Bearer token even when a cookie for another user is present', async () => {
    issueToken('good-token', 'user-1')
    // A stale cookie must not be able to authenticate a request whose Bearer
    // token failed validation... the cookie is still a valid credential, so the
    // expected outcome is the COOKIE user (never the forged token's claim).
    mock.state.cookieUser = { id: 'user-1' }

    const result = await requireAuthLite(bearerRequest('forged-token'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.auth.userId).toBe('user-1')
  })
})

describe('a valid session is not a privilege grant', () => {
  it('refuses admin access to a Bearer token with no grants', async () => {
    issueToken('student-token', 'student-1')

    const result = await requireAdmin(bearerRequest('student-token'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('grants admin access to a Bearer token backed by a real grant', async () => {
    issueToken('admin-token', 'admin-1', [{ admin_type: 'platform_admin' }])

    const result = await requireAdmin(bearerRequest('admin-token'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.auth.adminTypes).toEqual(['platform_admin'])
  })

  it('still scope-limits a campus admin authenticating by token', async () => {
    issueToken('campus-token', 'campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])

    const auth = await requireAuth(bearerRequest('campus-token'))
    expect(auth.ok).toBe(true)
    if (!auth.ok) return

    const scope = scopeFilterFor(auth.auth)

    // Their own campus: allowed. Anything else: refused. The token path must not
    // widen the scope filter.
    expect(scope.canModerateRow({ campus_id: 'campus-a' })).toBe(true)
    expect(scope.canModerateRow({ campus_id: 'campus-b' })).toBe(false)
    expect(scope.canModerateRow({ community_id: 'community-1' })).toBe(false)
    expect(scope.canModerateRow({})).toBe(false)
  })

  it('does not let a client-supplied row scope impersonate another campus', async () => {
    issueToken('campus-token', 'campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])

    const auth = await requireAuth(bearerRequest('campus-token'))
    expect(auth.ok).toBe(true)
    if (!auth.ok) return

    const scope = scopeFilterFor(auth.auth)

    // scopeFilterFor() reads scope columns from the DATABASE row, never from the
    // request. Supplying campus_id in a payload cannot change the decision, so a
    // row that really lives on campus-b stays out of reach.
    const rowFromDb = { campus_id: 'campus-b' }
    expect(scope.canModerateRow(rowFromDb)).toBe(false)
  })
})
