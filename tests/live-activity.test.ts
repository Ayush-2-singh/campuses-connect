/**
 * Live activity + Library link guard.
 *
 * 1. POST /api/notes/upload must accept the links students ACTUALLY paste.
 *    Browsers strip the scheme when copying from the address bar, so
 *    "www.youtube.com/..." and "drive.google.com/..." are the norm — but the
 *    old validator only accepted strings that parse as absolute URLs, which
 *    surfaced to users as "A valid link is required" for a perfectly good link.
 * 2. The live pulse card's user controls (mute / pause / session hide) are pure
 *    logic — lock them so the card can never trap a user who silenced it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    admin_grants: [] as Row[],
    inserts: [] as { table: string; row: any }[],
    user: null as { id: string } | null,
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
          rpc: async () => ({ data: null, error: null }),
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
    getVerifiedUser: async (request?: unknown) => (request ? mock.state.user : null),
  }
})
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'sb-test-auth-token=stub' }),
}))

import { POST } from '@/app/api/notes/upload/route'
import { isPulseVisible, PULSE_DEFAULT_PREFS, setPulseMuted, timeAgoLabel } from '@/lib/livePulsePrefs'

const request = (fields: Record<string, string>) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.append(key, value)
  return {
    formData: async () => formData,
    headers: new Headers({ cookie: 'sb-test-auth-token=stub' }),
  } as any
}

beforeEach(() => {
  mock.state.profiles = []
  mock.state.admin_grants = []
  mock.state.inserts = []
  mock.state.user = { id: 'admin-1' }
  mock.state.profiles = [{ id: 'admin-1', campus_id: 'campus-a', college_id: 'college-a', department_id: 'dept-1' }]
  // A platform-admin grant: the route derives is_verified from real grants.
  mock.state.admin_grants = [{ user_id: 'admin-1', admin_type: 'platform_admin' }]
})

describe('POST /api/notes/upload — links pasted without a scheme', () => {
  it.each([['www.youtube.com/watch?v=abc'], ['drive.google.com/file/d/abc/view'], ['  notion.so/My-Notes-8f2  ']])(
    'accepts "%s" and stores it as https',
    async (raw) => {
      const res = await POST(request({ title: 'OS Notes', subject: 'OS', drive_link: raw }))

      expect(res.status).toBe(200)
      const note = mock.state.inserts.find((i) => i.table === 'notes')
      expect(note?.row.external_file_url).toMatch(/^https:\/\/[a-z]+\./)
      expect(note?.row.is_verified).toBe(true)
    }
  )

  it('still rejects non-web schemes and hostless junk', async () => {
    for (const bad of ['javascript:alert(1)', 'ftp://files.example.com/x', 'https://not a link']) {
      mock.state.inserts = []
      const res = await POST(request({ title: 'OS Notes', subject: 'OS', drive_link: bad }))
      expect(res.status, bad).toBe(400)
      expect(mock.state.inserts, bad).toEqual([])
    }
  })
})

describe('live pulse prefs — the card can never trap the user', () => {
  it('shows by default and on every visit (no 24h pause exists any more)', () => {
    expect(isPulseVisible(PULSE_DEFAULT_PREFS)).toBe(true)
  })

  it('mutes until explicitly unmuted', () => {
    const muted = setPulseMuted(true)
    expect(isPulseVisible(muted)).toBe(false)
    expect(isPulseVisible(setPulseMuted(false))).toBe(true)
  })

  it('labels last-activity age honestly', () => {
    const now = Date.now()
    expect(timeAgoLabel(now, now)).toBe('just now')
    expect(timeAgoLabel(now - 5 * 60_000, now)).toBe('5m ago')
    expect(timeAgoLabel(now - 3 * 3600_000, now)).toBe('3h ago')
    expect(timeAgoLabel(now - 2 * 24 * 3600_000, now)).toBe('2d ago')
    expect(timeAgoLabel(now - 10 * 24 * 3600_000, now)).toBe('1w ago')
  })
})
