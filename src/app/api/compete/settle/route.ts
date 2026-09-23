import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/auth'
import { requireAuth } from '@/lib/api/middleware'
import { buildSettlementPlan, type SettledParticipant } from '@/lib/compete/settlement'
import { DEFAULT_RATING } from '@/lib/rating'

/**
 * POST /api/compete/settle — settle a finished competitive match.
 *
 * Authority model (Phase 7 / Phase 36):
 *   * The caller must be authenticated AND a participant of the match. A
 *     bystander cannot trigger settlement.
 *   * The winner is derived from server-written state only — either
 *     `competitive_matches.winning_team` (server-set) or the participants'
 *     server-recorded `score`. The request body carries ONLY a match id.
 *   * Rating deltas are computed here with the shared engine, never accepted
 *     from the client, and persisted through `settle_competitive_match`, which
 *     is atomic and refuses to run twice.
 *
 * If a match has no recorded result yet (no scores, no winner), settlement is
 * refused with 409 rather than fabricating a 0-0 draw. Producing those scores
 * is the job of the (future) battle engine; until it exists this route is
 * deliberately inert for unplayed matches.
 */

type ParticipantRow = {
  user_id: string
  team: number | null
  score: number | string | null
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response
  const callerId = auth.auth.userId

  let body: { match_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const matchId = typeof body.match_id === 'string' ? body.match_id : ''
  if (!matchId) {
    return NextResponse.json({ error: 'match_id is required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // ── Load the match ────────────────────────────────────────────────────
  const { data: match, error: matchError } = await admin
    .from('competitive_matches')
    .select('id, mode, skill, status, season_id, winning_team, created_at')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Idempotent fast-path — the RPC also guards, but this avoids doing work.
  if (match.status === 'finished') {
    return NextResponse.json({ settled: false, reason: 'already_settled' })
  }
  if (match.status !== 'active' && match.status !== 'lobby') {
    return NextResponse.json({ error: `Match cannot be settled (status: ${match.status})` }, { status: 409 })
  }

  // ── Load participants ─────────────────────────────────────────────────
  const { data: participantRows, error: partError } = await admin
    .from('competitive_match_participants')
    .select('user_id, team, score')
    .eq('match_id', matchId)

  if (partError || !participantRows || participantRows.length < 2) {
    return NextResponse.json({ error: 'Match has no participants' }, { status: 409 })
  }

  const participants = participantRows as ParticipantRow[]

  // The caller must be in the match.
  if (!participants.some((p) => p.user_id === callerId)) {
    return NextResponse.json({ error: 'You are not a participant of this match' }, { status: 403 })
  }

  // ── Current ratings for this season ───────────────────────────────────
  const seasonId = match.season_id as string | null
  const userIds = participants.map((p) => p.user_id)

  let ratingByUser = new Map<string, { rating: number; games: number }>()
  if (seasonId) {
    const { data: ratings } = await admin
      .from('competitive_ratings')
      .select('user_id, rating, games')
      .eq('skill', match.skill)
      .eq('season_id', seasonId)
      .in('user_id', userIds)
    ratingByUser = new Map((ratings || []).map((r: any) => [r.user_id, { rating: Number(r.rating), games: r.games }]))
  }

  const settled: SettledParticipant[] = participants.map((p) => {
    const r = ratingByUser.get(p.user_id)
    return {
      user_id: p.user_id,
      team: p.team ?? 0,
      score: Number(p.score ?? 0),
      rating: r?.rating ?? DEFAULT_RATING,
      games: r?.games ?? 0,
    }
  })

  // ── Prior meetings (server-side, season-scoped) ───────────────────────
  // For each participant: how many FINISHED matches this season did they play
  // in which any member of the opposing side was on the other team. This is the
  // anti-farming input; it is never accepted from the client.
  const priorMeetings = new Map<string, number>()
  if (seasonId) {
    const { data: seasonMatches } = await admin
      .from('competitive_matches')
      .select('id')
      .eq('season_id', seasonId)
      .eq('status', 'finished')

    const finishedIds = (seasonMatches || []).map((m: any) => m.id)
    if (finishedIds.length > 0) {
      const { data: history } = await admin
        .from('competitive_match_participants')
        .select('match_id, user_id, team')
        .in('match_id', finishedIds)

      const teamsByMatch = new Map<string, Map<string, number>>()
      for (const h of (history || []) as any[]) {
        if (!teamsByMatch.has(h.match_id)) teamsByMatch.set(h.match_id, new Map())
        teamsByMatch.get(h.match_id)!.set(h.user_id, h.team ?? 0)
      }

      for (const s of settled) {
        let count = 0
        for (const [, roster] of teamsByMatch) {
          const myTeam = roster.get(s.user_id)
          if (myTeam === undefined) continue
          for (const [uid, team] of roster) {
            if (uid !== s.user_id && team !== myTeam) {
              count++ // one prior meeting against an opposing player
            }
          }
        }
        priorMeetings.set(s.user_id, count)
      }
    }
  }

  const plan = buildSettlementPlan({
    participants: settled,
    explicitWinner: match.winning_team ?? null,
    priorMeetingsFor: (uid) => priorMeetings.get(uid) ?? 0,
  })

  if (!plan.ok) {
    return NextResponse.json({ error: 'This match has no recorded result yet.' }, { status: 409 })
  }

  // ── Persist atomically + idempotently ─────────────────────────────────
  const { data, error } = await admin.rpc('settle_competitive_match', {
    p_match_id: matchId,
    p_results: plan.results,
  })

  if (error) {
    console.error('[compete/settle] rpc failed:', error.message)
    return NextResponse.json({ error: 'Could not settle the match.' }, { status: 500 })
  }

  return NextResponse.json({
    settled: true,
    winning_team: plan.winning_team,
    results: plan.results,
    rpc: data,
  })
}
