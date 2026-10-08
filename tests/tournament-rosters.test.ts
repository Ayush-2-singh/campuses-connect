import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { rosterState, inviteLink, JOIN_ERROR_COPY } from '@/lib/tournaments/rosters'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

// ── Migration surface (051) — the security contract lives in SQL ─────────────

describe('tournament rosters migration — server-side authorization', () => {
  const sql = read('supabase/migrations/051_tournament_rosters.sql')

  it('ships the roster schema: locks, join codes, FF identity, room credentials', () => {
    expect(sql).toContain('roster_locked')
    expect(sql).toContain('join_code')
    expect(sql).toContain('ff_ign')
    expect(sql).toContain('ff_uid')
    expect(sql).toContain('registration_closed')
    expect(sql).toContain('room_id')
    expect(sql).toContain('room_released_at')
  })

  it('every roster RPC is SECURITY DEFINER with explicit grants only', () => {
    const rpcs = [
      'regenerate_team_join_code',
      'get_my_tournament_team',
      'remove_team_player',
      'resolve_team_invite',
      'join_team_by_code',
      'set_team_roster_lock',
      'set_registration_closed',
      'set_player_ff_identity',
      'set_room_credentials',
      'get_room_credentials',
      'assign_team_igl',
      'get_my_tournament_history',
    ]
    for (const fn of rpcs) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`)
      // grant follows each function
      expect(sql).toMatch(new RegExp(`GRANT[^;]*${fn}\\(`))
    }
    // no broad table writes granted — RPC-only mutation surface
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON/)
  })

  it('join RPC rejects: unauthenticated, locked rosters, closed registration, full teams, dup UIDs', () => {
    const joinFn = sql.slice(sql.indexOf('join_team_by_code'), sql.indexOf('4b. ORGANIZER'))
    expect(joinFn).toContain("IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'")
    expect(joinFn).toContain("RAISE EXCEPTION 'roster_locked'")
    expect(joinFn).toContain("RAISE EXCEPTION 'registration_closed'")
    expect(joinFn).toContain("RAISE EXCEPTION 'team_full'")
    expect(joinFn).toContain("RAISE EXCEPTION 'already_on_team'")
    expect(joinFn).toContain("RAISE EXCEPTION 'duplicate_uid'")
  })

  it('join code resolver is anon-readable but write RPCs are authenticated-only', () => {
    expect(sql).toMatch(/GRANT[^;]*resolve_team_invite[^;]*TO anon, authenticated/)
    expect(sql).toMatch(/GRANT[^;]*get_room_credentials[^;]*TO anon, authenticated/)
    // mutations are authenticated-only
    expect(sql).not.toMatch(/GRANT[^;]*join_team_by_code[^;]*TO anon/)
    expect(sql).not.toMatch(/GRANT[^;]*set_team_roster_lock[^;]*TO anon/)
  })

  it('organizer actions go through tournament_allows() — scoped RBAC, not just platform admin', () => {
    expect(sql).toContain('public.tournament_allows(')
    expect(sql).toMatch(/set_team_roster_lock[\s\S]*manage_teams/)
    expect(sql).toMatch(/set_registration_closed[\s\S]*edit_info/)
    expect(sql).toMatch(/set_player_ff_identity[\s\S]*manage_players/)
    expect(sql).toMatch(/set_room_credentials[\s\S]*manage_matches/)
  })

  it('room credentials never leak before release to non-organizers', () => {
    const credsFn = sql.slice(sql.indexOf('get_room_credentials(p_match'), sql.indexOf('get_my_tournament_history'))
    expect(credsFn).toContain('room_released_at IS NULL AND NOT v_admin')
    expect(credsFn).toContain("jsonb_build_object('ok', true, 'released', false)")
  })

  it('IGL self-service is limited: leader check, no organizer-seeded removal, lock blocks', () => {
    expect(sql).toContain('public.tournament_is_team_leader')
    const rmFn = sql.slice(sql.indexOf('remove_team_player(p_team'), sql.indexOf('-- ── 4. PLAYER SELF-JOIN'))
    expect(rmFn).toContain("v_via = 'organizer'")
    expect(rmFn).toContain("RAISE EXCEPTION 'forbidden'")
    expect(rmFn).toContain("RAISE EXCEPTION 'roster_locked'")
  })

  it('FF UID is unique per tournament (partial index, placeholders exempt)', () => {
    expect(sql).toContain('uq_tplayer_ff_uid')
    expect(sql).toContain('WHERE ff_uid IS NOT NULL')
  })

  it('roster/identity/room changes are audit-logged', () => {
    expect(sql).toContain("'player_joined'")
    expect(sql).toContain("'roster_locked'")
    expect(sql).toContain("'ff_identity_changed'")
    expect(sql).toContain("'room_credentials_set'")
    expect(sql).toContain("'igl_assigned'")
  })
})

// ── Client library behavior ───────────────────────────────────────────────────

describe('roster client — rosterState', () => {
  it('incomplete below capacity', () => {
    expect(rosterState(3, 4, false)).toBe('incomplete')
  })
  it('complete at capacity, unlocked', () => {
    expect(rosterState(4, 4, false)).toBe('complete')
  })
  it('locked overrides complete', () => {
    expect(rosterState(4, 4, true)).toBe('locked')
    expect(rosterState(2, 4, true)).toBe('locked')
  })
})

describe('roster client — invite link & join errors', () => {
  it('builds a shareable link with the code, no internal ids', () => {
    const link = inviteLink('https://connecttocampus.com', 'SX7K92')
    expect(link).toBe('https://connecttocampus.com/tournaments/join?code=SX7K92')
    expect(link).not.toContain('uuid')
  })

  it('every server rejection has human copy (spec §31)', () => {
    for (const code of [
      'invalid_code',
      'roster_locked',
      'registration_closed',
      'team_full',
      'already_on_team',
      'duplicate_uid',
      'unauthenticated',
    ]) {
      expect(JOIN_ERROR_COPY[code]).toBeTruthy()
      expect(JOIN_ERROR_COPY[code].length).toBeGreaterThan(10)
    }
  })
})

// ── UI wiring — no emoji, Icon system only (spec §34) ────────────────────────

describe('tournament roster UI surfaces', () => {
  it('join page: login gate, identity form, no emoji interface icons', () => {
    const page = read('src/app/tournaments/join/page.tsx')
    expect(page).toContain('Login to ConnectToCampus')
    expect(page).toContain('In-game name (IGN)')
    expect(page).toContain('Free Fire UID')
    expect(page).toContain('Confirm & Join Team')
    expect(page).toMatch(/resolveInvite/)
    expect(page).toMatch(/joinByCode/)
  })

  it('IGL panel: roster slots, invite copy, regenerate, remove; Icon not emoji', () => {
    const panel = read('src/components/tournaments/IglTeamPanel.tsx')
    expect(panel).toContain('Copy Invite Link')
    expect(panel).toContain('Open slot — share the invite')
    expect(panel).toContain('regenerateJoinCode')
    expect(panel).toContain('removePlayer')
    expect(panel).not.toMatch(/[🔒✅○]/u)
  })

  it('admin page exposes IGL assignment, roster lock, registration and room release', () => {
    const admin = read('src/app/tournaments/admin/page.tsx')
    expect(admin).toContain('assign_team_igl')
    expect(admin).toContain('set_team_roster_lock')
    // Registration open/close goes through the richer RPC (it also carries the
    // deadline and max-team cap); set_registration_closed stays in the lib for
    // callers that only toggle the flag.
    expect(admin).toContain('set_tournament_registration')
    expect(admin).toContain('regenerate_team_join_code')
    expect(admin).toContain('set_player_ff_identity')
    expect(admin).toContain('set_room_credentials')
  })

  it('profile shows competitive history only when it exists (progressive disclosure)', () => {
    const profile = read('src/app/profile/page.tsx')
    expect(profile).toContain('fetchMyHistory')
    expect(profile).toContain('history.length > 0')
    expect(profile).toContain('Competitive — Free Fire')
  })
})
