import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateTeamScore,
  isEligibleForNextStage,
  rankTeams,
  toCsv,
  topNQualify,
  validateResultEntry,
  type ScoringConfig,
} from '@/lib/tournaments/scoring'
import { resolveRole, roleLabel, tournamentAllows } from '@/lib/tournaments/rbac'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const CONFIG: ScoringConfig = {
  killPointValue: 1,
  placementPoints: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1 },
}

// ─── Scoring engine (spec §13) ────────────────────────────────────────────────

describe('tournaments — kill calculation', () => {
  it('sums raw player kills: 8+6+4+2 = 20', () => {
    const score = calculateTeamScore(
      {
        team_id: 'alpha',
        placement: 1,
        players: [
          { player_id: 'ayush', kills: 8 },
          { player_id: 'rahul', kills: 6 },
          { player_id: 'ankit', kills: 4 },
          { player_id: 'rohan', kills: 2 },
        ],
      },
      CONFIG
    )
    expect(score.total_kills).toBe(20)
  })

  it('kill points = total kills × kill point value', () => {
    const score = calculateTeamScore(
      { team_id: 'a', placement: 1, players: [{ player_id: 'p', kills: 10 }] },
      { ...CONFIG, killPointValue: 2 }
    )
    expect(score.kill_points).toBe(20)
  })

  it('placement points come from the configurable table', () => {
    const score = calculateTeamScore({ team_id: 'a', placement: 2, players: [] }, CONFIG)
    expect(score.placement_points).toBe(12)
  })

  it('total = kill points + placement points (spec example: 20 + 15 = 35)', () => {
    const score = calculateTeamScore(
      {
        team_id: 'alpha',
        placement: 1,
        players: [
          { player_id: 'a', kills: 8 },
          { player_id: 'b', kills: 6 },
          { player_id: 'c', kills: 4 },
          { player_id: 'd', kills: 2 },
        ],
      },
      CONFIG
    )
    expect(score.total_points).toBe(35)
  })

  it('unknown placements score zero, never NaN', () => {
    const score = calculateTeamScore({ team_id: 'a', placement: 99, players: [] }, CONFIG)
    expect(score.placement_points).toBe(0)
    expect(score.total_points).toBe(0)
  })

  it('negative kills are clamped to 0 (validation mirror)', () => {
    const score = calculateTeamScore({ team_id: 'a', placement: 1, players: [{ player_id: 'p', kills: -5 }] }, CONFIG)
    expect(score.total_kills).toBe(0)
  })
})

// ─── Ranking & ties (spec §42) ────────────────────────────────────────────────

describe('tournaments — ranking & tie-breaking', () => {
  it('higher total points rank above lower', () => {
    const ranked = rankTeams([
      { team_id: 'low', total_points: 10, total_kills: 5 },
      { team_id: 'high', total_points: 42, total_kills: 8 },
    ] as any)
    expect(ranked[0].team_id).toBe('high')
    expect(ranked[0].rank).toBe(1)
  })

  it('point ties break by kills', () => {
    const ranked = rankTeams([
      { team_id: 'few-kills', total_points: 35, total_kills: 12 },
      { team_id: 'more-kills', total_points: 35, total_kills: 20 },
    ] as any)
    expect(ranked[0].team_id).toBe('more-kills')
  })

  it('full ties are flagged for admin review, never silently ordered', () => {
    const ranked = rankTeams([
      { team_id: 'x', team_name: 'X', total_points: 35, total_kills: 20 },
      { team_id: 'y', team_name: 'Y', total_points: 35, total_kills: 20 },
    ] as any)
    expect(ranked[1].tie).toBe(true)
  })

  it('top-N qualification excludes ties straddling the cut', () => {
    const ranked = rankTeams([
      { team_id: 'a', team_name: 'A', total_points: 50, total_kills: 10 },
      { team_id: 'b', team_name: 'B', total_points: 35, total_kills: 20 },
      { team_id: 'c', team_name: 'C', total_points: 35, total_kills: 20 },
      { team_id: 'd', team_name: 'D', total_points: 20, total_kills: 5 },
    ] as any[])
    const result = topNQualify<any>(ranked as any[], 3)
    expect(result.find((r: any) => r.team_id === 'a')!.qualifies).toBe(true)
    // B and C tie at rank 2/3 — the cut line: no silent qualification
    expect(result.find((r: any) => r.team_id === 'b')!.qualifies).toBe(false)
    expect(result.find((r: any) => r.team_id === 'c')!.qualifies).toBe(false)
    expect(result.find((r: any) => r.team_id === 'd')!.qualifies).toBe(false)
  })
})

