// src/lib/rating.ts
//
// COMPETE — competitive rating engine (Phase 8).
//
// A pure, dependency-free implementation of the Elo family of ratings, tuned
// for short student battles. It is deliberately NOT in SQL and NOT in a route
// handler body: the same maths has to run in three places —
//
//   1. the server, to settle a finished match (authoritative),
//   2. the client, to preview the rating swing before a battle starts,
//   3. the tests, to prove the anti-abuse rules hold.
//
// Keeping it pure means the server is the only writer but the numbers are never
// re-implemented per surface.
//
// Design decisions and why:
//
// * **Provisional K.** A new account swings fast (K = 40) and settles to K = 12
//   after ~30 rated games. Without this, the first few matches decide a
//   student's rank for a whole season and the ladder looks random.
//
// * **Anti-farming.** Beating the same opponent repeatedly is worth
//   progressively less. This is the single most important guard for CampusConnect
//   specifically, because students in one college *will* grind each other.
//
// * **Asymmetric loss protection.** A lower-rated player who loses to a
//   much stronger one barely moves; the favourite losing is punished harder.
//   That falls out of Elo naturally, so it is not special-cased.
//
// * **Floor.** Rating can never go below MIN_RATING, so a bad run cannot bury a
//   student below the point of ever recovering.

export const MIN_RATING = 100
export const DEFAULT_RATING = 1200

/** Skills that carry their own independent ladder (Phase 8). */
export const COMPETITIVE_SKILLS = ['dsa', 'web', 'ai_ml', 'problem_solving'] as const
export type CompetitiveSkill = (typeof COMPETITIVE_SKILLS)[number]

export const SKILL_LABELS: Record<CompetitiveSkill, string> = {
  dsa: 'DSA',
  web: 'Web Dev',
  ai_ml: 'AI / ML',
  problem_solving: 'Problem Solving',
}

export type MatchOutcome = 'win' | 'loss' | 'draw'

export type PlayerState = {
  rating: number
  /** Rated games already played — drives the provisional K factor. */
  games: number
}

export type MatchResultInput = {
  winner?: PlayerState | null
  loser?: PlayerState | null
  /** Draws settle an explicit pair instead of a winner/loser. */
  draw?: [PlayerState, PlayerState] | null
  /**
   * How many times these two have already played each other in the current
   * day/season window. 0 = first meeting. Used to damp farming.
   */
  priorMeetings?: number
}

export type MatchResultOutput = {
  winnerDelta?: number
  loserDelta?: number
  drawDeltas?: [number, number]
  winnerRating?: number
  loserRating?: number
  drawRatings?: [number, number]
}

/** Probability that `a` beats `b`, classic Elo logistic curve. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

/**
 * K factor: how much one result can move a rating.
 * Provisional players move fast; settled players move slowly.
 */
export function kFactor(games: number): number {
  if (games < 10) return 40
  if (games < 30) return 24
  return 12
}

/**
 * Damping applied when the same two players meet repeatedly.
 * 1st-3rd meeting: full value. Then it decays, and a grinder gains almost
 * nothing while still risking a normal loss — exactly the incentive we want.
 */
export function repeatOpponentMultiplier(priorMeetings: number): number {
  const n = Math.max(0, priorMeetings)
  if (n < 3) return 1
  // 4th → 0.5, 5th → 0.33, 6th → 0.25 … approaching 0 without ever being 0,
  // so a genuine upset is still worth *something*.
  return 1 / (1 + (n - 2))
}

/** Never return a rating below the floor, and keep one decimal of precision. */
export function clampRating(rating: number): number {
  return Math.max(MIN_RATING, Math.round(rating * 10) / 10)
}

function deltaFor(state: PlayerState, opponent: PlayerState, score: number, priorMeetings: number): number {
  const expected = expectedScore(state.rating, opponent.rating)
  const k = kFactor(state.games) * repeatOpponentMultiplier(priorMeetings)
  return k * (score - expected)
}

/**
 * Apply one settled delta so that `before + delta == after` ALWAYS holds.
 *
 * This matters at the rating floor: a player at 100 facing an equal opponent
 * would otherwise be recorded with `delta = -6` but `after = 100`, so
 * before + delta != after and the stored history lies. We therefore derive the
 * delta FROM the clamped rating rather than the other way round.
 */
function applyDelta(before: number, rawDelta: number): { after: number; delta: number } {
  const after = clampRating(before + rawDelta)
  return { after, delta: round1(after - before) }
}

/**
 * Settle a decided match. `score` is 1 for the winner, 0 for the loser.
 * Returns the rating *change* and the new rating; `before + delta === after`
 * is guaranteed, including at the floor.
 */
