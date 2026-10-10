/**
 * TYPING ON MOBILE — guards the soft-keyboard input path.
 *
 * What was wrong on a phone (Android Chrome, reported live):
 *   1. the arena's input was keydown-only and its onChange was an explicit
 *      no-op — Android IMEs report composition keystrokes as
 *      key === 'Unidentified' (keyCode 229), so `e.key.length === 1` never
 *      matched and NOTHING was ever typed;
 *   2. the field was focused on mount but never re-focusable: focus() on an
 *      already-active element is a no-op, so once the keyboard was dismissed
 *      the match was unplayable.
 *
 * The fix replays the field's value diff onto the tracker (diffInput) and
 * cycles focus when the keyboard is gone. These tests cover the pure diff
 * behaviour end-to-end and pin the wiring that makes it reachable.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TypingTracker, diffInput } from '@/lib/games/typing'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const arena = read('src/components/games/TypingArena.tsx')

describe('diffInput — soft-keyboard value changes become tracker keys', () => {
  it('turns an appended character into that key', () => {
    expect(diffInput('re', 'rea')).toEqual(['a'])
  })

  it('turns a multi-character append into one key each, in order', () => {
    expect(diffInput('', 'abc')).toEqual(['a', 'b', 'c'])
  })

  it('turns the committing space into a space key', () => {
    expect(diffInput('react', 'react ')).toEqual([' '])
  })

  it('turns a deletion into a backspace', () => {
    expect(diffInput('react', 'reac')).toEqual(['Backspace'])
  })

  it('turns a multi-character deletion into that many backspaces', () => {
    expect(diffInput('react', 're')).toEqual(['Backspace', 'Backspace', 'Backspace'])
  })

  it('handles a mid-word edit as delete-then-retype', () => {
    expect(diffInput('react', 'reX')).toEqual(['Backspace', 'Backspace', 'Backspace', 'X'])
  })

  it('reports no keys when the value did not move', () => {
    expect(diffInput('abc', 'abc')).toEqual([])
  })

  it('rejects a paste-like burst so the tracker stays authoritative', () => {
    expect(diffInput('', 'react')).toBeNull()
    expect(diffInput('', 'campuscode')).toBeNull()
  })

  it('still accepts a short autocorrect-style insertion', () => {
    expect(diffInput('a', 'abcd')).toEqual(['b', 'c', 'd'])
  })
})

describe('desktop and mobile paths score identically', () => {
  // The whole point of replaying the field diff is that a phone must produce
  // exactly the same result as a hardware keyboard — otherwise the same match
  // would be judged differently per device.
  const words = ['code', 'campus']
  const text = 'code campus '

  const desktop = new TypingTracker(words, 0)
  for (const ch of text) desktop.handleKey(ch)

  const typeOnPhone = (tracker: TypingTracker, input: string) => {
    let field = ''
    for (const ch of input) {
      field += ch
      for (const key of diffInput(tracker.currentInput, field) ?? []) tracker.handleKey(key)
      // A committed word clears the field (React keeps it controlled by the
      // tracker's buffer) — mirror that so the next tap starts a new word.
      if (field !== tracker.currentInput) field = tracker.currentInput
    }
  }

  const mobile = new TypingTracker(words, 0)
  typeOnPhone(mobile, text)

  it('finishes with the same words, counts and stats', () => {
    expect(mobile.isFinished).toBe(desktop.isFinished)
    expect(mobile.completedWords).toBe(desktop.completedWords)
    expect(mobile.submission).toEqual(desktop.submission)
    expect(mobile.stats.totalTyped).toBe(desktop.stats.totalTyped)
    expect(mobile.stats.correctChars).toBe(desktop.stats.correctChars)
  })
})

describe('typing through the mobile path actually plays the game', () => {
  /** Mirrors TypingArena.handleChange: replay the field diff onto the tracker. */
  const makeMobileTypist = (words: string[]) => {
    const tracker = new TypingTracker(words, 0)
    const strokes: string[] = []
    const change = (nextValue: string) => {
      const keys = diffInput(tracker.currentInput, nextValue)
      if (!keys) return
      for (const key of keys) {
        strokes.push(key)
        tracker.handleKey(key)
        if (tracker.isFinished) break
      }
    }
    return { tracker, change, strokes }
  }

  it('completes a word when the field grows to "word "', () => {
    const { tracker, change } = makeMobileTypist(['code', 'campus'])
    // Each soft-keyboard tap appends one character to the field's value.
    for (const value of ['c', 'co', 'cod', 'code', 'code ']) change(value)
    expect(tracker.completedWords).toBe(1)
    expect(tracker.currentInput).toBe('')
  })

  it('counts only the characters the tracker accepted (no double-counting)', () => {
    const { tracker, change, strokes } = makeMobileTypist(['code'])
    for (const value of ['c', 'co', 'cod', 'code', 'code ']) change(value)
    expect(strokes.join('')).toBe('code ')
    expect(tracker.stats.totalTyped).toBe(5) // 4 chars + the committing space
  })

  it('lets a wrong word be deleted and retyped', () => {
    const { tracker, change } = makeMobileTypist(['code', 'campus'])
    // Grow the field one tap at a time, exactly like a soft keyboard does.
    const type = (text: string) => {
      let field = ''
      for (const ch of text) {
        field += ch
        change(field)
      }
    }

    type('codx ') // wrong word: counted, but must NOT advance
    expect(tracker.completedWords).toBe(0)
    expect(tracker.currentInput).toBe('') // commit attempt cleared the buffer

    type('code ') // retyped correctly
    expect(tracker.completedWords).toBe(1)
  })

  it('drives the tracker to finished across the whole word list', () => {
    const words = ['code', 'campus']
    const { tracker, change } = makeMobileTypist(words)
    let field = ''
    for (const word of words) {
      for (const ch of `${word} `) {
        field += ch
        change(field)
      }
      field = ''
    }
    expect(tracker.isFinished).toBe(true)
    expect(tracker.completedWords).toBe(words.length)
  })
})

describe('TypingArena wires up the mobile path', () => {
  it('routes the field through handleChange instead of a no-op', () => {
    expect(arena).toMatch(/onChange=\{handleChange\}/)
    expect(arena).not.toMatch(/controlled by keydown — mobile soft keyboards fall back here/)
  })

  it('lets IME/composition keystrokes fall through to onChange', () => {
    expect(arena).toMatch(/e\.nativeEvent\.isComposing \|\| e\.key === 'Unidentified'/)
  })

  it('uses the shared diffInput helper', () => {
    expect(arena).toMatch(/import \{ TypingTracker, diffInput \} from '@\/lib\/games\/typing'/)
    expect(arena).toMatch(/diffInput\(prev, e\.target\.value\)/)
  })

  it('funnels both input paths through one applyKey (single submit + broadcast)', () => {
    expect(arena).toMatch(/const applyKey = useCallback/)
    expect(arena).toMatch(/applyKey\('Backspace'\)/)
    expect(arena).toMatch(/applyKey\(' '\)/)
  })

  it('can bring the keyboard back after it was dismissed', () => {
    expect(arena).toMatch(/if \(document\.activeElement === input && !kbOpen\) input\.blur\(\)/)
  })
})

describe('TypingArena no longer claims to be desktop-only', () => {
  it('documents that phones are supported', () => {
    expect(arena).toMatch(/Works on desktop AND phones/)
  })
})
