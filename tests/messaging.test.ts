import { describe, expect, it } from 'vitest'
import {
  buildNetwork,
  chatPeerId,
  connectionBetween,
  connectionState,
  conversationPreview,
  formatMessageTime,
  formatRelativeTime,
  latestByConversation,
  peerOf,
  totalUnread,
  unreadByConversation,
  type ConnectionRow,
  type MessageRow,
} from '@/lib/messaging'

const ME = 'me'
const PEER = 'peer'

const row = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
  id: 'c1',
  requester_id: ME,
  receiver_id: PEER,
  status: 'pending',
  ...over,
})

describe('connection state', () => {
  it('reads the peer from either direction', () => {
    expect(peerOf(row(), ME)).toBe(PEER)
    expect(peerOf(row({ requester_id: PEER, receiver_id: ME }), ME)).toBe(PEER)
  })

  it('returns none when there is no row between the two students', () => {
    expect(connectionState([row({ receiver_id: 'someone-else' })], ME, PEER)).toBe('none')
  })

  it('treats an accepted row as mutual', () => {
    expect(connectionState([row({ status: 'accepted' })], PEER, ME)).toBe('accepted')
  })

  it('knows who sent a pending request', () => {
    expect(connectionState([row()], ME, PEER)).toBe('pending_sent')
    expect(connectionState([row({ requester_id: PEER, receiver_id: ME })], ME, PEER)).toBe('pending_received')
  })

  it('prefers the incoming request when both directions exist', () => {
    expect(
      connectionState(
        [
          row({ id: 'mine', requester_id: ME, receiver_id: PEER }),
          row({ id: 'theirs', requester_id: PEER, receiver_id: ME }),
        ],
        ME,
        PEER
      )
    ).toBe('pending_received')
  })

  it('finds the row so it can be accepted or withdrawn', () => {
    const pending = row({ requester_id: PEER, receiver_id: ME })
    expect(connectionBetween([pending], ME, PEER)?.id).toBe('c1')
    expect(connectionBetween([row({ receiver_id: 'x' })], ME, PEER)).toBeNull()
  })

  it('splits connections into accepted, received and sent', () => {
    const network = buildNetwork(
      [
        row({ id: 'a', status: 'accepted' }),
        row({ id: 'b', requester_id: PEER, receiver_id: ME, status: 'pending' }),
        row({ id: 'c', requester_id: ME, receiver_id: 'third', status: 'pending' }),
      ],
      ME
    )
    expect(network.accepted).toEqual([{ id: 'a', peerId: PEER }])
    expect(network.received).toEqual([{ id: 'b', peerId: PEER }])
    expect(network.sent).toEqual([{ id: 'c', peerId: 'third' }])
  })

  it('never counts a self-connection', () => {
    const network = buildNetwork([row({ requester_id: ME, receiver_id: ME, status: 'accepted' })], ME)
    expect(network).toEqual({ accepted: [], received: [], sent: [] })
  })
})

const msg = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1',
  conversation_id: 'conv',
  sender_id: PEER,
  content: 'hello',
  created_at: '2026-10-30T10:00:00.000Z',
  ...over,
})

const conv = (over: { last_read_at?: string | null; participants?: string[] } = {}) => ({
  id: 'conv',
  conversation_participants: (over.participants ?? [ME, PEER]).map((id) => ({
    profile_id: id,
    last_read_at: id === ME ? (over.last_read_at ?? null) : null,
  })),
})

describe('conversation list', () => {
  it('keeps the newest message per conversation and skips deleted ones', () => {
    const latest = latestByConversation([
      msg({ id: 'old', created_at: '2026-10-30T09:00:00.000Z' }),
      msg({ id: 'new', created_at: '2026-10-30T11:00:00.000Z' }),
      msg({ id: 'deleted', created_at: '2026-10-30T12:00:00.000Z', is_deleted: true }),
    ])
    expect(latest.conv.id).toBe('new')
  })

  it('counts only peer messages newer than my last read', () => {
    const counts = unreadByConversation(
      [conv({ last_read_at: '2026-10-30T10:30:00.000Z' })],
      [
        msg({ id: 'mine', sender_id: ME, created_at: '2026-10-30T11:00:00.000Z' }),
        msg({ id: 'read', created_at: '2026-10-30T10:00:00.000Z' }),
        msg({ id: 'unread1', created_at: '2026-10-30T10:45:00.000Z' }),
        msg({ id: 'unread2', created_at: '2026-10-30T10:50:00.000Z' }),
      ],
      ME
    )
    expect(counts.conv).toBe(2)
  })

  it('treats a never-opened thread as all unread', () => {
    const counts = unreadByConversation([conv()], [msg(), msg({ id: 'm2' })], ME)
    expect(counts.conv).toBe(2)
  })

  it('adds up the tab badge', () => {
    expect(totalUnread({ a: 2, b: 0, c: 1 })).toBe(3)
  })

  it('previews the last line, marking my own messages', () => {
    expect(conversationPreview(msg({ content: 'see you' }), ME)).toBe('see you')
    expect(conversationPreview(msg({ content: 'see you', sender_id: ME }), ME)).toBe('You: see you')
    expect(conversationPreview(null, ME)).toContain('Say hi')
  })

  it('finds the other participant, including when I am second', () => {
    expect(chatPeerId(conv(), ME)).toBe(PEER)
    expect(chatPeerId(conv({ participants: [PEER, ME] }), ME)).toBe(PEER)
  })
})

describe('time formatting', () => {
  const now = new Date('2026-10-30T12:00:00.000Z').getTime()

  it('uses compact units for the list', () => {
    expect(formatRelativeTime('2026-10-30T11:59:40.000Z', now)).toBe('now')
    expect(formatRelativeTime('2026-10-30T11:55:00.000Z', now)).toBe('5m')
    expect(formatRelativeTime('2026-10-30T09:00:00.000Z', now)).toBe('3h')
    expect(formatRelativeTime('2026-10-28T12:00:00.000Z', now)).toBe('2d')
  })

  it('labels today and yesterday in the thread', () => {
    const today = new Date(2026, 9, 30, 9, 41).toISOString()
    expect(formatMessageTime(today, now)).toMatch(/9:41/)
    const yesterday = new Date(2026, 9, 29, 9, 41).toISOString()
    expect(formatMessageTime(yesterday, now)).toMatch(/^Yesterday, /)
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('')
    expect(formatMessageTime('not-a-date', now)).toBe('')
  })
})
