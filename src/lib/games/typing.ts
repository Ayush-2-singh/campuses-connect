// ═══════════════════════════════════════════════════════════════════════════
// Typing Battle — pure game logic. No React, no Supabase: everything here is
// unit-testable and mirrors the server-side validation in 049 exactly.
// The server recomputes and re-checks ALL of this; the client copy exists so
// the UI feels instant and never shows a number the server would reject.
// ═══════════════════════════════════════════════════════════════════════════

import { GAME_CONFIG } from './config'

/** MVP word pool (spec §5) — kept in sync with typing_word_pool() in SQL. */
export const TYPING_WORD_POOL: string[] = [
  // Easy
  'code',
  'campus',
  'student',
  'college',
  'class',
  'react',
  'web',
  'build',
  'start',
  'team',
  // Medium
  'database',
  'javascript',
  'developer',
  'algorithm',
  'backend',
  'network',
  'security',
  'framework',
  'project',
  'startup',
  // Hard
  'authentication',
  'asynchronous',
  'architecture',
  'optimization',
  'implementation',
  'concurrency',
]

export const TYPING_WORD_COUNT = 10

export type TypingPhase =
  | 'entry' // mode picker: quick match / create / join / daily
  | 'finding' // quick match queue
  | 'lobby' // private room, both players ready up
  | 'countdown' // 3-2-1-GO
  | 'playing'
  | 'finished'

/** words for a deterministic daily seed — mirrors typing_daily_words() in SQL. */
export function dailyWords(day: string, pool: string[] = TYPING_WORD_POOL): string[] {
  // 32-bit seed from an md5-shaped hex prefix (same idea as the SQL LCG).
  let seed = parseInt(day.replace(/-/g, '').slice(0, 8), 16) || 1
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const out = [...pool]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.slice(0, TYPING_WORD_COUNT)
}

/** WPM = (correct characters / 5) / elapsed minutes (spec §8). */
export function wpm(correctChars: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0
  return correctChars / 5 / (elapsedSeconds / 60)
}

/** accuracy = correct / total typed × 100 (spec §9). */
export function accuracy(correctChars: number, totalChars: number): number {
  if (totalChars <= 0) return 100
  return (correctChars / totalChars) * 100
}

/** Server-side shape of a completion verdict (subset the UI shows). */
export interface TypingVerdict {
  status: 'won' | 'lost' | 'already'
  wpm: number
  accuracy: number
  duration_ms: number
  correct: number
  total: number
  winner: string | null
}

/**
 * Deterministic winner logic shared with complete_typing_match(): first valid
 * completion wins; equal times break by accuracy, then by submit order.
 */
export function decideWinner(
  a: { completedAtMs: number; accuracy: number },
  b: { completedAtMs: number; accuracy: number }
): 'a' | 'b' | 'tie' {
  if (a.completedAtMs !== b.completedAtMs) return a.completedAtMs < b.completedAtMs ? 'a' : 'b'
  if (Math.abs(a.accuracy - b.accuracy) > 0.001) return a.accuracy > b.accuracy ? 'a' : 'b'
  return 'tie'
}

/** Client-side validation mirror: times the server calls impossible. */
export function isPossibleDuration(ms: number): boolean {
  return ms >= 2000 && ms <= 900_000
}

/**
 * TypingTracker — per-keystroke state machine for one player.
 * Rules enforced (spec §7):
 *   • words must be typed in order; no skipping
 *   • a word completes on space when its text matches exactly (wrong words
 *     are counted as typed-but-incorrect and must be retyped — backspace
 *     allowed within the current word)
 *   • paste is disabled by the input; the tracker also ignores 6+ char jumps
 */
export class TypingTracker {
  readonly words: string[]
  readonly startedAtMs: number
  private current = ''
  private completed = 0
  private correctChars = 0
  private totalTyped = 0
  private finishedAtMs: number | null = null
  /** Words as actually typed, one entry per completed word (honest submission). */
  private typedWords: string[] = []

  constructor(words: string[], startedAtMs: number) {
    this.words = words
    this.startedAtMs = startedAtMs
  }

  get completedWords(): number {
    return this.completed
  }

  get currentInput(): string {
    return this.current
  }

  get isFinished(): boolean {
    return this.finishedAtMs !== null
  }

  /** The words the player actually completed, in order (server re-validates). */
  get submission(): string[] {
    return [...this.typedWords]
  }

  get elapsedMs(): number {
    return (this.finishedAtMs ?? Date.now()) - this.startedAtMs
  }

  get stats(): { wpm: number; accuracy: number; correctChars: number; totalTyped: number } {
    return {
      wpm: wpm(this.correctChars, this.elapsedMs / 1000),
      accuracy: accuracy(this.correctChars, this.totalTyped),
      correctChars: this.correctChars,
      totalTyped: this.totalTyped,
    }
  }

  /** Handle one keystroke. Returns true when a word was completed. */
  handleKey(key: string, nowMs: number = Date.now()): boolean {
    if (this.isFinished) return false

    if (key === 'Backspace') {
      if (this.current.length > 0) this.current = this.current.slice(0, -1)
      return false
    }

    if (key === ' ') {
      if (this.current.length === 0) return false // no empty submissions
      this.totalTyped += this.current.length + 1 // + the space
      if (this.current === this.words[this.completed]) {
        this.correctChars += this.words[this.completed].length + 1
        this.completed += 1
        this.typedWords.push(this.current)
        this.current = ''
        if (this.completed >= this.words.length) {
          this.finishedAtMs = nowMs
          return true
        }
        return true
      }
      // Wrong word: counts as typed, does NOT advance. The player must fix it.
      this.current = ''
      return false
    }

    // Printable single characters only (ignore paste bursts / meta keys).
    if (key.length === 1) {
      this.current += key
      this.totalTyped += 1
    }
    return false
  }

  /** Realtime payload — one tiny object per completed word, not per keystroke. */
  progressPayload(): { completed: number; correct: number; total: number } {
    return {
      completed: this.completed,
      correct: Math.round(this.stats.accuracy), // server recomputes; this is display-only
      total: this.words.length,
    }
  }
}

/** Countdown label from a server deadline (3 → 2 → 1 → GO). */
export function countdownLabel(startsAtMs: number, nowMs: number): string {
  const remaining = Math.ceil((startsAtMs - nowMs) / 1000)
  if (remaining <= 0) return 'GO!'
  return String(Math.min(remaining, GAME_CONFIG.COUNTDOWN_SECONDS))
}