// ─── Qualification eligibility (spec §25/§43) ─────────────────────────────────

describe('tournaments — next-stage eligibility', () => {
  it('only QUALIFIED teams continue; reversal removes eligibility', () => {
    expect(isEligibleForNextStage({ status: 'QUALIFIED', qualification_status: 'QUALIFIED' })).toBe(true)
    expect(isEligibleForNextStage({ status: 'QUALIFIED', qualification_status: 'REVERSED' })).toBe(false)
    expect(isEligibleForNextStage({ status: 'ELIMINATED', qualification_status: 'REJECTED' })).toBe(false)
    expect(isEligibleForNextStage({ status: 'DISQUALIFIED', qualification_status: 'QUALIFIED' })).toBe(false)
  })
})

// ─── Entry validation & export ────────────────────────────────────────────────

describe('tournaments — result entry validation', () => {
  const base = { teamSize: 4, maxPlacement: 4 }

  it('rejects duplicate placements', () => {
    const err = validateResultEntry(
      [
        { team_id: 'a', placement: 1, players: [] },
        { team_id: 'b', placement: 1, players: [] },
      ],
      base
    )
    expect(err).toMatch(/placement 1/i)
  })

  it('rejects negative kills', () => {
    const err = validateResultEntry([{ team_id: 'a', placement: 1, players: [{ player_id: 'p', kills: -1 }] }], base)
    expect(err).toMatch(/negative/i)
  })

  it('accepts a clean entry', () => {
    expect(
      validateResultEntry(
        [
          { team_id: 'a', placement: 1, players: [{ player_id: 'p', kills: 8 }] },
          { team_id: 'b', placement: 2, players: [] },
        ],
        base
      )
    ).toBeNull()
  })
})

describe('tournaments — CSV export', () => {
  it('quotes fields containing commas and escapes quotes', () => {
    const csv = toCsv([{ team: 'Alpha, Inc', kills: 20, note: 'said "gg"' }])
    expect(csv).toContain('"Alpha, Inc"')
    expect(csv).toContain('"said ""gg"""')
  })
})

// ─── SQL surface & security guards (spec §48/§49) ─────────────────────────────

// ─── Scoped RBAC (051): role matrix, isolation, ownership (spec §41) ────────────

