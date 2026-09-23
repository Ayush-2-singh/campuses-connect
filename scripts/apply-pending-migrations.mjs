/**
 * Applies pending Supabase migrations via the Management API SQL endpoint.
 * Usage: node scripts/apply-pending-migrations.mjs <SUPABASE_PAT> <PROJECT_REF>
 *
 * - Runs each migration file in its own transaction (BEGIN ... COMMIT).
 * - Records version+name into supabase_migrations.schema_migrations so future
 *   `supabase db push` runs see them as applied.
 * - Stops on the first failure and prints the Postgres error.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pat, ref] = process.argv.slice(2);
if (!pat || !ref) {
  console.error('Usage: node scripts/apply-pending-migrations.mjs <PAT> <PROJECT_REF>');
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

// Only files newer than what's tracked in the DB (last tracked: 20260802).
const FILES = [
  '20260920_live_voice_chat.sql',
  '20260921_fix_notification_functions.sql',
  '20260922_fix_announcement_assignment_notifications.sql',
  '20260923_fix_post_reactions_select_policy.sql',
  '20261001_universal_admins.sql',
  '20261015_notes_admin_only_rls.sql',
  '20261016_infra_cost_hardening.sql',
  '20261017_live_chat.sql',
  '20261018_dsa_submission_retention.sql',
  '20261019_library_contributions.sql',
  '20261020_compete_ratings.sql',
  '20261021_score_model.sql',
  '20261022_competitive_integrity.sql',
  '20261023_confessions.sql',
];

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return text;
}

async function alreadyTracked(version) {
  const out = await runSql(
    `select version from supabase_migrations.schema_migrations where version = '${version}'`
  );
  return JSON.parse(out).length > 0;
}

let applied = 0;
for (const file of FILES) {
  const version = file.match(/^(\d{8})/)?.[1] ?? file.replace('.sql', '');
  const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');

  if (await alreadyTracked(version)) {
    console.log(`⏭  ${file} (already tracked, skipping)`);
    continue;
  }

  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  const wrapped = `BEGIN;\n${sql}\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${name}');\nCOMMIT;`;

  process.stdout.write(`▶  ${file} ... `);
  try {
    await runSql(wrapped);
    console.log('✅ applied');
    applied++;
  } catch (err) {
    console.log('❌ FAILED');
    console.error(String(err.message ?? err).slice(0, 1500));
    console.error(`\nStopped at ${file}. Earlier migrations are committed.`);
    process.exit(2);
  }
}

console.log(`\nDone — ${applied} migration(s) applied.`);

// Verification
const checks = [
  "select column_name from information_schema.columns where table_schema='public' and table_name='communities' and column_name='chat_enabled'",
  "select count(*) as chat_tables from information_schema.tables where table_schema='public' and table_name in ('chat_messages','chat_bans','confessions','competitive_ratings','xp_events','library_contributions')",
  "select version, name from supabase_migrations.schema_migrations order by version desc limit 5",
];
for (const q of checks) {
  try {
    console.log('\n✔ verify:', (await runSql(q)).slice(0, 400));
  } catch (e) {
    console.error('verify failed:', String(e.message ?? e).slice(0, 300));
  }
}
