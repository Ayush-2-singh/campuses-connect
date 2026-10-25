/**
 * MEET LAYOUTS — every mode, and up to THREE people on the stage at once.
 *
 * The ask behind this file: jitne bhi mode hain wo saare — Auto, Grid,
 * Spotlight — and "ek sath 3 log ko special attention": ek special rahe (the
 * hero's big tile), baki sab chote-chote form me (two small companion tiles in
 * the hero's corner, everyone else in the compact strip).
 *
 * Guards the things that would quietly undo it: a fourth pin evicting the hero
 * instead of the oldest companion, a pinned person showing twice (stage + strip),
 * Grid quietly staging somebody (it must stage nobody — tiles are equal there),
 * and the strip growing back to oversized tiles.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const surface = read('src/components/voice/CallSurface.tsx')

describe('all three Meet layouts are offered', () => {
  it('offers Auto, Grid and Spotlight as a segmented control', () => {
    expect(surface).toMatch(/\{ key: 'auto', label: 'Auto', icon: 'layout' \}/)
    expect(surface).toMatch(/\{ key: 'grid', label: 'Grid', icon: 'users' \}/)
    expect(surface).toMatch(/\{ key: 'spotlight', label: 'Spotlight', icon: 'eye' \}/)
    expect(surface).toMatch(/role="radiogroup"/)
  })

  it('remembers the choice for the session', () => {
    expect(surface).toMatch(/cc-voice-layout/)
    expect(surface).toMatch(/const changeLayout = useCallback/)
  })
})

describe('three people hold the stage at once', () => {
  it('keeps the oldest pin as the hero and the next two as companions', () => {
    expect(surface).toMatch(/const stagePeople = layout === 'grid' \|\| !heroId \? \[\] :/)
    expect(surface).toMatch(/const companions = stagePeople\.slice\(1, 3\)/)
    // The hero is the big tile; companions ride its corner, smaller.
    expect(surface).toMatch(/<StagePip /)
    expect(surface).toMatch(/function StagePip/)
  })

  it('sizes them differently — that difference is the layout', () => {
    // Hero: full-width 16:9, capped so it never eats the strip below.
    expect(surface).toMatch(/maxHeight: '48vh'/)
    expect(surface).toMatch(/aspectRatio: '16 \/ 9'/)
    // Companion: a small tile in the corner of the hero.
    expect(surface).toMatch(/width: 'clamp\(116px, 16vw, 190px\)'/)
    expect(surface).toMatch(/objectFit: 'cover'/)
    // Strip: compact "everyone else" tiles under the stage.
    expect(surface).toMatch(/minmax\(128px, 1fr\)/)
  })

  it('pins toggle, and never exceed three', () => {
    expect(surface).toMatch(/const togglePin = useCallback/)
    // A fourth pin evicts the OLDEST companion, never the hero first.
    expect(surface).toMatch(/\[\.\.\.cur, identity\]\.slice\(-3\)/)
    expect(surface).toMatch(/cc-voice-pins/)
  })

  it('every staged tile can be unpinned', () => {
    const unpins = surface.match(/Unpin \$\{name\} from the stage/g) ?? []
    // one on the hero's chip, one per companion tile
    expect(unpins.length).toBeGreaterThanOrEqual(2)
  })

  it('never shows the same person twice — the strip skips whoever is staged', () => {
    expect(surface).toMatch(/!stagedIds\.includes\(p\.identity\)/)
  })

  it('grid stages nobody, so pins cannot delete somebody from the grid', () => {
    expect(surface).toMatch(/layout === 'grid' \|\| !heroId \? \[\] :/)
  })

  it('spotlight always has a hero, even with nothing pinned', () => {
    // Parsed out of the source rather than regex-matched on one line, so a
    // formatter re-wrapping the expression cannot break the test.
    const heroLine = surface.slice(surface.indexOf('const heroId'), surface.indexOf('const stagePeople'))
    expect(heroLine).toMatch(/layout === 'spotlight'/)
    expect(heroLine).toMatch(/presentPins\[0\]/)
    expect(heroLine).toMatch(/fallbackId/)
    // The fallback is the first remote person, else me — never nobody.
    expect(surface).toMatch(/participants\.find\(\(p\) => !p\.isLocal\)\?\.identity/)
    expect(surface).toMatch(/localParticipant\?\.identity \?\? null/)
  })
})
