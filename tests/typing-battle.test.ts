import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  TYPING_WORD_POOL,
  TYPING_WORD_COUNT,
  TypingTracker,
  accuracy,
  dailyWords,
  decideWinner,
  isPossibleDuration,
  wpm,
} from '@/lib/games/typing'

const root = process.cwd()

const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

// ─── Game logic ───────────────────────────────────────────────────────────────

describe('typing — word generation', () => {
  it('draws from a campus/tech vocabulary, never meaningless strings', () => {
    expect(TYPING_WORD_POOL.length).toBeGreaterThanOrEqual(26)
    for (const w of TYPING_WORD_POOL) {
      expect(w).toMatch(/^[a-z]+$/)
    }
  })

  it('generates exactly 10 words per match (spec: 10–12, MVP picks 10)', () => {
    expect(TYPING_WORD_COUNT).toBe(10)
    expect(dailyWords('2026-10-01')).toHaveLength(10)
  })

  it('the daily seed is deterministic — same day, same words for everyone', () => {
    const a = dailyWords('2026-10-01')
    const b = dailyWords('2026-10-01')
    expect(a).toEqual(b)
  })

  it('different days get different sequences', () => {
    const a = dailyWords('2026-10-01')
    const b = dailyWords('2026-10-02')
    expect(a).not.toEqual(b)
  })

  it('daily words stay inside the pool with no duplicates', () => {
    const words = dailyWords('2026-06-15')
    expect(new Set(words).size).toBe(words.length)
    for (const w of words) expect(TYPING_WORD_POOL).toContain(w)
  })
})

describe('typing — WPM & accuracy', () => {
  it('uses the standard approximation (correct chars / 5) / minutes', () => {
    // 100 correct chars in 60s = 20 words in 1 minute = 20 WPM
    expect(wpm(100, 60)).toBe(20)
    expect(wpm(250, 30)).toBe(100)
  })

  it('never divides by zero', () => {
    expect(wpm(100, 0)).toBe(0)
    expect(wpm(0, 60)).toBe(0)
  })

  it('accuracy = correct / total typed × 100', () => {
    expect(accuracy(98, 100)).toBe(98)
    expect(accuracy(0, 0)).toBe(100) // nothing typed yet — show 100, not NaN
    expect(accuracy(3, 10)).toBeCloseTo(30)
  })
})

// ─── Typing mechanics ─────────────────────────────────────────────────────────

function typeWords(words: string[], startMs = 1_000): TypingTracker {
  const t = new TypingTracker(words, startMs)
  words.forEach((w, i) => {
    for (const ch of w) t.handleKey(ch, startMs + i * 500 + 10)
    t.handleKey(' ', startMs + i * 500 + 20)
  })
  return t
}

describe('typing — TypingTracker mechanics', () => {
  it('completes a word only when typed exactly, in order', () => {
    const t = new TypingTracker(['code', 'campus'], 0)
    for (const ch of 'codx') t.handleKey(ch)
    t.handleKey(' ')
    expect(t.completedWords).toBe(0) // wrong word did not advance
    for (const ch of 'code') t.handleKey(ch)
    expect(t.handleKey(' ')).toBe(true)
    expect(t.completedWords).toBe(1)
  })

  it('blocks skipping ahead', () => {
    const t = new TypingTracker(['code', 'campus'], 0)
    for (const ch of 'campus') t.handleKey(ch)
    expect(t.handleKey(' ')).toBe(false)
    expect(t.completedWords).toBe(0) // word 1 must come first
  })

  it('ignores empty submissions (no space-only advancement)', () => {
    const t = new TypingTracker(['code'], 0)
    expect(t.handleKey(' ')).toBe(false)
    expect(t.completedWords).toBe(0)
  })

  it('supports backspace within the current word', () => {
    const t = new TypingTracker(['code'], 0)
    for (const ch of 'codx') t.handleKey(ch)
    t.handleKey('Backspace')
    t.handleKey('e')
    expect(t.handleKey(' ')).toBe(true)
    expect(t.completedWords).toBe(1)
  })

  it('detects completion exactly at the last word', () => {
    const t = typeWords(['code', 'campus', 'web'])
    expect(t.isFinished).toBe(true)
    expect(t.submission).toEqual(['code', 'campus', 'web'])
  })

  it('is idempotent after finishing', () => {
    const t = typeWords(['code'])
    const at = t.elapsedMs
    expect(t.handleKey('x', at + 1000)).toBe(false)
    expect(t.completedWords).toBe(1)
  })

  it('builds a small realtime payload, not per-keystroke data', () => {
    const t = typeWords(['code', 'campus'])
    const payload = t.progressPayload()
    expect(Object.keys(payload)).toEqual(['completed', 'correct', 'total'])
    expect(payload.completed).toBe(2)
    expect(payload.total).toBe(2)
  })
})

