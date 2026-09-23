import { describe, expect, it } from 'vitest'
import { MIN_RATING, isPlaced, overallRating, placementRemaining, settleMatch } from '@/lib/rating'
import { buildSettlementPlan, decideWinningTeam } from '@/lib/compete/settlement'

describe('exact delta invariant (C2)', () => {
  it('keeps before + delta === after when the loser is at the floor', () => {
    const out = settleMatch({
      winner: { rating: 100, games: 40 },
      loser: { rating: MIN_RATING, games: 40 },
    })
    // The loser was already at the floor, so the recorded delta must be 0 —
    // not the raw -6.
    expect(out.loserRating).toBe(MIN_RATING)
    expect(out.loserDelta).toBe(0)
    expect(MIN_RATING + out.loserDelta!).toBe(out.loserRating)
  })

  it('holds the invariant across many random-ish pairings', () => {
    const ratings = [100, 250, 900, 1200, 1600, 2200]
    for (const a of ratings) {
      for (const b of ratings) {
        const out = settleMatch({
          winner: { rating: a, games: 40 },
          loser: { rating: b, games: 40 },
        })
        expect(a + out.winnerDelta!).toBeCloseTo(out.winnerRating!, 6)
        expect(b + out.loserDelta!).toBeCloseTo(out.loserRating!, 6)
      }
    }
  })

  it('holds for draws too', () => {
    const out = settleMatch({
      draw: [
        { rating: 100, games: 40 },
        { rating: 1400, games: 40 },
      ],
    })
    expect(100 + out.drawDeltas![0]).toBeCloseTo(out.drawRatings![0], 6)
    expect(1400 + out.drawDeltas![1]).toBeCloseTo(out.drawRatings![1], 6)
  })
})

describe('placement', () => {
  it('marks fewer than five games as unplaced', () => {
    expect(isPlaced(0)).toBe(false)
    expect(isPlaced(4)).toBe(false)
    expect(isPlaced(5)).toBe(true)
    expect(isPlaced(50)).toBe(true)
  })

  it('reports remaining placement games', () => {
    expect(placementRemaining(0)).toBe(5)
    expect(placementRemaining(3)).toBe(2)
    expect(placementRemaining(5)).toBe(0)
    expect(placementRemaining(99)).toBe(0)
  })
})

describe('overallRating', () => {
  it('reports full coverage only when every skill is rated', () => {
    const partial = overallRating({ dsa: 1600 })
    expect(partial.value).toBe(1600)
    expect(partial.coverage).toBe(0.25)
    expect(partial.complete).toBe(false)

    const full = overallRating({ dsa: 1600, web: 1600, ai_ml: 1600, problem_solving: 1600 })
    expect(full.value).toBe(1600)
    expect(full.coverage).toBe(1)
    expect(full.complete).toBe(true)
  })

  it('falls back to the default when nothing is rated', () => {
    expect(overallRating({}).coverage).toBe(0)
  })
})

describe('decideWinningTeam', () => {
  it('prefers an explicit server-set winner', () => {
    expect(
      decideWinningTeam(
        [
          { team: 0, score: 5 },
          { team: 1, score: 9 },
        ],
        0
      )
    ).toBe(0)
  })

  it('falls back to total score per team', () => {
    expect(
      decideWinningTeam(
        [
          { team: 0, score: 3 },
          { team: 0, score: 4 },
          { team: 1, score: 2 },
          { team: 1, score: 1 },
        ],
        null
      )
    ).toBe(0)
  })

  it('returns null for a tie and for an unplayed match', () => {
    expect(
      decideWinningTeam(
        [
          { team: 0, score: 5 },
          { team: 1, score: 5 },
        ],
        null
      )
    ).toBe(null)
    expect(
      decideWinningTeam(
        [
          { team: 0, score: 0 },
          { team: 1, score: 0 },
        ],
        null
      )
    ).toBe(null)
  })
})

describe('buildSettlementPlan', () => {
  const p = (user_id: string, team: number, score: number, rating = 1200, games = 40) => ({
    user_id,
    team,
    score,
    rating,
    games,
  })

  it('refuses to settle a match with no recorded result', () => {
    const plan = buildSettlementPlan({
      participants: [p('a', 0, 0), p('b', 1, 0)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('no_result')
  })

  it('settles a 1v1: winner gains, loser loses, triangle holds', () => {
    const plan = buildSettlementPlan({
      participants: [p('a', 0, 3), p('b', 1, 1)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.winning_team).toBe(0)
    const a = plan.results.find((r) => r.user_id === 'a')!
    const b = plan.results.find((r) => r.user_id === 'b')!
    expect(a.result).toBe('win')
    expect(a.delta).toBeGreaterThan(0)
    expect(b.result).toBe('loss')
    expect(b.delta).toBeLessThan(0)
    for (const r of plan.results) expect(r.before + r.delta).toBeCloseTo(r.after, 6)
  })

  it('settles equal scores as a draw with ~zero movement', () => {
    const plan = buildSettlementPlan({
      participants: [p('a', 0, 2), p('b', 1, 2)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.winning_team).toBe(null)
    for (const r of plan.results) {
      expect(r.result).toBe('draw')
      expect(Math.abs(r.delta)).toBeLessThan(0.001)
    }
  })

  it('rewards an upset more than a favourite win', () => {
    const upset = buildSettlementPlan({
      participants: [p('low', 0, 5, 1000), p('high', 1, 1, 2000)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    const expected = buildSettlementPlan({
      participants: [p('high', 0, 5, 2000), p('low', 1, 1, 1000)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    if (!upset.ok || !expected.ok) throw new Error('plans should be ok')
    const upsetGain = upset.results.find((r) => r.result === 'win')!.delta
    const expectedGain = expected.results.find((r) => r.result === 'win')!.delta
    expect(upsetGain).toBeGreaterThan(expectedGain)
  })

  it('damps repeated opponents', () => {
    const first = buildSettlementPlan({
      participants: [p('a', 0, 5), p('b', 1, 1)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    const repeated = buildSettlementPlan({
      participants: [p('a', 0, 5), p('b', 1, 1)],
      explicitWinner: null,
      priorMeetingsFor: () => 8,
    })
    if (!first.ok || !repeated.ok) throw new Error('plans should be ok')
    const firstGain = first.results.find((r) => r.user_id === 'a')!.delta
    const repeatGain = repeated.results.find((r) => r.user_id === 'a')!.delta
    expect(repeatGain).toBeLessThan(firstGain)
    expect(repeatGain).toBeGreaterThan(0)
  })

  it('never drops a participant below the floor', () => {
    const plan = buildSettlementPlan({
      participants: [p('a', 0, 5, 1400), p('floor', 1, 0, MIN_RATING)],
      explicitWinner: null,
      priorMeetingsFor: () => 0,
    })
    if (!plan.ok) throw new Error('plan should be ok')
    const floor = plan.results.find((r) => r.user_id === 'floor')!
    expect(floor.after).toBeGreaterThanOrEqual(MIN_RATING)
    expect(floor.before + floor.delta).toBeCloseTo(floor.after, 6)
  })
})
