// ═══════════════════════════════════════════════════════════════════════════
// Code Sprint 60 — pure helpers for the timed code typing mode.
//
// The text itself comes from `code_sprint_text()` on the server (seeded by the
// day, or by a challenge link's seed) and is whitespace-normalised there, so a
// sprint is typed as space-separated words exactly like the typing battle. That
// is deliberate: the existing TypingTracker already enforces "wrong words don't
// advance, paste is blocked, per-character accuracy", so this mode only adds the
// 60-second clock and the code-specific metrics below.
//
// No React, no Supabase — unit-testable.
// ═══════════════════════════════════════════════════════════════════════════

/** A sprint is always 60 seconds; the server allows 5–180s of submitted time. */
export const CODE_SPRINT_MS = 60_000

/** Consistent with the server's submission guard (see 20261140). */
export const CODE_SPRINT_MAX_WPM = 220

/** Minimum typed time the server will accept. */
export const CODE_SPRINT_MIN_MS = 5_000

/**
 * Collapse every whitespace run (indentation, newlines, tabs) into one space.
 * The SQL generator does the same, so client and server split identical words.
 */
export function normalizeSnippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

export type SprintStats = { net: number; raw: number; accuracy: number }

/**
 * net  = correct characters / 5 per minute (what a typing test calls WPM)
 * raw  = every typed character / 5 per minute
 * accuracy = correct / typed
 */
export function sprintStats(correctChars: number, typedChars: number, durationMs: number): SprintStats {
  const minutes = Math.max(durationMs, 1) / 60_000
  const typed = Math.max(typedChars, 0)
  return {
    net: Math.max(correctChars, 0) / 5 / minutes,
    raw: typed / 5 / minutes,
    accuracy: typed > 0 ? (Math.max(correctChars, 0) / typed) * 100 : 100,
  }
}

/**
 * Consistency: 100 minus the coefficient of variation of the per-second WPM
 * samples (Monkeytype's idea, simplified). A steady 80 WPM run scores ~90+; a
 * run that starts at 110, stalls and sprints scores low.
 */
export function consistency(wpmSamples: number[]): number {
  const xs = wpmSamples.filter((n) => Number.isFinite(n) && n >= 0)
  if (xs.length < 2) return 100
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  if (mean <= 0) return 0
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length
  const cv = Math.sqrt(variance) / mean
  return Math.max(0, Math.min(100, Math.round(100 - cv * 100)))
}

/** "1m 00s" style label for the timer. */
export function sprintClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "3" → "2" → "1" → "GO!" label for the room countdown. */
export function countdownStyle(startsAt: number, now: number): string {
  const left = startsAt - now
  if (left <= 0) return 'GO!'
  if (left <= 1000) return '1'
  if (left <= 2000) return '2'
  return '3'
}

/** A seed for a challenge link — both players then type the same snippets. */
export function newSprintSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `sprint:${crypto.randomUUID().slice(0, 8)}`
  return `sprint:${Math.random().toString(36).slice(2, 10)}`
}
