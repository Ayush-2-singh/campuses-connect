/**
 * Live activity + Library tag guard.
 *
 * 1. The live pulse card's user controls (mute / session hide) are pure logic —
 *    lock them so the card can never trap a user who silenced it.
 * 2. Note UID tags have exactly one definition, so the chat renderer and the
 *    tag validator can never disagree about what counts as a Library reference.
 */
import { describe, expect, it } from 'vitest'
import {
  isPulseVisible,
  mentionFlash,
  PULSE_DEFAULT_PREFS,
  PULSE_MENTION_FLASH_MS,
  setPulseMuted,
  timeAgoLabel,
} from '@/lib/livePulsePrefs'
import { NOTE_UID_EXACT, noteUidHref, splitMessageParts } from '@/lib/noteUid'

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

describe('mention flash — a tag is a notification, not ambient activity', () => {
  const now = 1_000_000

  it('flashes a brand-new tag for exactly 5s', () => {
    const flash = mentionFlash(new Set(), ['chat-1'], true, now)
    expect(flash).toEqual({ until: now + PULSE_MENTION_FLASH_MS, key: 'chat-1' })
  })

  it('never flashes on the very first load (bootstrap) — refresh must not replay old tags', () => {
    expect(mentionFlash(new Set(), ['chat-1', 'chat-2'], false, now)).toBeNull()
  })

  it('does not re-flash an already-seen tag', () => {
    const seen = new Set(['chat-1'])
    expect(mentionFlash(seen, ['chat-1'], true, now)).toBeNull()
  })

  it('flashes only the first unseen tag', () => {
    const flash = mentionFlash(new Set(['chat-1']), ['chat-1', 'chat-2', 'chat-3'], true, now)
    expect(flash?.key).toBe('chat-2')
  })

  it('stays silent when there are no mentions at all', () => {
    expect(mentionFlash(new Set(), [], true, now)).toBeNull()
  })
})

describe('note UID tags — one definition of a Library reference', () => {
  it('splits a message into text, mentions and note tags', () => {
    // Trailing '' is standard String.split behaviour when the separator ends
    // the string — the chat renderer skips empty parts.
    expect(splitMessageParts('check CC-NOTE-XK42 out @ayush')).toEqual([
      'check ',
      'CC-NOTE-XK42',
      ' out ',
      '@ayush',
      '',
    ])
    expect(splitMessageParts('no tags here')).toEqual(['no tags here'])
    // Empty body short-circuits to nothing to render.
    expect(splitMessageParts('')).toEqual([])
  })

  it('accepts only the exact code shape (confusion-free alphabet)', () => {
    expect(NOTE_UID_EXACT.test('CC-NOTE-XK42')).toBe(true)
    expect(NOTE_UID_EXACT.test('CC-NOTE-AAAA')).toBe(true)
    // I, O, 0, 1 are excluded from the alphabet on purpose.
    expect(NOTE_UID_EXACT.test('CC-NOTE-AI0O')).toBe(false)
    expect(NOTE_UID_EXACT.test('CC-NOTE-XK4')).toBe(false)
    expect(NOTE_UID_EXACT.test('CC-NOTE-XK423')).toBe(false)
    expect(NOTE_UID_EXACT.test('javascript:alert(1)')).toBe(false)
  })

  it('builds a Library deep link', () => {
    expect(noteUidHref('CC-NOTE-XK42')).toBe('/notes?uid=CC-NOTE-XK42')
  })
})
