/**
 * ESPORTS DASHBOARD — guards the dashboard reshape + the Free Fire join loop.
 *
 * Two things are checked here:
 *   1. The pure helpers (code normalisation, record roll-ups) — the only
 *      client-side logic the section owns.
 *   2. The dashboard SHAPE, as a source guard: the fun-only dashboard must
 *      never drift back into study blocks (hackathons / internships), the
 *      esports section must be wired into /global, and Esports must stay
 *      reachable from every navigation surface.
 *
 * Failure mode this guards against: the study blocks silently reappearing on
 * the dashboard, or the esports board shipping back to "built but unreachable"
 * (it had no nav entry at all before this change).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  TEAM_CODE_ALPHABET,
  TEAM_CODE_LENGTH,
  activeTeamEntry,
  esportsRecord,
  gameLabel,
  isPlausibleTeamCode,
  joinByCodeHref,
  normalizeTeamCode,
  placementLabel,
  type EsportsHistoryEntry,
} from '@/lib/esports'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('team join code — one definition of "looks like a team code"', () => {
  it('is the same unambiguous alphabet the server generates from', () => {
    expect(TEAM_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(TEAM_CODE_LENGTH).toBe(6)
    // No 0/O/1/I/L — the letters people misread when copying a code by hand.
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(TEAM_CODE_ALPHABET.includes(ambiguous)).toBe(false)
    }
  })

  it('normalises what students actually paste', () => {
    expect(normalizeTeamCode('sx7k92')).toBe('SX7K92')
    expect(normalizeTeamCode('  sx7-k92  ')).toBe('SX7K92')
    expect(normalizeTeamCode('SX7K92.')).toBe('SX7K92')
    // Ambiguous characters are dropped, not silently mapped — the server has
    // no such code, so the shape check must reject it too.
    expect(normalizeTeamCode('SXOK92')).toBe('SXK92')
    // Deliberately NOT truncated — a 7-char paste must stay invalid rather
    // than silently becoming some other team's code.
    expect(normalizeTeamCode('ABCDEFG')).toBe('ABCDEFG')
    expect(normalizeTeamCode('')).toBe('')
  })

  it('accepts only a full-length code', () => {
    expect(isPlausibleTeamCode('sx7k92')).toBe(true)
    expect(isPlausibleTeamCode('SX7K9')).toBe(false)
    expect(isPlausibleTeamCode('SX7K922')).toBe(false)
    expect(isPlausibleTeamCode('sx7k9!')).toBe(false)
  })

  it('deep-links into the EXISTING self-join flow', () => {
    expect(joinByCodeHref('sx7-k92')).toBe('/tournaments/join?code=SX7K92')
  })
})

describe('game + placement labels', () => {
  it('names the games the board can show', () => {
    expect(gameLabel('FREE_FIRE')).toBe('Free Fire')
    expect(gameLabel('BGMI')).toBe('BGMI')
    expect(gameLabel(null)).toBe('Esports')
    expect(gameLabel('SOMETHING_NEW')).toBe('Esports')
  })

  it('renders placements the way the profile already does', () => {
    expect(placementLabel(1)).toBe('1st')
    expect(placementLabel(2)).toBe('2nd')
    expect(placementLabel(3)).toBe('3rd')
    expect(placementLabel(7)).toBe('#7')
    expect(placementLabel(null)).toBe('—')
    expect(placementLabel(0)).toBe('—')
  })
})

const entry = (over: Partial<EsportsHistoryEntry> = {}): EsportsHistoryEntry => ({
  tournament_id: 't1',
  tournament_name: 'Campus Cup',
  tournament_status: 'COMPLETED',
  team_name: 'Alpha',
  ff_ign: 'AyushOP',
  role: 'player',
  total_kills: 10,
  matches_played: 4,
  best_placement: 3,
  ...over,
})

describe('esportsRecord — the dashboard numbers', () => {
  it('sums matches and kills and keeps the best placement', () => {
    const record = esportsRecord([
      entry({ best_placement: 5, total_kills: 10, matches_played: 4 }),
      entry({ tournament_id: 't2', best_placement: 1, total_kills: 7, matches_played: 3 }),
    ])
    expect(record).toEqual({ tournaments: 2, matches: 7, kills: 17, bestPlacement: 1 })
  })

  it('handles the empty and partial states without NaN', () => {
    expect(esportsRecord([])).toEqual({ tournaments: 0, matches: 0, kills: 0, bestPlacement: null })
    // A player registered but with no result rows yet: IS NULL → 0, not NaN.
    const partial = esportsRecord([entry({ total_kills: 0, matches_played: 0, best_placement: null })])
    expect(partial).toEqual({ tournaments: 1, matches: 0, kills: 0, bestPlacement: null })
  })
})

describe('activeTeamEntry — "my team" only when it is still live', () => {
  it('prefers a running tournament', () => {
    const found = activeTeamEntry([
      entry({ tournament_id: 'done', tournament_status: 'COMPLETED' }),
      entry({ tournament_id: 'live', tournament_status: 'LIVE' }),
    ])
    expect(found?.tournament_id).toBe('live')
  })

  it('returns nothing when every tournament is finished', () => {
    expect(activeTeamEntry([entry({ tournament_status: 'COMPLETED' })])).toBeNull()
    expect(activeTeamEntry([])).toBeNull()
  })
})

// ── Dashboard shape (source guard) ─────────────────────────────────────────

describe('the /global dashboard is fun-only', () => {
  const dashboard = read('src/app/global/page.tsx')

  it('wires the esports section in', () => {
    expect(dashboard).toContain("from '@/components/esports/EsportsSection'")
    expect(dashboard).toContain('<EsportsSection')
  })

  it('surfaces live voice and the student-made groups', () => {
    expect(dashboard).toContain('fetchLiveVoiceRooms')
    expect(dashboard).toContain("from '@/lib/liveVoice'")
    expect(dashboard).toContain('/live-voice-chat')
    expect(dashboard).toContain('/groups')
    expect(dashboard).toContain('community_members')
  })

  it('no longer carries the study blocks', () => {
    expect(dashboard).not.toContain('Hackathons')
    expect(dashboard).not.toContain('Internships')
    expect(dashboard).not.toContain('fetchInternships')
    expect(dashboard).not.toContain('daysLeft')
  })
})

describe('the esports section joins through the server, never on its own', () => {
  const section = read('src/components/esports/EsportsSection.tsx')

  it('reads the public board and the player history', () => {
    expect(section).toContain('get_tournaments_list')
    expect(section).toContain('get_my_tournament_history')
  })

  it('resolves the code server-side before handing off to /tournaments/join', () => {
    expect(section).toContain('resolveInvite')
    expect(section).toContain('joinByCodeHref')
    // No client-side join: the roster write belongs to join_team_by_code.
    expect(section).not.toContain('join_team_by_code')
  })

  it('sends signed-out students through login first', () => {
    expect(section).toContain('/auth/login?redirect=')
  })
})

describe('Esports is reachable from every navigation surface', () => {
  it('desktop sidebar pillar', () => {
    const layout = read('src/components/Layout.tsx')
    expect(layout).toContain("href: '/tournaments'")
  })

  it('mobile ☰ menu', () => {
    expect(read('src/components/mobileNav.ts')).toContain("href: '/tournaments'")
  })

  it('More page', () => {
    expect(read('src/app/more/page.tsx')).toContain("href: '/tournaments'")
  })
})
