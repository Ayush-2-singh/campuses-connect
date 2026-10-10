/**
 * GAMES SECTION — guards the split that pulled Games out of Community.
 *
 * Games used to hide inside Community as the "Compete, Games & Clash" entry,
 * which pointed at the Compete clash tab — where actual games (Typing Battle,
 * Quick Math) sat next to esports (Free Fire tournaments). Games now has its
 * own top-level pillar (/games) and holds ONLY games; esports keeps its own
 * pillar (/tournaments); Compete keeps Rankings, Daily Challenge and the
 * Campus Clash contest.
 *
 * Failure mode this guards against: esports silently creeping back into the
 * games hub, or the games hub shipping "built but unreachable" (no nav entry).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('the /games hub is games-only', () => {
  const hub = read('src/app/games/page.tsx')

  it('surfaces the games themselves', () => {
    expect(hub).toMatch(/Typing Battle/)
    expect(hub).toMatch(/\/games\/typing/)
    expect(hub).toMatch(/Quick Math/)
    expect(hub).toMatch(/\/games\/math/)
  })

  it('carries no esports or tournament content', () => {
    expect(hub).not.toMatch(/\/tournaments/)
    expect(hub).not.toMatch(/Free Fire/)
    expect(hub).not.toMatch(/Esports/i)
  })
})

describe('Compete no longer carries games or esports', () => {
  const clash = read('src/app/compete/ClashTab.tsx')

  it('keeps only the Campus Clash contest', () => {
    expect(clash).toMatch(/Campus Clash/)
    expect(clash).not.toMatch(/Typing Battle/)
    expect(clash).not.toMatch(/\/games\/typing/)
    expect(clash).not.toMatch(/\/tournaments/)
    expect(clash).not.toMatch(/Free Fire/)
  })
})

describe('Games is reachable from every navigation surface', () => {
  it('desktop sidebar pillar', () => {
    expect(read('src/components/Layout.tsx')).toContain("href: '/games'")
  })

  it('mobile ☰ menu', () => {
    expect(read('src/components/mobileNav.ts')).toContain("href: '/games'")
  })

  it('More page', () => {
    expect(read('src/app/more/page.tsx')).toContain("href: '/games'")
  })
})

describe('shareable game links keep their room code', () => {
  // Both game routes use a catch-all segment ([[...code]]), where Next hands
  // the param over as an ARRAY — never a string. Reading it as a string made
  // /games/typing/123456 and /games/math/123456 silently open a fresh lobby
  // instead of joining the shared room.
  it('typing reads the code out of the catch-all array', () => {
    const page = read('src/app/games/typing/[[...code]]/page.tsx')
    expect(page).toMatch(/Array\.isArray\(rawCode\)/)
  })

  it('math reads the code out of the catch-all array too', () => {
    const page = read('src/app/games/math/[[...code]]/page.tsx')
    expect(page).toMatch(/Array\.isArray\(rawCode\)/)
    expect(page).not.toMatch(/typeof params\?\.code === 'string' \? params\.code : ''/)
  })
})

describe('Games is no longer nested under Community', () => {
  it('the Community nav group no longer links the merged games/clash entry', () => {
    // The old "Compete, Games & Clash" child pointed at the Compete clash tab.
    expect(read('src/components/Layout.tsx')).not.toContain("href: '/compete?tab=clash'")
  })
})
