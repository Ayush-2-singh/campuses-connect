/**
 * Guards two product decisions:
 *
 *  1. The "ConnectToCampus" wordmark is drawn in the LOGO's own colours
 *     everywhere — "Connect" in the theme text colour, "ToCampus" in the logo
 *     orange (#FC9000). The failure mode this catches is a new page (or a
 *     refactor) hand-rolling `Connect<span style={{ color: ... }}>ToCampus`
 *     again with the section accent (which recolours per route) or a stray
 *     hardcoded orange, so the brand text drifts page to page.
 *
 *  2. `/` is the standalone "Campus Voice Community" board — its own header,
 *     no app shell (no sidebar / bottom bar) — matching the free4talk-style
 *     reference. The failure mode is the landing creeping back inside <Layout>.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'build', 'dist', '.turbo', 'android', 'ios'])
const EXTS = new Set(['.ts', '.tsx'])

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (EXTS.has(path.extname(entry.name))) found.push(full)
  }
  return found
}

describe('the wordmark uses the logo colour everywhere', () => {
  const brand = read('src/components/BrandName.tsx')

  it('BrandName paints ToCampus in the logo orange', () => {
    expect(brand).toMatch(/#FC9000/i)
    expect(brand).toContain('Connect')
    expect(brand).toContain('ToCampus')
  })

  it('no file hand-rolls its own ConnectToCampus wordmark', () => {
    const offenders: string[] = []
    for (const file of walk(path.join(root, 'src'))) {
      const rel = path.relative(root, file).split(path.sep).join('/')
      if (rel === 'src/components/BrandName.tsx') continue
      // The old inline pattern: Connect<span ...>ToCampus</span>
      if (/Connect<span[^>]*>ToCampus<\/span>/.test(fs.readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders, `Use <BrandName /> instead of hand-rolling the wordmark:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('the first page is a standalone voice community board', () => {
  const landing = read('src/components/home/RoomDiscovery.tsx')

  it('carries the Campus Voice Community title', () => {
    expect(landing).toContain('Campus Voice Community')
  })

  it('is standalone — it does not render inside the app shell', () => {
    expect(landing).not.toContain("from '@/components/Layout'")
    expect(landing).not.toContain('<Layout')
  })

  it('uses the shared wordmark and loads its stylesheet', () => {
    expect(landing).toContain("from '@/components/BrandName'")
    expect(read('src/app/layout.tsx')).toContain("import './landing.css'")
  })

  it('shows the free4talk-style controls (search, size, category chips, join CTA)', () => {
    expect(landing).toMatch(/Search by topic/)
    expect(landing).toMatch(/f4-zoom/)
    expect(landing).toMatch(/ROOM_CATEGORIES/)
    expect(landing).toContain('Join and talk now!')
  })
})
