/**
 * Applies ALL dated migrations from supabase/migrations that are not yet
 * tracked in supabase_migrations.schema_migrations — in filename order.
 *
 * Why: the hardcoded FILES lists in apply-pending-migrations.mjs and
 * apply-oct-migrations.mjs drifted out of sync with the folder
 * (20260929_voice_private_rooms.sql was skipped in production, breaking
 * voice join with "Could not find the function …(p_group_id, p_password)").
 * This script derives the list from the directory itself, so a new migration
 * file is never forgotten.
 *
 * Contract (same as the other apply-* scripts):
 *   - each file runs in its own transaction (BEGIN … COMMIT)
 *   - the run is recorded in supabase_migrations.schema_migrations
 *   - stops on the first failure and prints the Postgres error
 *
 * Tracking is checked under BOTH version conventions — the old scripts'
 * 8-digit date (e.g. '20260926') and the full filename stem — so files that
 * were already applied by the older scripts are not re-run. New records use
 * the full filename stem as the version, which also fixes same-day filename
 * collisions (two 20260926_* files, for example).
 *
 * Usage:
 *   node scripts/sync-migrations.mjs <SUPABASE_PAT> <PROJECT_REF> [--dry-run]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [pat, ref] = args.filter((a) => !a.startsWith('--'))
if (!pat || !ref) {
  console.error('Usage: node scripts/sync-migrations.mjs <SUPABASE_PAT> <PROJECT_REF> [--dry-run]')
  process.exit(1)
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// Dated migration files only (YYYYMMDD_*). Legacy numbered files (001_*) predate
// migration tracking and are already in every environment; re-running them is
// unsafe (some use bare CREATE TABLE) and unnecessary.
const FILES = readdirSync(migrationsDir)
  .filter((f) => /^\d{8}_.*\.sql$/.test(f))
  .sort()

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`)
  return text
}

async function alreadyTracked(file) {
  const stem = file.replace(/\.sql$/, '')
  const datePrefix = file.match(/^(\d{8})/)[1]
  const escaped = stem.replace(/'/g, "''")
  const out = await runSql(
    `select version from supabase_migrations.schema_migrations where version in ('${datePrefix}', '${escaped}')`
  )
  return JSON.parse(out).length > 0
}

const plan = []
for (const file of FILES) {
  if (await alreadyTracked(file)) continue
  plan.push(file)
}

console.log(`${FILES.length} dated migration files on disk, ${FILES.length - plan.length} already tracked.`)
if (plan.length === 0) {
  console.log('Nothing to apply — production schema is in sync. ✅')
  process.exit(0)
}
console.log(`Pending (${plan.length}):\n  ${plan.join('\n  ')}\n`)
if (dryRun) {
  console.log('Dry run — nothing applied.')
  process.exit(0)
}

let applied = 0
for (const file of plan) {
  const stem = file.replace(/\.sql$/, '')
  const name = stem.replace(/^\d{8}_/, '')
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const wrapped = `BEGIN;\n${sql}\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${stem}', '${name}');\nCOMMIT;`

  process.stdout.write(`apply ${file} ... `)
  try {
    await runSql(wrapped)
    console.log('OK')
    applied++
  } catch (err) {
    console.log('FAILED')
    console.error(String(err.message ?? err).slice(0, 1500))
    console.error(`\nStopped at ${file}. Earlier files are committed.`)
    process.exit(2)
  }
}

console.log(`\nDone — ${applied} migration(s) applied.`)

// ── Verification ──
const checks = [
  {
    label: 'voice private-rooms RPC (2-arg join) exists',
    sql: `select p.proname, pg_get_function_arguments(p.oid) as args,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok
            from pg_proc p where p.proname = 'join_live_voice_chat_group'`,
  },
  {
    label: 'latest tracked migrations',
    sql: `select version, name from supabase_migrations.schema_migrations order by version desc limit 8`,
  },
]

for (const c of checks) {
  try {
    const out = await runSql(c.sql)
    console.log(`\nverify [${c.label}]:\n${out.slice(0, 800)}`)
  } catch (e) {
    console.error(`verify failed [${c.label}]:`, String(e.message ?? e).slice(0, 300))
  }
}
