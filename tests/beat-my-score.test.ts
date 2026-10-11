/**
 * BEAT MY SCORE — guards the shareable challenge link on both games.
 *
 * The promise: a challenge is a SELF-CONTAINED URL (who, what score, and a seed
 * so two link-openers run the identical round), played solo, with no account
 * and no server call. Failure modes guarded here:
 *   - the link growing a dependency on a room/session it is meant to avoid;
 *   - a mangled link throwing instead of degrading to a friendly card;
 *   - the two players quietly getting different words/questions (seed drift).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildChallengeUrl,
  challengeQuestions,
  challengeScoreLabel,
  challengeWords,
  compareChallenge,
  decodeChallenge,
  encodeChallenge,
  mathChallengePayload,
  mathPoints,
  seedFromString,
  typingChallengePayload,
  typingResult,
} from '@/lib/games/challenge'
import { TYPING_WORD_COUNT } from '@/lib/games/typing'
import { GAME_CONFIG } from '@/lib/games/config'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('the challenge payload round-trips through the URL', () => {
  it('survives encode → decode', () => {
    const payload = typingChallengePayload('Ayush', 62, 97, 'seed1234')
    const decoded = decodeChallenge(encodeChallenge(payload))
    expect(decoded).toEqual(payload)
  })

  it('keeps non-ASCII nicknames intact', () => {
    const payload = mathChallengePayload('आयुष 🚀', 1250, 9, 'hard', 's2')
    const decoded = decodeChallenge(encodeChallenge(payload))
    expect(decoded?.n).toBe('आयुष 🚀')
    expect(decoded?.l).toBe('hard')
  })

  it('degrades a mangled link to null instead of throwing', () => {
    for (const bad of ['', 'not-base64!!', encodeChallenge({} as never), btoa('{}')]) {
      expect(decodeChallenge(bad)).toBeNull()
    }
    expect(decodeChallenge(null)).toBeNull()
  })

  it('rejects a payload for an unknown game', () => {
    expect(decodeChallenge(btoa(JSON.stringify({ g: 'chess', s: 1, d: 'x' })))).toBeNull()
  })
})

describe('both players get the identical run', () => {
  it('is a pure function of the seed', () => {
    expect(challengeWords('same-seed')).toEqual(challengeWords('same-seed'))
    expect(challengeWords('same-seed')).not.toEqual(challengeWords('other-seed'))
    expect(challengeWords('same-seed')).toHaveLength(TYPING_WORD_COUNT)
    expect(seedFromString('same-seed')).toBe(seedFromString('same-seed'))
  })

  it('generates deterministic questions per difficulty', () => {
    expect(challengeQuestions('q', 'medium')).toEqual(challengeQuestions('q', 'medium'))
    expect(challengeQuestions('q', 'easy')).toHaveLength(GAME_CONFIG.TOTAL_ROUNDS)
    // The difficulty is part of the seed: easy and hard differ.
    expect(challengeQuestions('q', 'easy')).not.toEqual(challengeQuestions('q', 'hard'))
  })

  it('every generated question has an exact integer answer', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (const q of challengeQuestions('seed-x', level)) {
        expect(Number.isInteger(q.answer)).toBe(true)
        expect(q.text.length).toBeGreaterThan(2)
      }
    }
  })
})

describe('scoring + comparison', () => {
  it('awards nothing for a wrong answer and a base + bonus for a right one', () => {
    expect(mathPoints(false, 100)).toBe(0)
    expect(mathPoints(true, 0)).toBe(GAME_CONFIG.BASE_POINTS + GAME_CONFIG.SPEED_BONUS_MAX)
    expect(mathPoints(true, 60_000)).toBe(GAME_CONFIG.BASE_POINTS)
  })

  it('computes typing WPM + accuracy, tolerating a zero-duration guard', () => {
    expect(typingResult(300, 300, 60_000).wpm).toBe(60)
    expect(typingResult(300, 300, 60_000).accuracy).toBe(100)
    expect(typingResult(0, 0, 0).wpm).toBe(0)
  })

  it('compares mine against the challenger honestly', () => {
    expect(compareChallenge(50, 40)).toBe('beat')
    expect(compareChallenge(40, 40)).toBe('tied')
    expect(compareChallenge(30, 40)).toBe('lost')
  })

  it('labels the score per game', () => {
    expect(challengeScoreLabel('typing', 62)).toBe('62 WPM')
    expect(challengeScoreLabel('math', 1250)).toBe('1250 pts')
  })

  it('routes each game to its own page', () => {
    expect(buildChallengeUrl(typingChallengePayload('A', 1, 1, 's'), 'https://x.com')).toContain('/games/typing?beat=')
    expect(buildChallengeUrl(mathChallengePayload('A', 1, 1, 'easy', 's'), 'https://x.com')).toContain(
      '/games/math?beat='
    )
  })
})

describe('the challenge stays self-contained', () => {
  const lib = read('src/lib/games/challenge.ts')

  it('never touches a room, a session or the network', () => {
    expect(lib).not.toMatch(/supabase|createClient/)
    expect(lib).not.toMatch(/rpc\(/)
    expect(lib).not.toMatch(/fetch\(/)
  })
})

describe('both games expose the challenge', () => {
  it('Typing Battle offers it from the finished screen', () => {
    const typing = read('src/components/games/TypingBattle.tsx')
    expect(typing).toContain('shareMyScore')
    expect(typing).toContain('typingChallengePayload')
  })

  it('Quick Math offers it from the results board', () => {
    expect(read('src/components/games/GameResults.tsx')).toContain('onChallenge')
    expect(read('src/components/games/QuickMath.tsx')).toContain('mathChallengePayload')
  })

  it('both routes hand a ?beat= link to the solo run', () => {
    for (const page of ['src/app/games/typing/[[...code]]/page.tsx', 'src/app/games/math/[[...code]]/page.tsx']) {
      const source = read(page)
      expect(source).toContain('ChallengeRun')
      expect(source).toContain("get('beat')")
    }
  })
})
