import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RATING,
  MIN_RATING,
  clampRating,
  compositeRating,
  expectedScore,
  kFactor,
  rankTier,
  repeatOpponentMultiplier,
  settleMatch,
  teamRating,
  tierProgress,
} from '@/lib/rating'

describe('expectedScore', () => {
  it('is symmetric — the two probabilities sum to 1', () => {
    expect(expectedScore(1200, 1400) + expectedScore(1400, 1200)).toBeCloseTo(1, 10)
  })

  it('favours the higher-rated player', () => {
    expect(expectedScore(1500, 1200)).toBeGreaterThan(0.5)
    expect(expectedScore(1200, 1500)).toBeLessThan(0.5)
  })

  it('is exactly 0.5 for equal ratings, at any level', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5)
    expect(expectedScore(300, 300)).toBe(0.5)
  })
})

describe('kFactor', () => {
  it('moves provisional players faster than settled ones', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(15))
    expect(kFactor(15)).toBeGreaterThan(kFactor(500))
  })

  it('is stable once a player has played a lot', () => {
    expect(kFactor(1000)).toBe(kFactor(5000))
  })
})

describe('repeatOpponentMultiplier', () => {
  it('pays full value for the first few meetings', () => {
    expect(repeatOpponentMultiplier(0)).toBe(1)
    expect(repeatOpponentMultiplier(2)).toBe(1)
  })

  it('decays monotonically and never reaches zero', () => {
    const seq = [3, 4, 5, 6, 10].map(repeatOpponentMultiplier)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1])
    for (const v of seq) expect(v).toBeGreaterThan(0)
  })
})

describe('settleMatch', () => {
  it('gives the winner points and takes them from the loser', () => {
    const out = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1200, games: 40 },
    })
    expect(out.winnerDelta).toBeGreaterThan(0)
    expect(out.loserDelta).toBeLessThan(0)
  })

  it('is approximately zero-sum for equally-rated, equally-experienced players', () => {
    const out = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1200, games: 40 },
    })
    expect((out.winnerDelta ?? 0) + (out.loserDelta ?? 0)).toBeCloseTo(0, 5)
  })

  it('rewards an upset more than an expected win', () => {
    const expectedWin = settleMatch({
      winner: { rating: 1500, games: 40 },
      loser: { rating: 1200, games: 40 },
    })
    const upset = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1500, games: 40 },
    })
    expect(upset.winnerDelta!).toBeGreaterThan(expectedWin.winnerDelta!)
  })

  it('punishes the favourite who loses harder than a heavy underdog', () => {
    const favouriteLoses = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1500, games: 40 },
    })
    const underdogLoses = settleMatch({
      winner: { rating: 1500, games: 40 },
      loser: { rating: 1200, games: 40 },
    })
    expect(favouriteLoses.loserDelta!).toBeLessThan(underdogLoses.loserDelta!)
  })

  it('damps repeated meetings between the same two players', () => {
    const first = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1200, games: 40 },
      priorMeetings: 0,
    })
    const repeated = settleMatch({
      winner: { rating: 1200, games: 40 },
      loser: { rating: 1200, games: 40 },
      priorMeetings: 6,
    })
    expect(repeated.winnerDelta!).toBeLessThan(first.winnerDelta!)
    expect(repeated.winnerDelta!).toBeGreaterThan(0)
  })

  it('never drops a rating below the floor', () => {
    const out = settleMatch({
      winner: { rating: 1400, games: 40 },
      loser: { rating: MIN_RATING, games: 40 },
    })
    expect(out.loserRating!).toBeGreaterThanOrEqual(MIN_RATING)
  })

  it('leaves equally-rated players essentially unchanged on a draw', () => {
    const out = settleMatch({
      draw: [
        { rating: 1300, games: 40 },
        { rating: 1300, games: 40 },
      ],
    })
    expect(Math.abs(out.drawDeltas![0])).toBeLessThan(0.001)
    expect(Math.abs(out.drawDeltas![1])).toBeLessThan(0.001)
  })

  it('throws when neither a draw pair nor a full pair is supplied', () => {
    expect(() => settleMatch({ winner: { rating: 1200, games: 0 } })).toThrow()
    expect(() => settleMatch({})).toThrow()
  })
})

describe('clampRating', () => {
  it('enforces the floor and keeps one decimal', () => {
    expect(clampRating(-50)).toBe(MIN_RATING)
    expect(clampRating(1234.56)).toBe(1234.6)
  })
})

describe('teamRating', () => {
  it('averages members, and falls back to the default when empty', () => {
    expect(
      teamRating([
        { rating: 1200, games: 0 },
        { rating: 1400, games: 0 },
      ])
    ).toBe(1300)
    expect(teamRating([])).toBe(DEFAULT_RATING)
  })
})

describe('compositeRating', () => {
  it('averages the provided skills and ignores missing ones', () => {
    expect(compositeRating({ dsa: 1500, web: 1300 })).toBe(1400)
    expect(compositeRating({})).toBe(DEFAULT_RATING)
  })
})

describe('rankTier / tierProgress', () => {
  it('rises with rating', () => {
    expect(rankTier(900).key).toBe('bronze')
    expect(rankTier(1200).key).toBe('silver')
    expect(rankTier(2100).key).toBe('grandmaster')
  })

  it('tier progress stays within 0..1', () => {
    for (const r of [100, 1100, 1249, 1400, 1999, 2400]) {
      const p = tierProgress(r)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })
})
