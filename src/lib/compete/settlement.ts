// src/lib/compete/settlement.ts
//
// Pure settlement computation — no database, no network, no globals.
//
// The server route reads authoritative match rows, hands them to this function,
// and persists the result. Keeping the maths here (instead of in the route
// body) means the exact same code can be unit-tested and can never be
// re-implemented differently on another surface.
//
// AUTHORITY: this function derives `winning_team` and every `result` from the
// participants' server-written `score`, or from an already server-set
// `winning_team`. It never reads a client-supplied winner.

import { settleMatch, teamRating, type PlayerState } from '@/lib/rating'

export type SettledParticipant = {
  user_id: string
  team: number
  score: number
  rating: number
  games: number
}

export type SettledResult = {
  user_id: string
  team: number
  before: number
  after: number
  delta: number
  result: 'win' | 'loss' | 'draw'
}

export type SettlementPlan =
  { ok: false; reason: 'no_result' } | { ok: true; winning_team: number | null; results: SettledResult[] }

/**
 * Which team won, purely from recorded state.
 *
 * `explicitWinner` is the value on `competitive_matches.winning_team`, which
 * only the server ever writes. If it is null we fall back to total score per
 * team. If neither distinguishes the sides (all zero, or a genuine tie) the
 * match is a draw — we never invent a winner.
 */
export function decideWinningTeam(
  participants: Pick<SettledParticipant, 'team' | 'score'>[],
  explicitWinner: number | null
): number | null {
  if (explicitWinner !== null && explicitWinner !== undefined) return explicitWinner

  const totals = new Map<number, number>()
  for (const p of participants) totals.set(p.team, (totals.get(p.team) ?? 0) + p.score)

  const entries = [...totals.entries()]
  if (entries.length < 2) return null

  // Nothing recorded at all → no authoritative result exists yet.
  if (entries.every(([, total]) => total === 0)) return null

  entries.sort((a, b) => b[1] - a[1])
  const [first, second] = entries
  if (first[1] === second[1]) return null // draw
  return first[0]
}

/**
 * Build the per-participant rating settlement.
 *
 * `priorMeetingsFor(userId)` is supplied by the route, which counts the user's
 * previous finished matches this season against the opposing side. It is NEVER
 * taken from the client.
 *
 * Team modes: a player is rated against the MEAN rating of the opposing team,
 * and the opposing team's mean is used as their opponent. This is the standard
 * simplification; it is deterministic and server-side. It is flagged for future
 * refinement because a 2000+1000 pairing averages like two 1500s.
 */
export function buildSettlementPlan(input: {
  participants: SettledParticipant[]
  explicitWinner: number | null
  priorMeetingsFor: (userId: string) => number
}): SettlementPlan {
  const { participants, explicitWinner, priorMeetingsFor } = input

  const winningTeam = decideWinningTeam(participants, explicitWinner)

  // No recorded outcome → the match has not been played authoritatively.
  // Callers must refuse to settle rather than fabricate a 0-0 draw.
  const anyScore = participants.some((p) => p.score !== 0)
  if (winningTeam === null && !anyScore && explicitWinner === null) {
    return { ok: false, reason: 'no_result' }
  }

  const byTeam = new Map<number, SettledParticipant[]>()
  for (const p of participants) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, [])
    byTeam.get(p.team)!.push(p)
  }

  const teamMeans = new Map<number, number>()
  for (const [team, members] of byTeam) {
    teamMeans.set(team, teamRating(members.map((m) => ({ rating: m.rating, games: m.games }) as PlayerState)))
  }

  const results: SettledResult[] = participants.map((p) => {
    const opponents = participants.filter((o) => o.team !== p.team)
    const opponentMean =
      opponents.length > 0
        ? teamRating(opponents.map((o) => ({ rating: o.rating, games: o.games }) as PlayerState))
        : p.rating

    const self: PlayerState = { rating: p.rating, games: p.games }
    const opponent: PlayerState = { rating: opponentMean, games: 0 }
    const prior = priorMeetingsFor(p.user_id)

    const result: 'win' | 'loss' | 'draw' = winningTeam === null ? 'draw' : winningTeam === p.team ? 'win' : 'loss'

    const outcome =
      result === 'draw'
        ? settleMatch({ draw: [self, opponent], priorMeetings: prior })
        : result === 'win'
          ? settleMatch({ winner: self, loser: opponent, priorMeetings: prior })
          : settleMatch({ winner: opponent, loser: self, priorMeetings: prior })

    const rawDelta =
      result === 'draw'
        ? (outcome.drawDeltas?.[0] ?? 0)
        : result === 'loss'
          ? (outcome.loserDelta ?? 0)
          : (outcome.winnerDelta ?? 0)

    // Derive after from the delta, then the stored delta from after, so the
    // invariant `before + delta === after` holds at the floor too.
    const after = Math.max(100, Math.round((p.rating + rawDelta) * 10) / 10)
    const delta = Math.round((after - p.rating) * 10) / 10

    return {
      user_id: p.user_id,
      team: p.team,
      before: p.rating,
      after,
      delta,
      result,
    }
  })

  return { ok: true, winning_team: winningTeam, results }
}
