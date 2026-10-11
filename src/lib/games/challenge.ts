// ═══════════════════════════════════════════════════════════════════════════
// BEAT MY SCORE — the shareable challenge link.
//
// A challenge is entirely self-describing: everything the recipient needs
// (who set it, the score to beat, and a SEED so both players run the identical
// round) travels inside the URL. No table, no account, no server call — which
// is what makes this a half-day feature AND what makes the link work for a
// guest who has never signed in.
//
// The run itself is SOLO and local. The invited player never joins a room, so
// nothing here can touch a live match, the daily leaderboard or Aura.
// ═══════════════════════════════════════════════════════════════════════════

import { GAME_CONFIG } from './config'
import { TYPING_WORD_POOL, TYPING_WORD_COUNT, wpm, accuracy } from './typing'
import type { Difficulty } from './types'
import { copyToClipboard } from './utils'

export type ChallengeGame = 'typing' | 'math'

export interface ChallengePayload {
  /** Which game the run belongs to. */
  g: ChallengeGame
  /** The challenger's display name. */
  n: string
  /** The score to beat — WPM (typing) or points (math). */
  s: number
  /** Secondary metric — accuracy % (typing) or correct answers (math). */
  a?: number
  /** The seed. Both players run the exact same words / questions. */
  d: string
  /** Quick Math difficulty. */
  l?: Difficulty
}

const MAX_NAME = 20

/** Deterministic 32-bit hash of a seed string (FNV-1a). */
export function seedFromString(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

/** Small, fast, deterministic PRNG — same family used by the daily shuffle. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The exact words both players race over — a seed-keyed shuffle of the pool. */
export function challengeWords(seed: string, pool: string[] = TYPING_WORD_POOL): string[] {
  const rand = mulberry32(seedFromString(seed))
  const out = [...pool]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.slice(0, TYPING_WORD_COUNT)
}

export interface ChallengeQuestion {
  text: string
  answer: number
}

/**
 * Deterministic Quick Math questions, so both players solve the SAME set.
 * Generated locally on purpose: the multiplayer generator lives behind
 * create_game_room(), and a challenge must not need a room at all.
 */
export function challengeQuestions(seed: string, difficulty: Difficulty = 'medium'): ChallengeQuestion[] {
  const rand = mulberry32(seedFromString(`${seed}:${difficulty}`))
  const ops: string[] = difficulty === 'easy' ? ['+', '−'] : ['+', '−', '×', '÷']
  const range = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 50 : 99
  const out: ChallengeQuestion[] = []

  for (let i = 0; i < GAME_CONFIG.TOTAL_ROUNDS; i++) {
    const op = ops[Math.floor(rand() * ops.length)]
    let text = ''
    let answer = 0

    if (op === '÷') {
      const divisor = 2 + Math.floor(rand() * 9)
      const quotient = 2 + Math.floor(rand() * (difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 40))
      answer = quotient
      text = `${quotient * divisor} ÷ ${divisor}`
    } else if (op === '×') {
      const a = 2 + Math.floor(rand() * (difficulty === 'easy' ? 9 : difficulty === 'medium' ? 12 : 20))
      const b = 2 + Math.floor(rand() * (difficulty === 'easy' ? 9 : 12))
      answer = a * b
      text = `${a} × ${b}`
    } else {
      let a = 1 + Math.floor(rand() * range)
      let b = 1 + Math.floor(rand() * range)
      if (op === '−' && b > a) [a, b] = [b, a]
      answer = op === '+' ? a + b : a - b
      text = `${a} ${op} ${b}`
    }

    out.push({ text, answer })
  }
  return out
}

/** Points for one Quick Math answer — same shape as the server's award. */
export function mathPoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0
  const bonus = Math.max(0, GAME_CONFIG.SPEED_BONUS_MAX - Math.floor(elapsedMs / GAME_CONFIG.SPEED_BONUS_INTERVAL))
  return GAME_CONFIG.BASE_POINTS + bonus
}

/** WPM + accuracy for a finished solo typing run. */
export function typingResult(correctChars: number, totalTyped: number, durationMs: number) {
  return {
    wpm: Math.round(wpm(correctChars, durationMs / 1000)),
    accuracy: Math.round(accuracy(correctChars, totalTyped)),
  }
}

export type ChallengeOutcome = 'beat' | 'tied' | 'lost'

export function compareChallenge(mine: number, theirs: number): ChallengeOutcome {
  if (mine > theirs) return 'beat'
  if (mine === theirs) return 'tied'
  return 'lost'
}

/** "42 WPM" / "1250 pts" — one label everywhere the score is shown. */
export function challengeScoreLabel(game: ChallengeGame, score: number): string {
  return game === 'typing' ? `${score} WPM` : `${score} pts`
}

// ── URL (de)serialisation ────────────────────────────────────────────────────

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeChallenge(payload: ChallengePayload): string {
  return toBase64Url(JSON.stringify(payload))
}

/** Decode defensively: a mangled link must degrade to null, never throw. */
export function decodeChallenge(raw: string | null | undefined): ChallengePayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(fromBase64Url(raw))
    if (!parsed || (parsed.g !== 'typing' && parsed.g !== 'math')) return null
    if (typeof parsed.s !== 'number' || typeof parsed.d !== 'string' || !parsed.d) return null
    const level = parsed.l
    return {
      g: parsed.g,
      n: String(parsed.n || 'A student').slice(0, MAX_NAME),
      s: Math.max(0, Math.round(parsed.s)),
      a: typeof parsed.a === 'number' ? Math.max(0, Math.round(parsed.a)) : undefined,
      d: String(parsed.d),
      l: level === 'easy' || level === 'medium' || level === 'hard' ? level : undefined,
    }
  } catch {
    return null
  }
}

export function buildChallengeUrl(payload: ChallengePayload, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://www.connecttocampus.com')
  const path = payload.g === 'typing' ? '/games/typing' : '/games/math'
  return `${base}${path}?beat=${encodeChallenge(payload)}`
}

/** A fresh seed for a new challenge (both players run the identical round). */
function newChallengeSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

// ── Payload builders ─────────────────────────────────────────────────────────

export function typingChallengePayload(
  name: string,
  value: number,
  accuracyPct: number,
  seed = newChallengeSeed()
): ChallengePayload {
  return { g: 'typing', n: name, s: value, a: accuracyPct, d: seed }
}

export function mathChallengePayload(
  name: string,
  points: number,
  correct: number,
  difficulty: Difficulty,
  seed = newChallengeSeed()
): ChallengePayload {
  return { g: 'math', n: name, s: points, a: correct, d: seed, l: difficulty }
}

/**
 * Share a challenge — Web Share where available, clipboard otherwise.
 * Returns false only when even the clipboard refused.
 */
export async function shareChallenge(payload: ChallengePayload): Promise<boolean> {
  const url = buildChallengeUrl(payload)
  const text = `${payload.n} scored ${challengeScoreLabel(payload.g, payload.s)} — beat it on ConnectToCampus!\n${url}`
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Beat my score', text, url })
      return true
    } catch {
      /* cancelled or unsupported — fall through to copy */
    }
  }
  return copyToClipboard(text)
}
