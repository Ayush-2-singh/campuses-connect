/**
 * One-off: apply a single migration file to production via the Management API
 * and record it in supabase_migrations.schema_migrations.
 * Usage: node scripts/apply-one-migration.mjs <PAT> <PROJECT_REF> <FILE>
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pat, ref, file] = process.argv.slice(2);
if (!pat || !ref || !file) {
  console.error('Usage: node scripts/apply-one-migration.mjs <PAT> <PROJECT_REF> <MIGRATION_FILE>');
  process.exit(1);
}

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', file);
const sql = readFileSync(sqlPath, 'utf8');
const version = file.match(/^(\d{8})/)?.[1] ?? file.replace('.sql', '');
const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `BEGIN;\n${sql}\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${name}');\nCOMMIT;`,
  }),
});
const text = await res.text();
console.log(res.ok ? `✅ ${file} applied` : `❌ HTTP ${res.status}: ${text.slice(0, 1000)}`);
process.exit(res.ok ? 0 : 2);
