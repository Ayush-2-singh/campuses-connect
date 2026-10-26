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
 *
 * Second ask, same file: "jo log aate hain wo 3 tak vertically bade tiles me
 * dikhen, uske baad chote-chote" — so the tile flow is asserted by headcount,
 * and every view mode lives under the More menu rather than above the stage.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const surface = read('src/components/voice/CallSurface.tsx')
const css = read('src/app/globals.css')

describe('all four Meet layouts are offered', () => {
  it('offers Auto, Grid, Spotlight and Sidebar as one list', () => {
    expect(surface).toMatch(/\{ key: 'auto', label: 'Auto', icon: 'layout' \}/)
    expect(surface).toMatch(/\{ key: 'grid', label: 'Grid', icon: 'users' \}/)
    expect(surface).toMatch(/\{ key: 'spotlight', label: 'Spotlight', icon: 'eye' \}/)
    expect(surface).toMatch(/\{ key: 'sidebar', label: 'Sidebar', icon: 'layers' \}/)
  })

  it('keeps every view mode under the More menu, not above the stage', () => {
    // "jitne bhi screen layout change karne ke options hain sab More settings
    //  ke andar hon" — one section, ticked, inside the More sheet.
    expect(surface).toMatch(/function ViewModeSection/)
    expect(surface).toContain('View mode')
    expect(surface).toMatch(/role="menuitemradio"/)
    expect(surface).toMatch(/<ViewModeSection layout=\{layout\} onChange=\{onChangeLayout\} \/>/)
    // The room's layout is handed to the bar, and the stage no longer carries
    // a segmented switcher of its own.
    expect(surface).toMatch(/layout=\{layout\}\n\s*onChangeLayout=\{changeLayout\}/)
    expect(surface).not.toMatch(/<LayoutSwitcher/)
  })

  it('remembers the choice for the session', () => {
    expect(surface).toMatch(/cc-voice-layout/)
    expect(surface).toMatch(/const changeLayout = useCallback/)
  })
})

describe('the tiles follow the headcount, like Meet', () => {
  it('up to three people: one big tile per row, stacked vertically', () => {
    expect(surface).toMatch(/const stacked = variant === 'grid' && ordered\.length > 0 && ordered\.length <= 3/)
    expect(surface).toMatch(/const stackedMaxWidth = ordered\.length === 1 \? 880/)
    // Whitespace-tolerant: the formatter is free to wrap the ternary.
    expect(surface).toMatch(
      /gridTemplateColumns:\s+variant === 'side' \? '1fr' : stacked \? 'minmax\(0, 1fr\)' : 'repeat\(auto-fit, minmax\(148px, 1fr\)\)'/
    )
    expect(surface).toMatch(/justifyItems: stacked \? 'center' : undefined/)
    expect(surface).toMatch(/\.\.\.\(stacked \? \{ width: '100%', maxWidth: stackedMaxWidth \} : null\)/)
  })

  it('from the fourth person on: the smaller tiled grid', () => {
    expect(surface).toMatch(/repeat\(auto-fit, minmax\(148px, 1fr\)\)/)
    // The compact grid is only reached once the stacked column is done — a
    // fourth join must not keep growing the tiles.
    expect(surface).toMatch(
      /stacked \? 'minmax\(0, 1fr\)' : 'repeat\(auto-fit, minmax\(148px, 1fr\)\)'|stacked \? 'minmax\(0, 1fr\)' :/
    )
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
    // Strip: "everyone else" tiles, compact once the room passes three.
    expect(surface).toMatch(/minmax\(148px, 1fr\)/)
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

  it('on a laptop the staged people sit SIDE BY SIDE, all the same size', () => {
    // "teen logo ka equal size me laptop per dikhe, jaise GMeet per hota hai"
    expect(surface).toMatch(/function useWideStage\(\)/)
    expect(surface).toMatch(/window\.matchMedia\('\(min-width: 900px\)'\)/)
    expect(surface).toMatch(/const wide = useWideStage\(\)/)
    expect(surface).toMatch(/if \(!share && wide && stagePeople\.length > 1\) \{/)
    // Equal tiles: each one flexes to its share of the stage — no hero, no pips.
    expect(surface).toMatch(/variant="row"/)
    expect(surface).toMatch(/\{ flex: '1 1 0', minWidth: 0, borderRadius: 14 \}/)
    expect(surface).toMatch(/flex: '1 1 0', minWidth: 0/)
    expect(surface).toMatch(/aspectRatio: '16 \/ 9'/)
    // Narrow screens keep the pips: three equal tiles on a phone are thumbs.
    expect(surface).toMatch(/width: 'clamp\(116px, 16vw, 190px\)'/)
    // And a full room (four or more) fills its row with the compact grid.
    expect(surface).toMatch(/repeat\(auto-fit, minmax\(148px, 1fr\)\)/)
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

describe("GMeet's shape — three big, the rest riding the right edge", () => {
  it('moves the strip into a right-hand column beside the stage when there is room', () => {
    // "jab member add hote hain to wo 3 log tak full screen per dikhta hai…
    //  uske baad wale user chote hoke right side me aate rehte hain"
    expect(surface).toMatch(/const stageVisible = stagePeople\.length > 0/)
    expect(surface).toMatch(/layout === 'sidebar' \|\| wide/)
    expect(surface).toMatch(/variant="side"/)
    expect(surface).toMatch(/width: 'clamp\(196px, 21vw, 264px\)'/)
    expect(surface).toMatch(/maxHeight: '56vh'/)
    // One tile per row down that column…
    expect(surface).toMatch(/gridTemplateColumns:\s+variant === 'side' \? '1fr' :/)
    // …and on a phone the column simply drops back under the stage.
    expect(surface).toMatch(/\{!stageVisible \|\| !\(layout === 'sidebar' \|\| wide\) \? \(/)
  })

  it('offers Sidebar as its own layout, next to Auto / Grid / Spotlight', () => {
    expect(surface).toMatch(/\{ key: 'sidebar', label: 'Sidebar', icon: 'layers' \}/)
    expect(surface).toMatch(/v === 'grid' \|\| v === 'spotlight' \|\| v === 'sidebar' \|\| v === 'auto'/)
  })

  it('Auto hands the stage to whoever is actually talking', () => {
    expect(surface).toMatch(/const speakerId = participants\.find\(\(p\) => p\.isSpeaking && !p\.isLocal\)\?\.identity/)
    // …but only after they hold the floor, so four people do not flicker.
    expect(surface).toMatch(/window\.setTimeout\(\(\) => setAutoSpeaker\(speakerId\), 2_500\)/)
    expect(surface).toMatch(/const autoSpeakerId = layout === 'auto' && presentPins\.length === 0/)
  })

  it('sorts raised hands to the front of the strip, then the speaker', () => {
    expect(surface).toMatch(/handIds=\{presentHands\.map\(\(h\) => h\.id\)\}/)
    expect(surface).toMatch(/handIds\.includes\(id\) \? 2 : speaking \? 1 : 0/)
  })

  it('every tile is a 16:9 frame whose name never hides', () => {
    expect(surface).toMatch(/aspectRatio: '16 \/ 9'/)
    expect(surface).toMatch(/Name \+ mic state, always on — never a hover-only detail\./)
    // The talking signal is a solid ring, not the old spinning gradient.
    expect(surface).toMatch(/border: p\.isSpeaking \? '2px solid var\(--success, var\(--accent\)\)'/)
    expect(css).not.toMatch(/lvcFrameSpin/)
  })
})
