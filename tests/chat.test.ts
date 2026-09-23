import { describe, expect, it } from 'vitest'
import {
  CHAT_MAX_BODY,
  actionNeedsConfirm,
  actionNeedsDuration,
  activeLabel,
  canModerate,
  chatErrorCopy,
  describeDuration,
  formatCount,
  groupMessages,
  initials,
  isSendable,
  isValidDuration,
  postingReasonCopy,
  postingVerdict,
  replyPreview,
  unreadLabel,
  type ChatMessageRow,
} from '@/lib/chat'

const row = (over: Partial<ChatMessageRow> = {}): ChatMessageRow => ({
  id: 'm1',
  community_id: 'c1',
  author_id: 'u1',
  body: 'hello',
  created_at: '2026-09-24T10:00:00.000Z',
  ...over,
})

describe('isSendable', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(isSendable('')).toBe(false)
    expect(isSendable('   ')).toBe(false)
    expect(isSendable('\n\t ')).toBe(false)
  })

  it('accepts real content', () => {
    expect(isSendable('hi')).toBe(true)
  })

  it('accepts an attachment with no text', () => {
    expect(isSendable('', true)).toBe(true)
  })

  it('accepts exactly the max length and rejects one character more', () => {
    expect(isSendable('a'.repeat(CHAT_MAX_BODY))).toBe(true)
    expect(isSendable('a'.repeat(CHAT_MAX_BODY + 1))).toBe(false)
  })

  it('measures length after trimming', () => {
    expect(isSendable(`  ${'a'.repeat(CHAT_MAX_BODY)}  `)).toBe(true)
  })
})

describe('chatErrorCopy', () => {
  it('maps each server rejection code to actionable copy', () => {
    expect(chatErrorCopy('banned')).toMatch(/banned/i)
    expect(chatErrorCopy('muted')).toMatch(/muted/i)
    expect(chatErrorCopy('not_a_member')).toMatch(/join/i)
    expect(chatErrorCopy('not_allowed')).toMatch(/permission/i)
    expect(chatErrorCopy('cannot_moderate_self')).toMatch(/yourself/i)
    expect(chatErrorCopy('cannot_moderate_admin')).toMatch(/another admin/i)
  })

  it('matches the code case-insensitively and inside a larger message', () => {
    expect(chatErrorCopy('ERROR:  chat_closed')).toMatch(/closed/i)
  })

  it('falls back to the raw message, then to a generic string', () => {
    expect(chatErrorCopy('some unusual failure')).toBe('some unusual failure')
    expect(chatErrorCopy('')).toMatch(/something went wrong/i)
    expect(chatErrorCopy(null)).toMatch(/something went wrong/i)
  })
})

describe('postingVerdict — mirrors can_post_chat()', () => {
  const base = { signedIn: true, isMember: true, chatEnabled: true, blockReason: null as null }

  it('allows a signed-in member in an open room', () => {
    expect(postingVerdict(base)).toEqual({ allowed: true, reason: null })
  })

  it('blocks a signed-out visitor first', () => {
    expect(postingVerdict({ ...base, signedIn: false })).toEqual({ allowed: false, reason: 'sign_in' })
  })

  it('blocks a non-member with a join prompt', () => {
    expect(postingVerdict({ ...base, isMember: false })).toEqual({ allowed: false, reason: 'join' })
  })

  it('prioritises ban over mute and membership', () => {
    expect(postingVerdict({ ...base, isMember: false, blockReason: 'banned' })).toEqual({
      allowed: false,
      reason: 'banned',
    })
  })

  it('blocks a muted member from sending', () => {
    expect(postingVerdict({ ...base, blockReason: 'muted' })).toEqual({ allowed: false, reason: 'muted' })
  })

  it('blocks everyone when chat is disabled', () => {
    expect(postingVerdict({ ...base, chatEnabled: false })).toEqual({ allowed: false, reason: 'closed' })
  })

  it('always explains a blocked composer', () => {
    for (const reason of ['sign_in', 'join', 'banned', 'muted', 'closed'] as const) {
      expect(postingReasonCopy(reason).length).toBeGreaterThan(0)
    }
    expect(postingReasonCopy(null)).toBe('')
  })
})

