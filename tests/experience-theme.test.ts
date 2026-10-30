/**
 * EXPERIENCES PALETTE — the reading section wears the product blue, with a
 * deep-orange counterpoint instead of the old warm gradient button.
 *
 * These assertions protect the two things that are easy to regress:
 *   1. `/experiences` (and its /blog subsection) resolves to the blue accent;
 *   2. the blue primary button and the warm marks keep WCAG AA contrast in
 *      both themes.
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
  it('uses the blue brand accent, including the blog subsection', () => {
    expect(accentForPath('/experiences')).toBe('blue')
    expect(accentForPath('/experiences/abc')).toBe('blue')
    expect(accentForPath('/blog')).toBe('blue')
    expect(accentForPath('/blog/an-interview')).toBe('blue')
  })

  it('declares the deep-orange counterpoint for the blue section', () => {
    expect(css).toContain('--accent-warm: #c2410c')
    expect(css).toContain('--accent-warm-text: #fb923c')
    expect(css).toContain("[data-theme='light'] [data-accent='blue']")
    expect(css).toContain('.hc-note--warm')
    expect(css).toContain('.hc-eyebrow--warm')
  })

  it('paints the section buttons blue with accessible white ink', () => {
    expect(css).toContain("[data-accent='blue'] .hc-btn--primary.hc-btn--primary")
    expect(contrast('#ffffff', '#2563eb')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', '#1d4ed8')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the warm marks readable on both themes', () => {
    // dark theme card / light theme page
    expect(contrast('#fb923c', '#12161e')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#b03a05', '#faf9f7')).toBeGreaterThanOrEqual(4.5)
  })
})
