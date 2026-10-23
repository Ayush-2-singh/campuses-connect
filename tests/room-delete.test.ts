/**
 * DELETE /api/live-voice-chat/groups/[id] — who may remove a study room.
 *
 * Pins the authorization model:
 *   • the creator may delete their own room;
 *   • a member whose row says role = 'admin' may delete it;
 *   • a platform admin may delete any room, including global ones;
 *   • a campus admin may delete only rooms scoped to their campus;
 *   • everybody else gets 403, and an anonymous caller gets 401.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    admin_grants: [] as Row[],
    live_voice_chat_groups: [] as Row[],
    live_voice_chat_members: [] as Row[],
    deletes: [] as { table: string; id: string }[],
    inserts: [] as { table: string; row: any }[],
    user: null as { id: string } | null,
  }

  function createClient() {
    return {
      from(table: string) {
        let mode: 'select' | 'delete' | 'insert' = 'select'
        const eqs: { col: string; val: any }[] = []
        let single = false
        let inserted: any = null

        const rows = () => {
          let out = ((state as Row)[table] ?? []) as Row[]
          for (const e of eqs) out = out.filter((r) => r[e.col] === e.val)
          return out
        }

        const settle = () => {
          if (mode === 'delete') {
            const ids = rows().map((r) => r.id)
            state.deletes.push({ table, id: eqs.find((e) => e.col === 'id')?.val })
            ;(state as any)[table] = (((state as Row)[table] ?? []) as Row[]).filter((r: Row) => !ids.includes(r.id))
            return { data: null, error: null }
          }
          if (mode === 'insert') {
            state.inserts.push({ table, row: inserted })
            return { data: null, error: null }
          }
          const out = rows()
          if (single) return out[0] ? { data: out[0], error: null } : { data: null, error: null }
          return { data: out, error: null }
        }

        const builder: any = {
          select: () => builder,
          eq: (col: string, val: any) => {
            eqs.push({ col, val })
            return builder
          },
          maybeSingle: () => {
            single = true
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

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...actual,
    getSupabaseAdmin: mock.createClient,
    getVerifiedUserFromCookie: async () => mock.state.user,
  }
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'sb-test-auth-token=stub' }),
}))

import { DELETE } from '@/app/api/live-voice-chat/groups/[id]/route'

const request = () => ({ headers: new Headers({ cookie: 'sb-test-auth-token=stub' }) }) as any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function signIn(userId: string, grants: Row[] = [], campusId = 'campus-a') {
  mock.state.user = { id: userId }
  mock.state.profiles = [{ id: userId, campus_id: campusId, college_id: 'college-a' }]
  mock.state.admin_grants = grants.map((g) => ({ user_id: userId, ...g }))
}

const room = (id: string, over: Row = {}) => ({
  id,
  name: 'DSA grind',
  created_by: 'creator-1',
  campus_id: 'campus-a',
  ...over,
})

beforeEach(() => {
  mock.state.profiles = []
  mock.state.admin_grants = []
  mock.state.live_voice_chat_groups = []
  mock.state.live_voice_chat_members = []
  mock.state.deletes = []
  mock.state.inserts = []
  mock.state.user = null
})

describe('DELETE /api/live-voice-chat/groups/[id]', () => {
  it('lets the creator delete their own room', async () => {
    signIn('creator-1')
    mock.state.live_voice_chat_groups = [room('room-1', { created_by: 'creator-1' })]

    const res = await DELETE(request(), ctx('room-1'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, deleted: 1 })
    expect(mock.state.deletes).toEqual([{ table: 'live_voice_chat_groups', id: 'room-1' }])
    expect(mock.state.inserts.map((i) => i.table)).toContain('audit_log')
  })

  it('lets a room admin delete the room', async () => {
    signIn('mod-1')
    mock.state.live_voice_chat_groups = [room('room-1', { created_by: 'creator-1' })]
    mock.state.live_voice_chat_members = [{ group_id: 'room-1', user_id: 'mod-1', role: 'admin' }]

    const res = await DELETE(request(), ctx('room-1'))

    expect(res.status).toBe(200)
    expect(mock.state.deletes).toHaveLength(1)
  })

  it('refuses an ordinary member', async () => {
    signIn('student-1')
    mock.state.live_voice_chat_groups = [room('room-1')]
    mock.state.live_voice_chat_members = [{ group_id: 'room-1', user_id: 'student-1', role: 'member' }]

    const res = await DELETE(request(), ctx('room-1'))

    expect(res.status).toBe(403)
    expect(mock.state.deletes).toHaveLength(0)
  })

  it('lets a platform admin delete a global room belonging to someone else', async () => {
    signIn('admin-1', [{ admin_type: 'platform_admin' }])
    mock.state.live_voice_chat_groups = [room('room-1', { campus_id: null })]

    const res = await DELETE(request(), ctx('room-1'))

    expect(res.status).toBe(200)
    expect(mock.state.deletes).toHaveLength(1)
  })

  it('scopes a campus admin to their own campus', async () => {
    signIn('campus-admin', [{ admin_type: 'campus_admin', campus_id: 'campus-a' }])
    mock.state.live_voice_chat_groups = [
      room('mine', { campus_id: 'campus-a' }),
      room('theirs', { campus_id: 'campus-b' }),
      room('global', { campus_id: null }),
    ]

    expect((await DELETE(request(), ctx('mine'))).status).toBe(200)
    expect((await DELETE(request(), ctx('theirs'))).status).toBe(403)
    expect((await DELETE(request(), ctx('global'))).status).toBe(403)
  })

  it('answers 401 for an anonymous caller and 404 for a missing room', async () => {
    mock.state.live_voice_chat_groups = [room('room-1')]
    expect((await DELETE(request(), ctx('room-1'))).status).toBe(401)

    signIn('creator-1')
    mock.state.live_voice_chat_groups = []
    expect((await DELETE(request(), ctx('nope'))).status).toBe(404)
  })
})
