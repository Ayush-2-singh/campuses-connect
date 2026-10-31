/**
 * VERIFIED INTERVIEW SEED — 100 source-backed rows.
 *
 * The dataset is imported as approved + verified, so the failure modes that
 * matter are incomplete rows, duplicated sources, and an importer that writes
 * unverified content by default.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const dataset = JSON.parse(read('supabase/seeds/interview-experiences-verified-100.json')).records as Array<
  Record<string, any>
>
const importer = read('scripts/seed-verified-experiences.mjs')

describe('the verified dataset is complete', () => {
  it('contains exactly 100 records', () => {
    expect(dataset).toHaveLength(100)
  })

  it('fills every field the directory renders', () => {
    for (const record of dataset) {
      for (const field of [
        'source_title',
        'company',
        'role',
        'short_summary',
        'source_platform',
        'source_url',
        'source_type',
        'publication_date',
        'source_credit',
        'experience_date',
        'round_count',
        'result',
        'difficulty',
        'rating',
        'tips',
        'offer_salary',
      ]) {
        expect(record[field], `${record.source_url} is missing ${field}`).toBeTruthy()
      }
      expect(record.topics.length, `${record.source_url} has no topics`).toBeGreaterThan(0)
    }
  })

  it('has no duplicate source URLs', () => {
    expect(new Set(dataset.map((r) => r.source_url)).size).toBe(dataset.length)
  })

  it('covers LeetCode, GeeksforGeeks and LinkedIn', () => {
    const platforms = new Set(dataset.map((r) => r.source_platform))
    expect(platforms).toContain('LeetCode Discuss')
    expect(platforms).toContain('GeeksforGeeks')
    expect(platforms).toContain('LinkedIn')
  })

  it('keeps every date on a real calendar day', () => {
    for (const record of dataset) {
      expect(record.experience_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const time = new Date(`${record.experience_date}T00:00:00Z`).getTime()
      expect(Number.isFinite(time)).toBe(true)
      expect(record.experience_date >= '2018-01-01').toBe(true)
      expect(record.experience_date <= '2026-12-31').toBe(true)
    }
  })
})

describe('the importer publishes only source-checked rows', () => {
  it('writes approved + verified + is_verified', () => {
    expect(importer).toMatch(/review_status: 'approved'/)
    expect(importer).toMatch(/verification_status: 'approved'/)
    expect(importer).toMatch(/is_verified: true/)
    expect(importer).toMatch(/source_last_checked_at/)
  })

  it('is a dry run unless --apply is passed', () => {
    expect(importer).toMatch(/const apply = flag\('apply'\)/)
    expect(importer).toMatch(/if \(!apply\) continue/)
    expect(importer).toMatch(/DRY RUN — nothing was written/)
  })

  it('never updates or deletes an existing write-up', () => {
    expect(importer).not.toMatch(/\.update\(/)
    expect(importer).not.toMatch(/\.delete\(\)/)
  })

  it('skips a source it has already imported', () => {
    expect(importer).toMatch(/existing\.has\(normalized\)/)
    expect(importer).toMatch(/error\.code === '23505'/)
  })
})
