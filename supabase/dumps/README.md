# ConnectMyCampus — Database Backups

Full backup of the **live Supabase database** (project ref `tnlbqirrrjrkxkxlkpat`),
taken via the Management API SQL endpoint (runs as postgres — captures ALL rows,
no RLS filtering).

> ⚠️ **auth.users is intentionally NOT exported** — it contains password hashes.
> For that schema use the Supabase dashboard (Settings → Database → Backups)
> or `supabase db dump` locally. This folder covers the entire `public` schema.

## Contents

| Path | What |
|---|---|
| `data/*.json` | One file per public table — every row, ids preserved |
| `schema/01_columns.json` | All tables + columns + types + defaults + not-null |
| `schema/02_constraints.json` | PK / FK / unique / check constraints |
| `schema/03_indexes.json` | All indexes |
| `schema/04_rls.json` | RLS on/off per table |
| `schema/05_policies.json` | Every RLS policy (with qual + with_check) |
| `schema/06_functions.json` | Full source of every function/RPC (incl. SECURITY DEFINER) |
| `schema/07_triggers.json` | All triggers |

## Restore data (Supabase SQL Editor)

For each table, run:

```sql
INSERT INTO public.<table_name>
SELECT * FROM json_populate_recordset(NULL::public.<table_name>, '<paste the contents of data/<table_name>.json>');
```

Example:

```sql
INSERT INTO public.posts
SELECT * FROM json_populate_recordset(NULL::public.posts,
  '[{"id":"1b9155c0-...","author_id":"744e8901-...",...}]');
```

Ids are preserved, so foreign keys stay intact. Run child tables before parents
or drop the FK constraints first if you need a different order.

## Re-run the backup

```bash
SUPABASE_ACCESS_TOKEN='sbp_...' bash scripts/backup-db.sh tnlbqirrrjrkxkxlkpat supabase/dumps
```

Requires only the Management API token (no Docker, no DB password).

## Schema source of truth

The re-runnable DDL lives in `supabase/migrations/` (001–007). This `schema/`
folder is the *live-state* manifest — useful for drift checks between
`supabase/migrations/` and the real database.
