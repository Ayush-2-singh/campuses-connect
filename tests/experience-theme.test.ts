/**
 * EXPERIENCES PALETTE — orange reading section, BLUE primary actions.
 *
 * The section wore both extremes before: a dark-orange button (harsh) and a
 * pale-orange one (washed out in light mode). The final pairing uses the
 * product's two colours: orange for the section accent, blue for every primary
 * button (theme blue in both themes), never an orange button fill.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { accentForPath } from '@/theme/colors'

const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')

/** WCAG relative luminance → contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hex
      .replace('#', '')
      .match(/../g)!
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('experiences section', () => {
  it('stays on the orange/gold accent', () => {
    expect(accentForPath('/experiences')).toBe('gold')
    expect(accentForPath('/experiences/abc')).toBe('gold')
    expect(accentForPath('/blog')).toBe('gold')
  })

  it('pairs the section with a blue primary button', () => {
    expect(css).toContain("[data-experience='1'] .hc-btn--primary.hc-btn--primary")
    expect(contrast('#ffffff', '#2b6ef6')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', '#1a59d8')).toBeGreaterThanOrEqual(4.5)
  })

  it('uses the theme blue for the global CTA, not an orange fill', () => {
    expect(css).toContain('--grad-brand: linear-gradient(135deg, #2b6ef6 0%, #1a59d8 100%)')
    expect(css).not.toContain('#ffe0b0')
    expect(css).not.toContain('#f0740a')
  })

  it('keeps white ink readable on the blue CTA', () => {
    expect(css).toContain('--on-brand: #ffffff')
    expect(contrast('#ffffff', '#2b6ef6')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', '#1a59d8')).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves no brown ink on the brand fill', () => {
    expect(css).not.toContain('#24160a')
  })

  it('gives touch devices a 44px button target', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)/)
    expect(css).toContain('.hc-btn,\n  .ss-btn,\n  .cd-btn,')
  })
})

describe('light theme palette', () => {
  it('matches the reference: off-white canvas, white cards, royal blue accent', () => {
    expect(css).toContain('--bg-page: #f8f9fa')
    expect(css).toContain('--bg-secondary: #f1f3f5')
    expect(css).toContain('--accent: #3b82f6')
    // Dark ink on the accent is what every filled chip/badge uses.
    expect(contrast('#0b1220', '#3b82f6')).toBeGreaterThanOrEqual(4.5)
  })

  it('retires the warm paper surfaces', () => {
    expect(css).not.toContain('#faf9f7')
    expect(css).not.toContain('rgba(60, 48, 30')
  })
})