describe('typing — winner determination (spec §10)', () => {
  it('first valid completion wins', () => {
    expect(decideWinner({ completedAtMs: 10_000, accuracy: 90 }, { completedAtMs: 12_000, accuracy: 99 })).toBe('a')
  })

  it('equal times break by accuracy, then deterministically tie', () => {
    expect(decideWinner({ completedAtMs: 10_000, accuracy: 90 }, { completedAtMs: 10_000, accuracy: 95 })).toBe('b')
    expect(decideWinner({ completedAtMs: 10_000, accuracy: 90 }, { completedAtMs: 10_000, accuracy: 90 })).toBe('tie')
  })
})

describe('typing — anti-cheat duration window (spec §18)', () => {
  it('rejects impossible completion times', () => {
    expect(isPossibleDuration(500)).toBe(false) // faster than humanly possible
    expect(isPossibleDuration(2_000)).toBe(true)
    expect(isPossibleDuration(900_000)).toBe(true)
    expect(isPossibleDuration(900_001)).toBe(false) // > 15 min: abandoned match
  })
})

// ─── Wiring & security guards (tree-walked, uncommitted files covered) ────────

describe('typing battle — SQL surface', () => {
  const sql = read('supabase/migrations/049_typing_battle.sql')

  it('words live in a zero-policy table, handed out only via RPC', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.typing_words/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    // typing_words must have NO select policy — only get_typing_words exposes it.
    expect(sql).not.toMatch(/POLICY \w+ ON public\.typing_words/)
  })

  it('the server generates the shared sequence exactly once per match', () => {
    expect(sql).toMatch(/FUNCTION public\.start_typing_match/)
    expect(sql).toMatch(/INSERT INTO public\.typing_words/)
  })

  it('completion is server-authoritative: server clock, word re-validation, recomputed WPM', () => {
    expect(sql).toMatch(/FUNCTION public\.complete_typing_match/)
    expect(sql).toMatch(/now\(\) - v_room\.round_started_at/)
    expect(sql).toMatch(/impossible_time/)
    expect(sql).toMatch(/v_wpm := ROUND\(\(v_correct::NUMERIC \/ 5\) \/ \(v_elapsed \/ 60\), 2\)/)
  })

  it('prevents double submission and double wins', () => {
    expect(sql).toMatch(/'already'/)
    expect(sql).toMatch(/ON CONFLICT \(room_id\) DO NOTHING/)
  })

  it('first valid completion wins; the finish trigger awards aura as before', () => {
    expect(sql).toMatch(/status = 'finished'/)
    expect(sql).toMatch(/game_winners/)
  })

  it('reuses the existing matchmaking queue with a game-type split', () => {
    expect(sql).toMatch(/game_type = p_game_type/)
    expect(sql).toMatch(/'typing_battle'/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.join_matchmaking\(TEXT, TEXT, TEXT, INT, UUID\)/)
  })

  it('daily challenge derives words deterministically from the date', () => {
    expect(sql).toMatch(/FUNCTION public\.typing_daily_words/)
    expect(sql).toMatch(/PRIMARY KEY \(day, player_id\)/)
  })

  it('every new RPC is revoked from PUBLIC and granted to clients', () => {
    for (const fn of [
      'create_typing_room',
      'join_typing_room',
      'toggle_typing_ready',
      'start_typing_match',
      'get_typing_words',
      'update_typing_progress',
      'complete_typing_match',
      'typing_daily_attempt',
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}`))
      expect(sql).toMatch(new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${fn}`))
    }
  })
})

describe('typing battle — client wiring', () => {
  it('the orchestrator calls the real RPCs', () => {
    const c = read('src/components/games/TypingBattle.tsx')
    for (const rpc of [
      'join_matchmaking',
      'check_matchmaking_status',
      'create_typing_room',
      'join_typing_room',
      'toggle_typing_ready',
      'start_typing_match',
      'get_typing_words',
      'update_typing_progress',
      'complete_typing_match',
    ]) {
      expect(c).toContain(`'${rpc}'`)
    }
  })

  it('never trusts the client clock for the countdown', () => {
    const c = read('src/components/games/TypingBattle.tsx')
    expect(c).toMatch(/round_started_at|starts_at/)
    expect(c).toMatch(/countdownLabel/)
  })

  it('the arena disables paste and copies', () => {
    const arena = read('src/components/games/TypingArena.tsx')
    expect(arena).toMatch(/onPaste=\{\(e\) => e\.preventDefault\(\)\}/)
    expect(arena).toMatch(/onCopy=/)
  })

  it('progress heartbeats fire per completed word, not per keystroke', () => {
    const arena = read('src/components/games/TypingArena.tsx')
    const battle = read('src/components/games/TypingBattle.tsx')
    expect(arena).toMatch(/onWordCompleted/)
    expect(battle).toMatch(/update_typing_progress/)
  })

  it('the game card exists in the Compete clash hub', () => {
    const clash = read('src/app/compete/ClashTab.tsx')
    expect(clash).toMatch(/Typing Battle/)
    expect(clash).toMatch(/\/games\/typing/)
  })

  it('room deep links route through /games/typing', () => {
    expect(read('src/app/games/typing/[[...code]]/page.tsx')).toMatch(/initialRoomCode/)
  })
})