describe('tournaments — RBAC permission matrix', () => {
  it('OWNER can do everything including scoring, organizers and transfer', () => {
    for (const a of [
      'enter_kills',
      'submit_result',
      'verify_result',
      'lock_result',
      'reopen_result',
      'manage_qualification',
      'reverse_qualification',
      'change_scoring',
      'manage_organizers',
      'transfer_ownership',
      'cancel_tournament',
      'view_audit',
    ] as const) {
      expect(tournamentAllows('OWNER', a)).toBe(true)
    }
  })

  it('ADMIN manages results/teams/qualification but NEVER scoring, organizers, ownership, cancellation', () => {
    for (const a of ['enter_kills', 'submit_result', 'verify_result', 'manage_qualification', 'view_audit'] as const) {
      expect(tournamentAllows('ADMIN', a)).toBe(true)
    }
    for (const a of [
      'change_scoring',
      'manage_organizers',
      'transfer_ownership',
      'cancel_tournament',
      'lock_result',
      'reopen_result',
      'reverse_qualification',
    ] as const) {
      expect(tournamentAllows('ADMIN', a)).toBe(false)
    }
  })

  it('VIEWER is read-only — every mutation denied', () => {
    expect(tournamentAllows('VIEWER', 'view')).toBe(true)
    for (const a of [
      'enter_kills',
      'submit_result',
      'manage_teams',
      'manage_qualification',
      'change_scoring',
      'manage_organizers',
    ] as const) {
      expect(tournamentAllows('VIEWER', a)).toBe(false)
    }
  })

  it('PLATFORM_ADMIN outranks everything; no role means nothing', () => {
    expect(tournamentAllows('PLATFORM_ADMIN', 'change_scoring')).toBe(true)
    expect(tournamentAllows('PLATFORM_ADMIN', 'transfer_ownership')).toBe(true)
    expect(tournamentAllows(null, 'view')).toBe(false)
    expect(tournamentAllows(undefined, 'enter_kills')).toBe(false)
  })

  it('roles resolve per-tournament: same user, different roles, no global leak', () => {
    // §8/§34: Ayush OWNER of A; Rahul ADMIN in A but OWNER of B — all valid
    expect(resolveRole('OWNER', false)).toBe('OWNER')
    expect(resolveRole('ADMIN', false)).toBe('ADMIN')
    expect(resolveRole('VIEWER', false)).toBe('VIEWER')
    expect(resolveRole(null, false)).toBeNull()
    // a membership never manufactures platform power
    expect(resolveRole('OWNER', false)).not.toBe('PLATFORM_ADMIN')
    expect(resolveRole(null, true)).toBe('PLATFORM_ADMIN')
  })

  it('dashboard copy never calls an organizer a CampusConnect admin (§40)', () => {
    expect(roleLabel('OWNER')).toMatch(/owner/i)
    expect(roleLabel('ADMIN')).toMatch(/organizer/i)
    expect(roleLabel('ADMIN')).not.toMatch(/^admin$/i)
  })
})

describe('tournaments — RBAC SQL surface (051)', () => {
  const rbac = read('supabase/migrations/051_tournament_rbac.sql')

  it('memberships are tournament-scoped: one owner, many admins/viewers', () => {
    expect(rbac).toMatch(/CREATE TABLE IF NOT EXISTS public\.tournament_members/)
    expect(rbac).toMatch(/idx_tournament_members_one_owner/)
    expect(rbac).toMatch(/WHERE role = 'OWNER'/)
    expect(rbac).toMatch(/UNIQUE \(tournament_id, user_id\)/)
  })

  it('authorization is isPlatformAdmin OR hasTournamentRole — never just isAdmin (§9)', () => {
    expect(rbac).toMatch(/FUNCTION public\.tournament_role/)
    expect(rbac).toMatch(/FUNCTION public\.tournament_allows/)
  })

  it('creation auto-assigns OWNER without global grants (§11)', () => {
    expect(rbac).toMatch(/'OWNER', auth\.uid\(\)/)
  })

  it('every sensitive RPC now checks the scoped role, not the global one', () => {
    for (const rpc of [
      'submit_match_result',
      'set_match_result_state',
      'confirm_stage_qualifications',
      'reverse_qualification',
      'manual_qualification_override',
      'add_tournament_announcement',
      'finalize_tournament',
      'set_scoring_rule',
    ]) {
      const fn = rbac.indexOf(`FUNCTION public.${rpc}`)
      expect(fn).toBeGreaterThan(-1)
    }
    expect(rbac).toMatch(/tournament_allows\(v_tour, 'enter_kills'\)/)
    expect(rbac).toMatch(/tournament_allows\(p_tournament, 'change_scoring'\)/)
  })

  it('organizer management is OWNER-only and membership writes bypass nothing', () => {
    expect(rbac).toMatch(/FUNCTION public\.add_tournament_organizer/)
    expect(rbac).toMatch(/REVOKE ALL ON public\.tournament_members FROM anon, authenticated/)
    expect(rbac).not.toMatch(/POLICY \w+ ON public\.tournament_members\s+FOR (INSERT|UPDATE|DELETE)/)
  })

  it('ownership transfer is explicit, audited, and ownerless is impossible (§17/§18)', () => {
    expect(rbac).toMatch(/FUNCTION public\.transfer_tournament_ownership/)
    expect(rbac).toMatch(/'ownership_transferred'/)
    expect(rbac).toMatch(/IF v_role = 'OWNER' THEN RETURN 'is_owner'/)
    expect(rbac).toMatch(/role = 'ADMIN', updated_at = now\(\)/)
  })

  it('members table SELECT is scoped to self or platform admin (§21)', () => {
    expect(rbac).toMatch(/user_id = auth\.uid\(\)/)
  })
})

