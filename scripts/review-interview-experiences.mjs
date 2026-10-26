/**
 * Review the interview directory — the human half of the moderation gate.
 *
 *   node scripts/review-interview-experiences.mjs --list
 *   node scripts/review-interview-experiences.mjs --list --status pending_review
 *   node scripts/review-interview-experiences.mjs --approve <id>
 *   node scripts/review-interview-experiences.mjs --reject  <id>
 *
 * Nothing here decides that a write-up is TRUE. `approve` only says "this may
 * be shown in the public directory" — it is the switch that moves a row out of
 * `pending_review`, which is the state every seeded research lead lands in.
 *
 * Rules this file keeps:
 *   • One row at a time. There is no `--approve-all`, because bulk-approving a
 *     list nobody read is exactly how unverified content becomes public.
 *   • `verification_status` is left alone: approving for publication is not the
 *     same claim as "the source was checked and matches".
 *   • Rejecting never deletes; the row stays for the audit trail.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local.
 */
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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
  const prefix = `--${name}=`
  const inline = process.argv.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const at = process.argv.indexOf(`--${name}`)
  const next = at >= 0 ? process.argv[at + 1] : undefined
  return next && !next.startsWith('--') ? next : fallback
}
const env = readEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or .env.local).')
  process.exit(1)
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const approveId = arg('approve')
const rejectId = arg('reject')
const statusFilter = arg('status', 'pending_review')

if (!approveId && !rejectId) {
  const { data, error } = await db
    .from('interview_experiences')
    .select('id, title, role, review_status, provenance, source_url, companies(name)')
    .eq('review_status', statusFilter)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('Could not read experiences:', error.message)
    process.exit(1)
  }
  const rows = data ?? []
  console.log(`${rows.length} row(s) with review_status = ${statusFilter}`)
  for (const row of rows) {
    const company = Array.isArray(row.companies) ? row.companies[0]?.name : row.companies?.name
    console.log(`  ${row.id}  ${row.provenance.padEnd(4)}  ${String(company ?? '—').padEnd(18)}  ${row.title}`)
    if (row.source_url) console.log(`             source: ${row.source_url}`)
  }
  if (!rows.length && statusFilter === 'pending_review') {
    console.log('Nothing waiting. Seeded leads stay hidden until one is approved by id.')
  }
  process.exit(0)
}

const id = approveId ?? rejectId
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  console.error('Pass one row id (UUID). Bulk review is deliberately not supported.')
  process.exit(1)
}

const next = approveId ? 'approved' : 'rejected'
// Only `review_status` moves. Whatever the source check found stays on record.
const { data, error } = await db
  .from('interview_experiences')
  .update({ review_status: next })
  .eq('id', id)
  .select('id, title, review_status, provenance')
  .maybeSingle()

if (error) {
  console.error('Update failed:', error.message)
  process.exit(1)
}
if (!data) {
  console.error('No row with that id.')
  process.exit(1)
}
console.log(`${data.title} → ${data.review_status} (${data.provenance})`)
if (next === 'approved') {
  console.log('Public now: /experiences and /companies/<slug> revalidate within 10 minutes.')
}
