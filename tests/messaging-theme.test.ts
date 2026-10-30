import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { accentForPath } from '@/theme/colors'

const chat = fs.readFileSync(path.join(process.cwd(), 'src/app/messages/[id]/page.tsx'), 'utf8')

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

describe('messages section', () => {
  it('wears the blue brand accent', () => {
    expect(accentForPath('/messages')).toBe('blue')
    expect(accentForPath('/messages/conv-1')).toBe('blue')
  })

  it('uses an iMessage-style blue with readable white text', () => {
    expect(chat).toContain("const APPLE_BLUE = '#0a6ee0'")
    expect(contrast('#ffffff', '#0a6ee0')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the chat shell set in the system font', () => {
    expect(chat).toContain('-apple-system')
    expect(chat).toContain('SF Pro Text')
  })
})
