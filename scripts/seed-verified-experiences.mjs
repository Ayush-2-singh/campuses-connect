/**
 * Import the source-checked interview-experience seed.
 *
 *   node scripts/seed-verified-experiences.mjs --json supabase/seeds/interview-experiences-verified-100.json
 *   node scripts/seed-verified-experiences.mjs --json <file> --apply --create-companies
 *
 * Default is a DRY RUN. `--apply` is the only switch that writes.
 *
 * Unlike the research-lead importer, every record in this dataset has been
 * read back from its platform (LeetCode discuss API / the live GFG or LinkedIn
 * URL) and carries the full set of fields the directory renders: rounds,
 * result, difficulty, rating, tips, salary, topics and the interview date.
 * It therefore writes `review_status = approved`, `verification_status =
 * approved` and `is_verified = true` — the user explicitly asked for verified
 * entries, and the source URL/author/date travel with every row.
 *
 * Guarantees:
 *   • Idempotent — unique source_url_norm + an existence check.
 *   • Insert-only — never updates or deletes an existing row.
 *   • No author account is invented; seeded rows keep `user_id = null`.
 *   • Only the short original summary is stored, never the source article.
 */
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizeSourceUrl } from './interview-seed-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv() {
  const env = { ...process.env }
  const file = join(root, '.env.local')
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 0 || line.trim().startsWith('#')) continue
    const key = line.slice(0, i).trim()
    if (!env[key]) env[key] = line.slice(i + 1).trim()
  }
  return env
}

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`
  const inline = process.argv.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const at = process.argv.indexOf(`--${name}`)
  const next = at >= 0 ? process.argv[at + 1] : undefined
  return next && !next.startsWith('--') ? next : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const jsonPath = arg('json', 'supabase/seeds/interview-experiences-verified-100.json')
const apply = flag('apply')
const createCompanies = flag('create-companies')
const limit = Number(arg('limit', '0')) || 0

const records = JSON.parse(fs.readFileSync(resolve(jsonPath), 'utf8')).records
if (!Array.isArray(records)) throw new Error('Seed must contain a records array')

const env = readEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or .env.local).')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const keyName = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const slugify = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const { data: companyRows, error: companyErr } = await db.from('companies').select('id, name, slug')
if (companyErr) {
  console.error('Could not read companies:', companyErr.message)
  process.exit(1)
}
const companies = new Map((companyRows ?? []).map((c) => [keyName(c.name), c]))

const { data: existingRows, error: existingErr } = await db
  .from('interview_experiences')
  .select('source_url_norm')
  .not('source_url_norm', 'is', null)
if (existingErr) {
  console.error('Could not read existing experiences:', existingErr.message)
  process.exit(1)
}
const existing = new Set((existingRows ?? []).map((r) => r.source_url_norm))

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  input: records.length,
  importable: 0,
  inserted: 0,
  skipped_existing: 0,
  skipped_invalid: 0,
  companies_created: 0,
  failed: 0,
  problems: [],
}
const seen = new Set()
let processed = 0

for (const record of records) {
  if (limit && processed >= limit) break
  processed += 1

  const normalized = normalizeSourceUrl(record.source_url)
  const required = ['source_title', 'company', 'role', 'short_summary', 'source_platform', 'source_url']
  const missing = required.filter((field) => !record[field])
  if (missing.length || !normalized) {
    summary.skipped_invalid += 1
    summary.problems.push({ title: record.source_title || '(untitled)', reason: [`Missing: ${missing.join(', ') || 'valid source URL'}`] })
    continue
  }
  if (existing.has(normalized) || seen.has(normalized)) {
    summary.skipped_existing += 1
    continue
  }
  seen.add(normalized)
  summary.importable += 1

  const companyKey = keyName(record.company)
  let company = companies.get(companyKey)
  if (!company) {
    if (!createCompanies) {
      summary.skipped_invalid += 1
      summary.problems.push({ title: record.source_title, reason: [`No company row named "${record.company}" (pass --create-companies)`] })
      continue
    }
    if (!apply) {
      company = { id: null }
    } else {
      const { data: created, error } = await db
        .from('companies')
        .insert({ name: record.company, slug: slugify(record.company), is_active: true })
        .select('id, name, slug')
        .single()
      if (error) {
        summary.failed += 1
        summary.problems.push({ title: record.source_title, reason: [`Company insert failed: ${error.message}`] })
        continue
      }
      company = created
      companies.set(companyKey, created)
      summary.companies_created += 1
    }
  }

  if (!apply) continue

  const payload = {
    user_id: null,
    company_id: company.id,
    title: record.source_title,
    experience: record.short_summary,
    role: record.role,
    round_count: record.round_count ?? null,
    result: record.result ?? 'pending',
    difficulty: record.difficulty ?? null,
    rating: record.rating ?? null,
    tips: record.tips ?? null,
    offer_salary: record.offer_salary ?? null,
    source_url: record.source_url,
    source_url_norm: normalized,
    source_platform: record.source_platform,
    source_author: record.source_author ?? null,
    source_credit: record.source_credit ?? null,
    source_type: record.source_type ?? null,
    source_last_checked_at: new Date().toISOString(),
    experience_date: record.experience_date ?? null,
    topics: Array.isArray(record.topics) ? record.topics : [],
    review_status: 'approved',
    verification_status: 'approved',
    is_verified: true,
    provenance: 'seed',
  }

  const { error } = await db.from('interview_experiences').insert(payload)
  if (error) {
    if (error.code === '23505') {
      summary.skipped_existing += 1
      continue
    }
    summary.failed += 1
    summary.problems.push({ title: record.source_title, reason: [error.message] })
    continue
  }
  summary.inserted += 1
  existing.add(normalized)
}

console.log(`\nverified interview seed — ${summary.mode}`)
console.log(`  input                ${summary.input}`)
console.log(`  unique & importable  ${summary.importable}`)
console.log(`  inserted             ${summary.inserted}`)
console.log(`  already present      ${summary.skipped_existing}`)
console.log(`  invalid              ${summary.skipped_invalid}`)
console.log(`  companies created    ${summary.companies_created}`)
console.log(`  failed               ${summary.failed}`)
if (!apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply to import.')
if (summary.problems.length) {
  console.log('\nRecords needing attention:')
  for (const p of summary.problems.slice(0, 20)) console.log(`  - ${p.title}: ${p.reason.join('; ')}`)
}
process.exit(summary.failed > 0 ? 1 : 0)
