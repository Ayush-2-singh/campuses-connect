/**
 * EXPERIENCES PALETTE — the reading section is orange, and its primary buttons
 * are LIGHT orange with near-black ink.
 *
 * The first attempt moved the section to the blue brand accent. It read as a
 * different product on a page that is supposed to feel warm, so the section is
 * back on the gold/orange accent. What stays from that pass is the contrast
 * discipline: the old #f0740a button stop was a harsh dark-orange slab, and the
 * light fill must keep WCAG AA ink in both themes.
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

describe('experiences section accent', () => {
  it('is orange again, not the blue brand accent', () => {
    expect(accentForPath('/experiences')).toBe('gold')
    expect(accentForPath('/experiences/abc')).toBe('gold')
    expect(accentForPath('/blog')).toBe('gold')
  })

  it('does not paint the section primary button blue', () => {
    expect(css).not.toContain("[data-accent='blue'] .hc-btn--primary")
    expect(css).not.toContain('--accent-warm')
  })

  it('uses a light-orange brand gradient, not the dark #f0740a stop', () => {
    expect(css).toContain('--grad-brand: linear-gradient(135deg, #ffe0b0 0%, #ffc978 48%, #ffb45e 100%)')
    expect(css).not.toContain('#f0740a')
  })

  it('keeps dark ink readable on every stop of the light fill', () => {
    // --on-accent in both themes
    expect(contrast('#0b1220', '#ffe0b0')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#0b1220', '#ffc978')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#0b1220', '#ffb45e')).toBeGreaterThanOrEqual(4.5)
  })

  it('gives touch devices a 44px button target', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)/)
    expect(css).toContain('.hc-btn,\n  .ss-btn,\n  .cd-btn,')
  })
})