export function settleMatch(input: MatchResultInput): MatchResultOutput {
  const prior = input.priorMeetings ?? 0

  if (input.draw) {
    const [a, b] = input.draw
    const ra = applyDelta(a.rating, deltaFor(a, b, 0.5, prior))
    const rb = applyDelta(b.rating, deltaFor(b, a, 0.5, prior))
    return {
      drawDeltas: [ra.delta, rb.delta],
      drawRatings: [ra.after, rb.after],
    }
  }

  const { winner, loser } = input
  if (!winner || !loser) {
    throw new Error('settleMatch requires either a draw pair or both a winner and a loser')
  }

  const rw = applyDelta(winner.rating, deltaFor(winner, loser, 1, prior))
  const rl = applyDelta(loser.rating, deltaFor(loser, winner, 0, prior))

  return {
    winnerDelta: rw.delta,
    loserDelta: rl.delta,
    winnerRating: rw.after,
    loserRating: rl.after,
  }
}

/**
 * Placement (Phase 9): a fresh account has a provisional rating, not an
 * established rank. Fewer than PLACEMENT_GAMES ranked matches = unplaced, and
 * an unplaced player is excluded from official ladder positions rather than
 * occupying a rank with a coin-flip number.
 */
export const PLACEMENT_GAMES = 5

export function isPlaced(games: number): boolean {
  return games >= PLACEMENT_GAMES
}

/** Matches still needed before placement completes (0 once placed). */
export function placementRemaining(games: number): number {
  return Math.max(0, PLACEMENT_GAMES - games)
}

/** Team rating is the mean of member ratings — used for 2v2 / team battles. */
export function teamRating(members: PlayerState[]): number {
  if (members.length === 0) return DEFAULT_RATING
  return members.reduce((sum, m) => sum + m.rating, 0) / members.length
}

/**
 * Raw mean of the provided skills. Retained for callers that only have a
 * partial set — but it treats one skill rated 1500 identically to four skills
 * rated 1500, which is misleading. Prefer `overallRating` when displaying an
 * "overall" number.
 */
export function compositeRating(ratings: Partial<Record<CompetitiveSkill, number>>): number {
  const values = COMPETITIVE_SKILLS.map((s) => ratings[s]).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return DEFAULT_RATING
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export type OverallRating = {
  /** Mean of the rated skills. */
  value: number
  /** Fraction of the four skills that have a rating (0–1). */
  coverage: number
  /** True only when every skill has been played. */
  complete: boolean
}

/**
 * Overall rating WITH coverage, so missing skills cannot masquerade as
 * complete coverage (Phase 14). A caller must show `coverage` alongside
 * `value` whenever it is not complete.
 */
export function overallRating(ratings: Partial<Record<CompetitiveSkill, number>>): OverallRating {
  const present = COMPETITIVE_SKILLS.filter((s) => typeof ratings[s] === 'number')
  const value =
    present.length === 0
      ? DEFAULT_RATING
      : Math.round(present.reduce((sum, s) => sum + (ratings[s] as number), 0) / present.length)
  const coverage = present.length / COMPETITIVE_SKILLS.length
  return { value, coverage, complete: present.length === COMPETITIVE_SKILLS.length }
}

/**
 * Rank tier shown next to a rating. Purely presentational; derived from the
 * number so it can never disagree with it.
 */
export type RankTier = { key: string; label: string; icon: string }

export function rankTier(rating: number): RankTier {
  if (rating >= 2000) return { key: 'grandmaster', label: 'Grandmaster', icon: '👑' }
  if (rating >= 1750) return { key: 'master', label: 'Master', icon: '💎' }
  if (rating >= 1550) return { key: 'diamond', label: 'Diamond', icon: '🔷' }
  if (rating >= 1400) return { key: 'platinum', label: 'Platinum', icon: '⚪' }
  if (rating >= 1250) return { key: 'gold', label: 'Gold', icon: '🥇' }
  if (rating >= 1100) return { key: 'silver', label: 'Silver', icon: '🥈' }
  return { key: 'bronze', label: 'Bronze', icon: '🥉' }
}

/** Progress toward the next tier, 0–1, for the tier progress bar. */
export function tierProgress(rating: number): number {
  const thresholds = [1100, 1250, 1400, 1550, 1750, 2000]
  const floor = [...thresholds].reverse().find((t) => t <= rating) ?? 0
  const ceil = thresholds.find((t) => t > rating) ?? floor
  if (ceil <= floor) return 1
  return Math.min(1, Math.max(0, (rating - floor) / (ceil - floor)))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