describe('tournaments — SQL surface', () => {
  const sql = read('supabase/migrations/050_tournaments.sql')

  it('placements and totals are stored, but only the scoring RPC writes them', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.match_team_results/)
    expect(sql).toMatch(/FUNCTION public\.recalc_match_team/)
    expect(sql).toMatch(/COALESCE\(v_kills, 0\) \* COALESCE\(v_kpv, 0\)/)
  })

  it('submit takes FACTS only — no client-supplied totals exist', () => {
    expect(sql).toMatch(/FUNCTION public\.submit_match_result/)
    // the payload keys are team_id/placement/players.kills — never points
    expect(sql).not.toMatch(/->>'total_points'/)
    expect(sql).not.toMatch(/->>'kill_points'/)
  })

  it('players may only receive kills for their own team', () => {
    expect(sql).toMatch(/WHERE id = v_pid AND team_id = v_tid AND tournament_id = v_tour/)
  })

  it('result lifecycle is forward-only with an audited reopen', () => {
    expect(sql).toMatch(/'reason_required'/)
    // audit actions are built as 'result_' || action — reopen included
    expect(sql).toMatch(/'result_' \|\| p_action/)
    expect(sql).toMatch(/WHEN 'reopen'/)
  })

  it('qualification is explicit, reversible, and never hard-deleted', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.stage_qualifications/)
    expect(sql).toMatch(/'REVERSED'/)
    expect(sql).not.toMatch(/DELETE FROM public\.stage_qualifications/)
  })

  it('locked results refuse edits before the reopen check', () => {
    const lockOrder = sql.indexOf("IF v_state = 'LOCKED' THEN RETURN 'locked'")
    const deleteOrder = sql.indexOf('DELETE FROM public.match_player_stats')
    expect(lockOrder).toBeGreaterThan(-1)
    expect(deleteOrder).toBeGreaterThan(lockOrder)
  })

  it('optimistic concurrency via result_version (spec §50)', () => {
    expect(sql).toMatch(/p_expected_version/)
    expect(sql).toMatch(/'conflict'/)
  })

  it('champion is derived from the final leaderboard, server-side only', () => {
    expect(sql).toMatch(/FUNCTION public\.finalize_tournament/)
    expect(sql).toMatch(/champion_team_id/)
  })

  it('every admin RPC is revoked from PUBLIC; read RPCs grant anon', () => {
    for (const fn of [
      'create_tournament',
      'submit_match_result',
      'confirm_stage_qualifications',
      'reverse_qualification',
      'finalize_tournament',
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}`))
      expect(sql).toMatch(new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${fn}[^;]*TO authenticated`))
    }
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.get_tournament_team_leaderboard\(UUID,UUID\) TO anon/)
  })

  it('audit log records actor, old→new, and reason', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tournament_audit_log/)
    expect(sql).toMatch(/old_value\s+JSONB/)
    expect(sql).toMatch(/qualification_reversed/)
  })

  it('tournaments hide DRAFT/CANCELLED from the public read policy', () => {
    expect(sql).toMatch(/status NOT IN \('DRAFT', 'CANCELLED'\)/)
  })

  it('admin UI uses the shared engine for the live preview', () => {
    const admin = read('src/app/tournaments/admin/page.tsx')
    expect(admin).toMatch(/calculateTeamScore/)
    expect(admin).toMatch(/p_expected_version/)
    expect(admin).toMatch(/modified by another admin/)
  })

  it('public page renders standings via the leaderboard RPC, not client math', () => {
    const pub = read('src/app/tournaments/[id]/page.tsx')
    expect(pub).toMatch(/get_tournament_team_leaderboard/)
    expect(pub).toMatch(/get_tournament_player_leaderboard/)
  })
})
