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
import { isPulseVisible, PULSE_DEFAULT_PREFS, PULSE_PAUSE_MS, pausePulseFor, setPulseMuted } from '@/lib/livePulsePrefs'

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
  const DAY = 24 * 60 * 60 * 1000

  it('shows by default', () => {
    expect(isPulseVisible(PULSE_DEFAULT_PREFS, 1_000)).toBe(true)
  })

  it('mutes until explicitly unmuted', () => {
    const muted = setPulseMuted(true)
    expect(isPulseVisible(muted, Date.now())).toBe(false)
    expect(isPulseVisible(setPulseMuted(false), Date.now())).toBe(true)
  })

  it('pause 24h expires on its own', () => {
    const now = Date.now()
    vi.useFakeTimers({ now })
    const paused = pausePulseFor()
    expect(paused.pausedUntil).toBe(now + PULSE_PAUSE_MS)
    expect(isPulseVisible(paused, now + PULSE_PAUSE_MS - 1)).toBe(false)
    expect(isPulseVisible(paused, now + PULSE_PAUSE_MS)).toBe(true)
    vi.useRealTimers()
  })

  it('pause and mute combine (mute wins)', () => {
    const both = { ...pausePulseFor(), muted: true }
    expect(isPulseVisible(both, Date.now() + 2 * DAY)).toBe(false)
  })
})
