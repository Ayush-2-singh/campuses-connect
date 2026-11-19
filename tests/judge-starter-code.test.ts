/**
 * The committed contract fixture must match the harness templates, otherwise
 * `scripts/seed-judge-contracts.mjs` would backfill stale stubs into another
 * environment. Regenerate with a one-off vitest run if this fails.
 */
import { describe, expect, it } from 'vitest'
import fixture from '../scripts/judge-starter-code.json'
import { CONTRACTS } from '@/lib/compete/contracts'
import { buildStarter, type JudgeLanguage } from '@/lib/compete/harness'

const LANGUAGES: JudgeLanguage[] = ['python', 'javascript', 'cpp', 'java']

describe('judge starter fixture', () => {
  it('covers exactly the contracted problems', () => {
    expect(Object.keys(fixture).sort()).toEqual(Object.keys(CONTRACTS).sort())
  })

  it('matches the generated stubs and contracts', () => {
    for (const [slug, contract] of Object.entries(CONTRACTS)) {
      const entry = (fixture as Record<string, Record<string, unknown>>)[slug]
      for (const language of LANGUAGES) {
        expect(entry[language], `${slug}/${language}`).toBe(buildStarter(language, contract))
      }
      expect(entry._meta).toEqual(contract)
    }
  })
})
