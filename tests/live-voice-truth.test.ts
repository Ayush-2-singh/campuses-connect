/**
 * fetchLiveVoiceRooms — the single read path behind every "LIVE" claim
 * (hub badges, room header, floating voice card, chat flash card, home
 * cards). These tests pin down what "real" means here:
 *
 *   1. The honest RPC wins: rows map to rooms with their true participant
 *      counts, and any row that reports 0 participants is dropped — an
 *      empty room is NEVER live.
 *   2. Before the migration (20260927_voice_live_truth.sql) is applied, the
 *      fallback verifies presence from participant rows and DROPS calls it
 *      cannot verify (RLS hides the rows) instead of assuming they're live.
 *   3. Nothing ever throws: a dead read path degrades to zero claimed-live
 *      rooms, never to a wrong badge.
 */
import { describe, expect, it } from 'vitest'
import { fetchLiveVoiceRooms } from '@/lib/liveVoice'

type Row = Record<string, any>

function makeSb(opts: {
  rpc?: { data?: any; error?: any }
  rpcThrows?: boolean
  tablesThrow?: boolean
  calls?: Row[]
  participants?: Row[]
}) {
  const tablesQueried: string[] = []
  const sb: any = {
    rpc: async () => {
      if (opts.rpcThrows) throw new Error('network down')
      return opts.rpc ?? { data: null, error: { message: 'function not found', code: 'PGRST202' } }
    },
    from(table: string) {
      if (opts.tablesThrow) throw new Error('network down')
      tablesQueried.push(table)
      const rows = table === 'live_voice_chat_calls' ? (opts.calls ?? []) : (opts.participants ?? [])
      // Thenable chain: stands in for PostgREST's builder being awaited.
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        in: () => chain,
        then: (onFulfilled: any, onRejected: any) =>
          Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
      }
      return chain
    },
  }
  return { sb, tablesQueried }
}

describe('fetchLiveVoiceRooms — honest RPC path', () => {
  it('maps RPC rows and reports the real participant counts', async () => {
    const { sb, tablesQueried } = makeSb({
      rpc: {
        data: [
          {
            group_id: 'g1',
            call_id: 'c1',
            group_name: 'DSA Doubts',
            group_icon: '🧩',
            participant_count: 3,
            started_at: '2026-09-27T10:00:00Z',
          },
          {
            group_id: 'g2',
            call_id: 'c2',
            group_name: 'Chill Room',
            group_icon: null,
            participant_count: 1,
            started_at: null,
          },
        ],
      },
    })

    const rooms = await fetchLiveVoiceRooms(sb)

    expect(rooms.map((r) => ({ groupId: r.groupId, count: r.participantCount }))).toEqual([
      { groupId: 'g1', count: 3 },
      { groupId: 'g2', count: 1 },
    ])
    expect(rooms[0].name).toBe('DSA Doubts')
    expect(tablesQueried).toEqual([]) // the RPC alone is enough
  })

  it('drops any row with nobody inside, even if the server sends it', async () => {
    const { sb } = makeSb({
      rpc: { data: [{ group_id: 'g1', call_id: 'c1', group_name: 'Ghost', participant_count: 0 }] },
    })

    expect(await fetchLiveVoiceRooms(sb)).toEqual([])
  })
})

describe('fetchLiveVoiceRooms — fallback before the migration is applied', () => {
  it('keeps only calls with visible present participants', async () => {
    const { sb, tablesQueried } = makeSb({
      rpc: { data: null, error: { code: 'PGRST202' } },
      calls: [
        {
          id: 'c1',
          group_id: 'g1',
          started_at: '2026-09-27T10:00:00Z',
          live_voice_chat_groups: { name: 'DSA', icon: '🧩' },
        },
        {
          id: 'c2',
          group_id: 'g2',
          started_at: null,
          live_voice_chat_groups: { name: 'Empty', icon: null },
        },
      ],
      participants: [
        { call_id: 'c1', left_at: null },
        { call_id: 'c1', left_at: null },
        { call_id: 'c1', left_at: '2026-09-27T10:05:00Z' }, // one user left
        { call_id: 'c2', left_at: '2026-09-27T10:05:00Z' }, // nobody left inside
      ],
    })

    const rooms = await fetchLiveVoiceRooms(sb)

    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toMatchObject({ groupId: 'g1', callId: 'c1', participantCount: 2, name: 'DSA' })
    expect(tablesQueried).toEqual(['live_voice_chat_calls', 'live_voice_chat_participants'])
  })

  it('treats presence it cannot verify (hidden by RLS) as NOT live', async () => {
    const { sb } = makeSb({
      rpc: { data: null, error: { code: 'PGRST202' } },
      calls: [
        {
          id: 'c9',
          group_id: 'g9',
          started_at: null,
          live_voice_chat_groups: { name: 'Secret room', icon: null },
        },
      ],
      participants: [], // the caller may not read these rows
    })

    expect(await fetchLiveVoiceRooms(sb)).toEqual([])
  })

  it('degrades to zero rooms when every read fails — never throws', async () => {
    const { sb } = makeSb({ rpcThrows: true, tablesThrow: true })
    await expect(fetchLiveVoiceRooms(sb)).resolves.toEqual([])
  })
})
