/**
 * Discovery refactor guard (repo-wide, walks the tree — covers uncommitted files).
 *
 * Locks in the 2026-10-24 Discovery refactor:
 *   1. Confession anonymity: the client must never reference the author of a
 *      confession — only the `confessions_public` view and its RPCs.
 *   2. Confession backend (RPCs + view) must stay wired somewhere in the app.
 *   3. The retired /opportunities page must remain a redirect, not a
 *      resurrected UI; discovery must own the collaboration loop.
 *   4. The swipe loop pieces (deck, card, action layer, migration) must exist.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../src')
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'build',
  'dist',
  '.turbo',
  'android',
  'ios',
  '.vercel',
])
const EXTENSIONS = new Set(['.ts', '.tsx'])

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (EXTENSIONS.has(path.extname(entry.name))) found.push(full)
  }
  return found
}

const files = walk(SRC)

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8')
}

describe('discovery refactor guard', () => {
  it('confession author is never exposed to the client', () => {
    const offenders = files.filter((f) => {
      const s = fs.readFileSync(f, 'utf8')
      // A .from('confessions') read would bypass the anonymous view. The base
      // table is revoked for clients; any reference in src is a mistake.
      return /\.from\(\s*['"]confessions['"]/.test(s)
    })
    expect(offenders, offRel(offenders)).toEqual([])
  })

  it('confession backend stays wired (view + all three RPCs)', () => {
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    expect(all).toContain('confessions_public')
    expect(all).toContain('create_confession')
    expect(all).toContain('toggle_confession_reaction')
    expect(all).toContain('report_confession')
  })

  it('the old opportunities UI stays retired — page is a redirect only', () => {
    const page = read('app/opportunities/page.tsx')
    expect(page).toContain('redirect(')
    // A resurrected UI would fetch the legacy API or render opportunity cards.
    expect(page).not.toContain('/api/opportunities')
    expect(page.length).toBeLessThan(2000)
  })

  it('swipe loop pieces exist', () => {
    expect(fs.existsSync(path.join(SRC, 'components/discovery/SwipeDeck.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(SRC, 'components/discovery/DiscoveryCard.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(SRC, 'components/discovery/ConfessionsTab.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(SRC, 'app/discover/[id]/page.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(SRC, 'lib/discovery.ts'))).toBe(true)
    expect(fs.existsSync(path.join(__dirname, '../supabase/migrations/20261024_discovery_collab.sql'))).toBe(true)
  })

  it('one action layer: swipe/buttons/keyboard share record_discovery_action', () => {
    const deck = read('components/discovery/SwipeDeck.tsx')
    expect(deck).toMatch(/onAction\(current\.id, action\)/)
    expect(deck).toMatch(/ArrowLeft/)
    expect(deck).toMatch(/ArrowRight/)
    const lib = read('lib/discovery.ts')
    expect(lib).toContain('record_discovery_action')
    expect(lib).toContain('accept_discovery_interest')
  })

  it('discovery page no longer shows the four explore cards as the hero', () => {
    const page = read('app/discover/page.tsx')
    expect(page).toContain('SwipeDeck')
    // The old static explore grid icons must not dominate: they may appear
    // only as small secondary links.
    const secondaryIdx = page.indexOf('SECONDARY_LINKS')
    expect(secondaryIdx).toBeGreaterThan(-1)
  })

  it('mobile bottom bar is exactly the five primary destinations (final IA)', () => {
    const navSrc = fs.readFileSync(path.join(SRC, 'components/mobileNav.ts'), 'utf8')
     
    const mod: Record<string, unknown> = {}
    const navMatch = navSrc.match(/export const MOBILE_NAV = (\[[\s\S]*?\])/)
    expect(navMatch).toBeTruthy()
    const nav = eval(navMatch![1]) as { label: string; href: string }[]
    expect(nav.map((i) => i.href)).toEqual(['/feed', '/discover', '/community', '/notes', '/profile'])
    void mod
    // Secondary features must NOT be bottom tabs.
    for (const banned of [
      '/opportunities',
      '/confessions',
      '/compete',
      '/talent',
      '/blog',
      '/live-voice-chat',
      '/communities',
      '/chat',
    ]) {
      expect(
        nav.some((i) => i.href === banned),
        `bottom bar must not contain ${banned}`
      ).toBe(false)
    }
  })

  it('confessions entry point lives in Community, not Discovery', () => {
    const discover = read('app/discover/page.tsx')
    // No confession UI wiring in Discovery (comments pointing at Community are fine).
    expect(discover).not.toContain('ConfessionsTab')
    expect(discover).not.toContain("key: 'confessions'")
    const hub = read('app/community/page.tsx')
    expect(hub).toContain('ConfessionsTab')
  })

  it('community hub exists and groups the secondary social features', () => {
    const hub = read('app/community/page.tsx')
    for (const expected of ['/communities', '/chat', '/compete', '/live-voice-chat']) {
      expect(hub).toContain(expected)
    }
  })

  it('anon-read migration exists for the public-first requirement', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261025_discovery_anon_read.sql'), 'utf8')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.discovery_feed')
    expect(sql).toMatch(/TO anon;/)
    // Write RPCs stay auth-only.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_discovery_action\(UUID, TEXT\) FROM PUBLIC, anon;/)
  })
})

function offRel(paths: string[]): string {
  return paths.map((p) => path.relative(SRC, p)).join(', ')
}
