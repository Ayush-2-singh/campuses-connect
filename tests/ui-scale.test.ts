/**
 * Global UI scale guard (walks src/ — uncommitted files included).
 *
 * Every size in this app is authored in px, so the "zoom in" feel for every
 * page, desktop and mobile, comes from ONE root-level rule:
 * `html { zoom: var(--ui-scale) }` in globals.css §7.
 *
 * The trap that rule introduces: `zoom` multiplies viewport units, so a raw
 * `100vh` renders `zoom × viewport` tall (phantom scrollbar) and a raw `100vw`
 * box overflows sideways (content cut off). App code must therefore ask for a
 * viewport height/width through the zoom-corrected `--app-vh / --app-dvh /
 * --app-vw` tokens instead — that is what keeps the bigger read from costing
 * any visible content area.
 *
 * Failure mode this guards against: a new page (or a refactor) reintroducing
 * `minHeight: '100vh'` and quietly shipping a scrollbar/overflow on that route
 * only — the kind of thing nobody notices until it is everywhere.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../src')
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'build', 'dist', '.turbo', 'android', 'ios'])
const EXTENSIONS = new Set(['.ts', '.tsx', '.css'])

/**
 * Files allowed to spell out raw viewport units. Both are about the scale
 * plumbing itself, never a page layout.
 */
const ALLOWED: { file: string; why: string }[] = [
  { file: 'app/globals.css', why: 'defines the zoom-compensating --app-* tokens' },
  { file: 'hooks/useMobile.ts', why: 'comment recording the historical mobile 100vh problem' },
]

const RAW_VIEWPORT_UNIT = /\b100(?:dvh|dvw|svh|svw|lvh|lvw|vh|vw)\b/g

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (EXTENSIONS.has(path.extname(entry.name))) found.push(full)
  }
  return found
}

const css = () => fs.readFileSync(path.join(SRC, 'app', 'globals.css'), 'utf8')

describe('global UI scale', () => {
  it('scales the root element from one tunable variable', () => {
    const source = css()
    expect(source, '--ui-scale must exist').toContain('--ui-scale')
    expect(source, 'the root element must carry the scale').toMatch(/zoom:\s*var\(--ui-scale\)/)
  })

  it('keeps desktop closer than mobile, and mobile above 1 so it reads bigger', () => {
    const source = css()
    // `[\s\S]{0,300}?` skips the block's comments/whitespace before the value.
    const tier = (query: string) => {
      const escaped = query.replace(/[()]/g, (c) => `\\${c}`)
      return source.match(new RegExp(`@media ${escaped} \\{[\\s\\S]{0,300}?--ui-scale:\\s*([\\d.]+)`))?.[1]
    }
    const desktop = tier('(min-width: 1024px)')
    const wide = tier('(min-width: 1440px)')
    const mobile = tier('(max-width: 768px)')
    expect(desktop, 'desktop tier missing').toBeTruthy()
    expect(wide, 'wide-desktop tier missing').toBeTruthy()
    expect(mobile, 'mobile tier missing').toBeTruthy()
    expect(Number(desktop)).toBeGreaterThan(1)
    expect(Number(mobile)).toBeGreaterThan(1)
    // Mobile has far less width to give — never scale it as hard as desktop.
    expect(Number(mobile)).toBeLessThan(Number(desktop))
    // Phones must keep ~their full width: above ~5% the mobile topbar row no
    // longer fits on one line and every phone page loses its brand.
    expect(Number(mobile)).toBeLessThanOrEqual(1.05)
  })

  it('keeps the mobile topbar on ONE row (controls never drop to a second line)', () => {
    // The bar holds logo + brand + 4 controls; at 17px wordmark, 5 controls and
    // 1.06 scale it needed ~398px, so `flex-wrap: wrap` pushed the controls
    // under the brand on every 390–430px phone — a header that reads as broken.
    // The row is now nowrap with the brand absorbing the shrink (ellipsis).
    const layout = fs.readFileSync(path.join(SRC, 'components', 'Layout.tsx'), 'utf8')
    const mobileBar = layout.slice(layout.indexOf('className="mobile-topbar"'))
    expect(mobileBar, 'the mobile row must not wrap').toContain("flexWrap: 'nowrap'")
    expect(mobileBar, 'the brand must absorb the shrink').toContain("flex: '1 1 auto'")
    // The decorative logo badge (the brand logo is already on the left) is what
    // cost the row 42px; it stays hidden on phones.
    expect(css()).toMatch(/\.mobile-hide-logo \{\s*display: none;/)
    expect(mobileBar).toContain('mobile-hide-logo')
  })

  it('exposes zoom-corrected viewport tokens for pages to use', () => {
    const source = css()
    expect(source).toMatch(/--app-vh:\s*calc\(100vh \/ var\(--ui-scale\)\)/)
    expect(source).toMatch(/--app-dvh:\s*calc\(100dvh \/ var\(--ui-scale\)\)/)
    expect(source).toMatch(/--app-vw:\s*calc\(100vw \/ var\(--ui-scale\)\)/)
  })

  it('no page, component or style uses a raw viewport unit (it double-scales under zoom)', () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/')
      if (ALLOWED.some((a) => a.file === rel)) continue
      const hits = fs.readFileSync(file, 'utf8').match(RAW_VIEWPORT_UNIT)
      if (hits) offenders.push(`${rel} → ${[...new Set(hits)].join(', ')}`)
    }

    expect(
      offenders,
      `Raw viewport units double-scale under the global UI zoom (sideways overflow or a phantom scrollbar). Use var(--app-vh) / var(--app-dvh) / var(--app-vw):\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
