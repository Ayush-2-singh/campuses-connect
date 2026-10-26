/**
 * INTERVIEW SEED PIPELINE — parsing, de-duplication, and the promises the
 * importer makes.
 *
 * The dataset is a list of research leads, so the failure modes that matter are
 * not "did it import" but "did it import the same post twice", "did it quietly
 * publish something nobody reviewed", "did it overwrite a student's write-up",
 * and "did a blocked source get recorded as fake". Each one is pinned below.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildReport,
  normalizeSourceUrl,
  parseCsvSeed,
  parseJsonSeed,
  validateRecord,
} from '../scripts/interview-seed-lib.mjs'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const RECORD = {
  source_title: 'Amazon SDE-1 Interview Experience — 2026',
  company: 'Amazon',
  role: 'SDE-1',
  short_summary: 'OA, three technical rounds, leadership principles.',
  source_platform: 'LeetCode Discuss',
  source_url: 'https://leetcode.com/discuss/post/8546875/amazon-sde-1-interview-experience-2026-b-30gn/',
  source_type: 'Community-reported; not independently verified',
  publication_date: 'See original source',
  source_credit: 'Original author/creator as shown on source page',
  content_storage_policy: 'Store metadata + short original summary + source URL only',
  review_status: 'Pending human review',
}

describe('the two files parse the same way', () => {
  it('reads the JSON export', () => {
    const rows = parseJsonSeed(JSON.stringify([RECORD]))
    expect(rows).toHaveLength(1)
    expect(rows[0].company).toBe('Amazon')
    expect(rows[0].short_summary).toMatch(/leadership/)
  })

  it('rejects a JSON file that is not a list — an empty import is not success', () => {
    expect(() => parseJsonSeed('{"oops": true}')).toThrow(/not an array/i)
  })

  it('reads CSV quoting, embedded commas and a BOM', () => {
    const csv = `\uFEFFsource_title,company,role,short_summary,source_platform,source_url
"Amazon, SDE-1",Amazon,SDE-1,"OA, three rounds, ""LP"" round",LeetCode Discuss,https://leetcode.com/discuss/post/1/
`
    const [row] = parseCsvSeed(csv)
    expect(row.source_title).toBe('Amazon, SDE-1')
    expect(row.short_summary).toBe('OA, three rounds, "LP" round')
    expect(row.company).toBe('Amazon')
  })

  it('both exports describe the same record field for field', () => {
    const csv = `source_title,company,role,short_summary,source_platform,source_url,source_type,publication_date,source_credit,content_storage_policy,review_status
"${RECORD.source_title}","${RECORD.company}","${RECORD.role}","${RECORD.short_summary}","${RECORD.source_platform}","${RECORD.source_url}","${RECORD.source_type}","${RECORD.publication_date}","${RECORD.source_credit}","${RECORD.content_storage_policy}","${RECORD.review_status}"
`
    expect(parseCsvSeed(csv)).toEqual(parseJsonSeed(JSON.stringify([RECORD])))
  })
})

describe('one post, however its URL is written', () => {
  it('folds host case, www, trailing slash, fragment and tracking params', () => {
    const variants = [
      'https://www.leetcode.com/discuss/post/8546875/amazon-sde-1-interview-experience-2026-b-30gn/?utm_source=share',
      'HTTP://LEETCODE.COM/discuss/post/8546875/amazon-sde-1-interview-experience-2026-b-30gn#top',
      'https://leetcode.com/discuss/post/8546875/',
    ]
    const normalized = variants.map(normalizeSourceUrl)
    expect(new Set(normalized).size).toBe(1)
    expect(normalized[0]).toBe('https://leetcode.com/discuss/post/8546875')
  })

  it('treats the two LeetCode path shapes for one post id as the same post', () => {
    expect(normalizeSourceUrl('https://leetcode.com/discuss/interview-experience/5867781')).toBe(
      'https://leetcode.com/discuss/post/5867781'
    )
    expect(normalizeSourceUrl('https://leetcode.com/discuss/post/5867781/atlassian-p40-by-anonymous_user-22k2/')).toBe(
      'https://leetcode.com/discuss/post/5867781'
    )
  })

  it('leaves other hosts alone beyond the common normalisations', () => {
    expect(normalizeSourceUrl('https://www.geeksforgeeks.org/interview-experiences/x/?utm_medium=social')).toBe(
      'https://geeksforgeeks.org/interview-experiences/x'
    )
  })

  it('refuses anything that is not http(s)', () => {
    for (const bad of ['', 'not a url', 'javascript:alert(1)', 'file:///etc/passwd', null]) {
      expect(normalizeSourceUrl(bad)).toBeNull()
    }
  })
})

describe('validation separates "cannot store" from "needs a human"', () => {
  it('accepts a complete lead, still as pending review', () => {
    const result = validateRecord(RECORD)
    expect(result.blocking).toBe(false)
    expect(result.normalizedUrl).toBe('https://leetcode.com/discuss/post/8546875')
    // Nothing is ever auto-approved, and no date is invented.
    expect(result.issues.map((i: { code: string }) => i.code)).toContain('unknown_date')
  })

  it('blocks a lead with no company, role, title, summary or usable URL', () => {
    const result = validateRecord({
      ...RECORD,
      company: 'Company not specified',
      role: '',
      short_summary: '',
      source_url: 'ftp://example.com/post',
    })
    const codes = result.issues.filter((i: { blocking: boolean }) => i.blocking).map((i: { code: string }) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['unknown_company', 'missing_role', 'empty_summary', 'invalid_url']))
    expect(result.blocking).toBe(true)
  })

  it('does not call a generic credit line a missing source', () => {
    const result = validateRecord(RECORD)
    const codes = result.issues.map((i: { code: string }) => i.code)
    expect(codes).toContain('generic_credit')
    expect(codes).not.toContain('missing_url')
  })
})

describe('the report answers the questions a reviewer actually asks', () => {
  const duplicate = {
    ...RECORD,
    source_title: 'Atlassian P40 — second copy',
    company: 'Atlassian',
    source_url: 'https://leetcode.com/discuss/interview-experience/5867781',
  }
  const report = buildReport(
    [RECORD, duplicate, { ...RECORD, source_title: 'No company lead', company: 'Company not specified' }],
    [RECORD]
  )

  it('collapses a duplicate and counts what it folded', () => {
    expect(report.totals.duplicate_url_groups).toBe(1)
    expect(report.totals.records_in_duplicate_groups).toBe(2)
  })

  it('recommends importing only the valid unique records', () => {
    expect(report.totals.json_records).toBe(3)
    // The Amazon lead and its un-named-company twin are one post, so they fold
    // into each other; only the Atlassian lead survives as importable.
    expect(report.recommended_import_count).toBe(1)
    expect(report.missing.company).toBe(1)
  })

  it('lists every importable record as needing a human, and claims no verification', () => {
    expect(Array.isArray(report.sources_requiring_manual_verification)).toBe(true)
    // No URL was checked for this report, so it must not imply one was.
    expect('url_checks' in report).toBe(false)
    expect('url_check_note' in report).toBe(false)
  })
})

describe('the importer keeps its promises', () => {
  const script = read('scripts/seed-interview-experiences.mjs')

  it('writes nothing unless --apply is passed', () => {
    expect(script).toMatch(/const apply = flag\('apply'\)/)
    expect(script).toMatch(/if \(!apply\) continue/)
    expect(script).toMatch(/DRY RUN — nothing was written/)
  })

  it('never deletes, and never updates an existing row', () => {
    expect(script).not.toMatch(/\.delete\(\)/)
    expect(script).not.toMatch(/\.update\(/)
  })

  it('skips a record it has already imported, using the normalised URL', () => {
    expect(script).toMatch(/existing\.has\(normalizedUrl\)/)
    expect(script).toMatch(/source_url_norm/)
    expect(script).toMatch(/error\.code === '23505'/)
  })

  it('imports as pending review, with provenance, and with no fake author', () => {
    expect(script).toMatch(/review_status: 'pending_review'/)
    expect(script).toMatch(/verification_status: 'pending_review'/)
    expect(script).toMatch(/provenance: 'seed'/)
    expect(script).toMatch(/user_id: null/)
    // The short summary only — never a full article body.
    expect(script).toMatch(/experience: record\.short_summary/)
  })
})

describe('the migration makes that safe at the database level', () => {
  const migration = read('supabase/migrations/20261113_interview_experience_sources.sql')

  it('allows a seeded row to have no author, and records where it came from', () => {
    expect(migration).toMatch(/ALTER COLUMN user_id DROP NOT NULL/)
    for (const column of [
      'source_url',
      'source_url_norm',
      'source_platform',
      'source_author',
      'source_credit',
      'review_status',
      'verification_status',
      'provenance',
      'experience_date',
    ]) {
      expect(migration, `${column} is missing`).toContain(column)
    }
  })

  it('refuses a second copy of one source', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_interview_exp_source/)
    expect(migration).toMatch(/WHERE source_url_norm IS NOT NULL/)
  })

  it('shows visitors only approved rows', () => {
    expect(migration).toMatch(/CREATE POLICY interview_exp_public_read[\s\S]*?USING \(review_status = 'approved'\)/)
  })

  it('stops a client from inserting a seed row or approving its own submission', () => {
    expect(migration).toMatch(/auth\.uid\(\) = user_id AND provenance = 'user'/)
  })
})
