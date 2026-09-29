/**
 * Applies ONLY the pending migrations the app needs right now:
 *   20261027_discovery_interest_note.sql  (discovery interest pitch)
 *   20261028_note_uid.sql                 (Library note UIDs - CC-NOTE-XXXX)
 *   20261029_user_groups.sql              (user groups - CC-GRP-XXXX)
 *
 * Same contract as scripts/apply-pending-migrations.mjs: each file runs in
 * its own transaction, is recorded in supabase_migrations.schema_migrations,
 * stops on first failure, then verifies.
 *
 * Usage: node scripts/apply-oct-migrations.mjs <SUPABASE_PAT> <PROJECT_REF>
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [pat, ref] = process.argv.slice(2)
if (!pat || !ref) {
  console.error('Usage: node scripts/apply-oct-migrations.mjs <SUPABASE_PAT> <PROJECT_REF>')
  process.exit(1)
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const FILES = [
  '20261027_discovery_interest_note.sql',
  '20261028_note_uid.sql',
  '20261029_user_groups.sql',
]

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

async function tracked(version) {
  const out = await runSql(`select version from supabase_migrations.schema_migrations where version = '${version}'`)
  return JSON.parse(out).length > 0
}

let applied = 0
for (const file of FILES) {
  const version = file.match(/^(\d{8})/)?.[1] ?? file.replace('.sql', '')
  const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '')

  if (await tracked(version)) {
    console.log(`skip  ${file} (already tracked)`)
    continue
  }

  const sql = readFileSync(join(dir, file), 'utf8')
  const wrapped = `BEGIN;\n${sql}\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${name}');\nCOMMIT;`

  process.stdout.write(`apply ${file} ... `)
  try {
    await runSql(wrapped)
    console.log('OK')
    applied++
  } catch (err) {
    console.log('FAILED')
    console.error(String(err.message ?? err).slice(0, 1500))
    console.error(`\nStopped at ${file}. Earlier migrations are committed.`)
    process.exit(2)
  }
}

console.log(`\nDone — ${applied} migration(s) applied.`)

// ── Verification ──
const checks = [
  {
    label: 'note_uid column + trigger on notes',
    sql: `select exists(select 1 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='note_uid') as col,
                 exists(select 1 from pg_trigger where tgrelid='public.notes'::regclass and tgname='trg_notes_note_uid') as trg,
                 (select count(*) from public.notes where note_uid is not null) as backfilled`,
  },
  {
    label: 'groups columns + trigger on communities',
    sql: `select exists(select 1 from information_schema.columns where table_schema='public' and table_name='communities' and column_name='invite_code') as invite_code,
                 exists(select 1 from information_schema.columns where table_schema='public' and table_name='communities' and column_name='member_cap') as member_cap,
                 exists(select 1 from pg_trigger where tgrelid='public.communities'::regclass and tgname='trg_groups_invite_code') as trg`,
  },
  {
    label: 'group RPCs callable by authenticated',
    sql: `select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok
            from pg_proc p where p.proname in ('create_user_group','join_group_by_code','group_member_action','leave_group')`,
  },
  {
    label: 'latest tracked migrations',
    sql: `select version, name from supabase_migrations.schema_migrations order by version desc limit 5`,
  },
]

for (const c of checks) {
  try {
    const out = await runSql(c.sql)
    console.log(`\nverify [${c.label}]:\n${out.slice(0, 600)}`)
  } catch (e) {
    console.error(`verify failed [${c.label}]:`, String(e.message ?? e).slice(0, 300))
  }
}