describe('durations', () => {
  it('accepts the presets from the spec and indefinite', () => {
    expect(isValidDuration(10)).toBe(true)
    expect(isValidDuration(60)).toBe(true)
    expect(isValidDuration(1440)).toBe(true)
    expect(isValidDuration(null)).toBe(true)
    expect(isValidDuration(undefined)).toBe(true)
  })

  it('rejects zero, negative and absurd durations', () => {
    expect(isValidDuration(0)).toBe(false)
    expect(isValidDuration(-5)).toBe(false)
    expect(isValidDuration(60 * 24 * 366)).toBe(false)
  })

  it('describes durations for confirmation copy', () => {
    expect(describeDuration(10)).toBe('10 minutes')
    expect(describeDuration(1)).toBe('1 minute')
    expect(describeDuration(60)).toBe('1 hour')
    expect(describeDuration(120)).toBe('2 hours')
    expect(describeDuration(1440)).toBe('1 day')
    expect(describeDuration(null)).toBe('Indefinite')
  })

  it('only mute and ban take a duration', () => {
    expect(actionNeedsDuration('mute')).toBe(true)
    expect(actionNeedsDuration('ban')).toBe(true)
    expect(actionNeedsDuration('warn')).toBe(false)
    expect(actionNeedsDuration('kick')).toBe(false)
  })

  it('only destructive actions need a confirm step', () => {
    expect(actionNeedsConfirm('kick')).toBe(true)
    expect(actionNeedsConfirm('ban')).toBe(true)
    expect(actionNeedsConfirm('warn')).toBe(false)
    expect(actionNeedsConfirm('mute')).toBe(false)
  })
})

describe('canModerate — mirrors the guards in moderate_chat()', () => {
  const actor = { adminId: 'admin-1', targetId: 'user-2', adminIsPlatformAdmin: false, targetIsPlatformAdmin: false }

  it('allows a community admin to action a normal user', () => {
    expect(canModerate(actor)).toBe(true)
  })

  it('refuses self-moderation', () => {
    expect(canModerate({ ...actor, targetId: 'admin-1' })).toBe(false)
  })

  it('refuses to action a platform admin unless the actor is one', () => {
    expect(canModerate({ ...actor, targetIsPlatformAdmin: true })).toBe(false)
    expect(canModerate({ ...actor, targetIsPlatformAdmin: true, adminIsPlatformAdmin: true })).toBe(true)
  })

  it('refuses when there is no actor', () => {
    expect(canModerate({ ...actor, adminId: null })).toBe(false)
  })
})

describe('groupMessages', () => {
  it('groups a burst from one author inside the window', () => {
    const out = groupMessages([
      row({ id: 'a', created_at: '2026-09-24T10:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-09-24T10:01:00.000Z' }),
      row({ id: 'c', created_at: '2026-09-24T10:04:00.000Z' }),
    ])
    expect(out.map((m) => m.groupWithPrev)).toEqual([false, true, true])
  })

  it('breaks the group when the author changes', () => {
    const out = groupMessages([
      row({ id: 'a', author_id: 'u1' }),
      row({ id: 'b', author_id: 'u2', created_at: '2026-09-24T10:01:00.000Z' }),
    ])
    expect(out.map((m) => m.groupWithPrev)).toEqual([false, false])
  })

  it('breaks the group across the time window', () => {
    const out = groupMessages([
      row({ id: 'a', created_at: '2026-09-24T10:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-09-24T10:30:00.000Z' }),
    ])
    expect(out[1].groupWithPrev).toBe(false)
  })

  it('breaks the group on a new day even inside the window', () => {
    // Built from LOCAL components on purpose: day separators follow the
    // viewer's day, so the boundary must be expressed in the local timezone or
    // this assertion would pass or fail depending on where the test runs.
    const lateToday = new Date(2026, 8, 24, 23, 59, 0).toISOString()
    const justAfterMidnight = new Date(2026, 8, 25, 0, 1, 0).toISOString()

    const out = groupMessages([
      row({ id: 'a', created_at: lateToday }),
      row({ id: 'b', created_at: justAfterMidnight }),
    ])

    expect(out[1].groupWithPrev).toBe(false)
  })

  it('never groups the first message and preserves order', () => {
    const out = groupMessages([row({ id: 'a' }), row({ id: 'b', created_at: '2026-09-24T10:01:00.000Z' })])
    expect(out[0].groupWithPrev).toBe(false)
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('handles an empty list', () => {
    expect(groupMessages([])).toEqual([])
  })
})

describe('display helpers', () => {
  it('formats counts', () => {
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(null)).toBe('0')
  })

  it('shows no presence label when nobody is active, rather than a fake one', () => {
    expect(activeLabel(0)).toBeNull()
    expect(activeLabel(null)).toBeNull()
    expect(activeLabel(37)).toBe('37 active now')
  })

  it('caps the unread badge', () => {
    expect(unreadLabel(0)).toBeNull()
    expect(unreadLabel(4)).toBe('4')
    expect(unreadLabel(1000)).toBe('99+')
  })

  it('builds initials for the avatar fallback', () => {
    expect(initials('Ayush Singh')).toBe('AS')
    expect(initials('priya')).toBe('P')
    expect(initials('')).toBe('?')
    expect(initials(null)).toBe('?')
  })

  it('flattens a reply quote and labels a photo-only message', () => {
    expect(replyPreview('line one\nline two')).toBe('line one line two')
    expect(replyPreview('')).toBe('Photo')
    expect(replyPreview('x'.repeat(200)).endsWith('…')).toBe(true)
  })
})
