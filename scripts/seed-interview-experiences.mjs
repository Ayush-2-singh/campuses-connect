/**
 * Import the interview-experience seed leads — SAFELY.
 *
 *   node scripts/seed-interview-experiences.mjs --json ~/Downloads/connecttocampus_interview_seed_50.json
 *   node scripts/seed-interview-experiences.mjs --json <file> --apply
 *   node scripts/seed-interview-experiences.mjs --json <file> --apply --create-companies
 *
 * Default is a DRY RUN: it reads, validates and reports, and writes nothing.
 * `--apply` is the only switch that touches the database, because a production
 * content import is not something a developer should trigger by forgetting a
 * flag.
 *
 * What it writes, per record:
 *   provenance = 'seed', review_status = 'pending_review',
 *   verification_status = 'pending_review',
 *   experience = the source's SHORT summary (never the full article),
 *   source_* = attribution, and `source_url_norm` for de-duplication.
 *
 * Guarantees:
 *   • Idempotent — the unique index on `source_url_norm` plus an existence
 *     check means a second run inserts nothing.
 *   • Never overwrites — rows are only ever INSERTed; a user's write-up with
 *     its own id/status is untouched. (Seeded rows are keyed by source URL,
 *     user content by user id.)
 *   • Never deletes.
 *   • Nothing becomes public: `pending_review` is not readable by visitors
 *     (see the RLS policy in 20261113_interview_experience_sources.sql).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local. The service-role key stays on this machine.
 */
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parseCsvSeed, parseJsonSeed, validateRecord } from './interview-seed-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv() {
  const env = { ...process.env }
  const path = join(root, '.env.local')
  if (!fs.existsSync(path)) return env
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 0 || line.trim().startsWith('#')) continue
    const key = line.slice(0, i).trim()
    if (!env[key]) env[key] = line.slice(i + 1).trim()
  }
  return env
}

const arg = (name, fallback = null) => {
  // Both `--flag=value` and `--flag value` — the second is what people type.
  const prefix = `--${name}=`
  const inline = process.argv.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const at = process.argv.indexOf(`--${name}`)
  const next = at >= 0 ? process.argv[at + 1] : undefined
  return next && !next.startsWith('--') ? next : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const jsonPath = arg('json')
const csvPath = arg('csv')
const apply = flag('apply')
const createCompanies = flag('create-companies')
const limit = Number(arg('limit', '0')) || 0

if (!jsonPath) {
  console.error('Usage: node scripts/seed-interview-experiences.mjs --json <file> [--csv <file>] [--apply]')
  process.exit(1)
}

const records = parseJsonSeed(fs.readFileSync(resolve(jsonPath), 'utf8'))
const csvRecords = csvPath ? parseCsvSeed(fs.readFileSync(resolve(csvPath), 'utf8')) : []

const keyName = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const slugify = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const env = readEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or .env.local).')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  input: { json: records.length, csv: csvRecords.length },
  importable: 0,
  inserted: 0,
  skipped_existing: 0,
  skipped_invalid: 0,
  skipped_unknown_company: 0,
  companies_created: 0,
  failed: 0,
  problems: [],
}

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

const seen = new Set()
/** Distinct company names a dry run WOULD create — not one per record. */
const pendingCompanies = new Set()
let processed = 0

for (const raw of records) {
  if (limit && processed >= limit) break
  const { record, normalizedUrl, issues, blocking } = validateRecord(raw)
  processed += 1

  if (blocking) {
    summary.skipped_invalid += 1
    summary.problems.push({ title: record.source_title, reason: issues.filter((i) => i.blocking).map((i) => i.message) })
    continue
  }
  if (!normalizedUrl || existing.has(normalizedUrl) || seen.has(normalizedUrl)) {
    summary.skipped_existing += 1
    continue
  }
  seen.add(normalizedUrl)
  summary.importable += 1

  const companyKey = keyName(record.company)
  let company = companies.get(companyKey)
  if (!company) {
    if (!createCompanies) {
      summary.skipped_unknown_company += 1
      summary.problems.push({ title: record.source_title, reason: [`No company row named "${record.company}"`] })
      continue
    }
    if (!apply) {
      // Dry run: report what WOULD be created (once per name), create nothing.
      pendingCompanies.add(companyKey)
      summary.companies_created = pendingCompanies.size
      company = { id: null, name: record.company, slug: slugify(record.company) }
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
    // No auth user owns a research lead — the column is nullable after 20261113.
    user_id: null,
    company_id: company.id,
    title: record.source_title,
    // The source's own short summary. The full article stays on the source.
    experience: record.short_summary,
    role: record.role || null,
    source_url: record.source_url,
    source_url_norm: normalizedUrl,
    source_platform: record.source_platform || null,
    source_author: null,
    source_credit: record.source_credit || null,
    source_type: record.source_type || null,
    review_status: 'pending_review',
    verification_status: 'pending_review',
    provenance: 'seed',
    topics: [],
  }

  const { error } = await db.from('interview_experiences').insert(payload)
  if (error) {
    // A unique-index collision means somebody imported it a moment ago — that
    // is a skip, not a failure.
    if (error.code === '23505') {
      summary.skipped_existing += 1
      continue
    }
    summary.failed += 1
    summary.problems.push({ title: record.source_title, reason: [error.message] })
    continue
  }
  summary.inserted += 1
  existing.add(normalizedUrl)
}

console.log(`\ninterview experiences — ${summary.mode}`)
console.log(`  input               ${summary.input.json} JSON / ${summary.input.csv} CSV`)
console.log(`  unique & importable ${summary.importable}`)
console.log(`  inserted            ${summary.inserted}`)
console.log(`  already present     ${summary.skipped_existing}`)
console.log(`  invalid             ${summary.skipped_invalid}`)
console.log(`  unknown company     ${summary.skipped_unknown_company}${createCompanies ? ` (created ${summary.companies_created})` : ''}`)
console.log(`  failed              ${summary.failed}`)
if (!apply) console.log('\nDRY RUN — nothing was written. Re-run with --apply to import.')
if (summary.problems.length) {
  console.log('\nRecords needing attention:')
  for (const p of summary.problems.slice(0, 20)) console.log(`  - ${p.title}: ${p.reason.join('; ')}`)
  if (summary.problems.length > 20) console.log(`  … and ${summary.problems.length - 20} more`)
}
process.exit(summary.failed > 0 ? 1 : 0)
