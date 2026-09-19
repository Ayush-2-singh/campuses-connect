/**
 * Tests for POST /api/live-voice-chat/token — the LiveKit access-token endpoint.
 *
 * This endpoint is the whole security boundary of the voice feature: whoever
 * holds a valid token can join a room and publish audio. So these tests pin
 * down the four things that would turn it into a hole:
 *
 *   1. No session          → 401. A token is never issued to an anonymous caller.
 *   2. Invalid session     → 401. The JWT is verified server-side, not trusted.
 *   3. Not a group member  → 403. The call lookup runs under the caller's own
 *      JWT, so RLS decides visibility; a room you cannot see is a room you
 *      cannot get a token for. Guests must not be able to enumerate call ids.
 *   4. Room naming         → the granted room is `live-voice-chat-<call id>`,
 *      never the old `gupshup-<id>`.
 *
 * The token itself is a locally signed JWT, so it can be decoded and asserted
 * without any network call to LiveKit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mock = vi.hoisted(() => {
  const state = {
    /** jwt -> user, mirrors Supabase's server-side verification. */
    sessions: new Map<string, { id: string; email?: string; user_metadata?: Row }>(),
    /** Rows the RLS-scoped client is allowed to see for live_voice_chat_calls. */
    visibleCalls: [] as Row[],
    /** Every `from(table)` the route touched — proves which table it reads. */
    tablesQueried: [] as string[],
    /** The Authorization header the client was constructed with. */
    clientAuthHeader: '' as string,
  }

  function createClient(_url: string, _key: string, opts?: { global?: { headers?: Row } }) {
    state.clientAuthHeader = opts?.global?.headers?.Authorization ?? ''
    return {
      auth: {
        getUser: async (jwt?: string) => {
          const user = jwt ? state.sessions.get(jwt) : undefined
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
        },
      },
      from(table: string) {
        state.tablesQueried.push(table)
        let eq: { col: string; val: any } | null = null
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: any) => {
            eq = { col, val }
            return builder
          },
          maybeSingle: async () => {
            // Stands in for RLS: only rows the policy allows are returned.
            const rows = state.visibleCalls.filter((r) => !eq || r[eq.col] === eq.val)
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: null }
          },
        }
        return builder
      },
    }
  }

  return { state, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }))

import { POST } from '@/app/api/live-voice-chat/token/route'

/** The request stub the route handler sees. */
const request = (opts: { jwt?: string; body?: unknown }) =>
  ({
    headers: new Headers(opts.jwt ? { authorization: `Bearer ${opts.jwt}` } : {}),
    json: async () => opts.body ?? {},
  }) as any

/** Decode the payload of the issued LiveKit JWT. */
function decode(token: string): Row {
  const payload = token.split('.')[1]
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  return JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
}

beforeEach(() => {
  mock.state.sessions = new Map()
  mock.state.visibleCalls = []
  mock.state.tablesQueried = []
  mock.state.clientAuthHeader = ''

  // Any api key/secret works — the JWT is signed locally, never sent to LiveKit.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.LIVEKIT_API_KEY = 'lk_test_key'
  process.env.LIVEKIT_API_SECRET = 'lk_test_secret_never_leaves_the_server'
  process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://example.livekit.cloud'
})

describe('POST /api/live-voice-chat/token — authentication', () => {
  it('refuses an anonymous caller with no token at all', async () => {
    const res = await POST(request({ body: { callId: 'call-1' } }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/login/i) })
    expect(mock.state.tablesQueried).toEqual([])
  })

  it('refuses a forged session token', async () => {
    mock.state.visibleCalls = [{ id: 'call-1', group_id: 'group-1' }]

    const res = await POST(request({ jwt: 'forged.jwt.value', body: { callId: 'call-1' } }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/session/i) })
  })

  it('requires a callId', async () => {
    mock.state.sessions.set('good-jwt', { id: 'user-1' })

    const res = await POST(request({ jwt: 'good-jwt', body: {} }))

    expect(res.status).toBe(400)
  })
})

describe('POST /api/live-voice-chat/token — authorization', () => {
  it('refuses a room the caller is not a member of', async () => {
    mock.state.sessions.set('good-jwt', { id: 'user-1' })
    // RLS hides this call from the caller, so the lookup returns nothing.
    mock.state.visibleCalls = []

    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-secret' } }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/not found or not allowed/i) })
  })

  it('checks membership through the calls table, not by trusting the request', async () => {
    mock.state.sessions.set('good-jwt', { id: 'user-1' })
    mock.state.visibleCalls = [{ id: 'call-1', group_id: 'group-1' }]

    await POST(request({ jwt: 'good-jwt', body: { callId: 'call-1' } }))

    expect(mock.state.tablesQueried).toEqual(['live_voice_chat_calls'])
  })

  it('runs the lookup as the caller, so RLS applies to that user', async () => {
    mock.state.sessions.set('good-jwt', { id: 'user-1' })
    mock.state.visibleCalls = [{ id: 'call-1', group_id: 'group-1' }]

    await POST(request({ jwt: 'good-jwt', body: { callId: 'call-1' } }))

    expect(mock.state.clientAuthHeader).toBe('Bearer good-jwt')
  })
})

describe('POST /api/live-voice-chat/token — issued grant', () => {
  beforeEach(() => {
    mock.state.sessions.set('good-jwt', {
      id: 'user-1',
      email: 'a@example.com',
      user_metadata: { full_name: 'Ayush' },
    })
    mock.state.visibleCalls = [{ id: 'call-abc', group_id: 'group-1' }]
  })

  it('issues a token granted to live-voice-chat-<call id>', async () => {
    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-abc' } }))
    expect(res.status).toBe(200)

    const body = await res.json()
    const payload = decode(body.token)

    expect(payload.video.room).toBe('live-voice-chat-call-abc')
    expect(payload.sub).toBe('user-1')
    expect(body.url).toBe('wss://example.livekit.cloud')
  })

  it('never grants the old gupshup room name', async () => {
    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-abc' } }))
    const payload = decode((await res.json()).token)

    expect(payload.video.room).not.toContain('gupshup')
  })

  it('grants publish and subscribe but no admin privileges', async () => {
    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-abc' } }))
    const payload = decode((await res.json()).token)
    const grant = payload.video

    expect(grant.roomJoin).toBe(true)
    expect(grant.canPublish).toBe(true)
    expect(grant.canSubscribe).toBe(true)
    expect(grant.roomAdmin).toBeFalsy()
    expect(grant.roomCreate).toBeFalsy()
    expect(payload.video.roomRecord).toBeFalsy()
  })

  it('never returns the LiveKit API secret to the client', async () => {
    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-abc' } }))
    const raw = JSON.stringify(await res.json())

    expect(raw).not.toContain(process.env.LIVEKIT_API_SECRET!)
    expect(raw).not.toContain(process.env.LIVEKIT_API_KEY!)
  })

  it('names the participant from their profile name', async () => {
    const res = await POST(request({ jwt: 'good-jwt', body: { callId: 'call-abc' } }))
    const payload = decode((await res.json()).token)

    expect(payload.name).toBe('Ayush')
  })
})
