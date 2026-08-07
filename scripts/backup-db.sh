#!/bin/bash
# ============================================================
# CampusConnect — Database backup to files (no Docker needed)
# Dumps every public table as JSON + a schema manifest via the
# Supabase Management API SQL endpoint (runs as postgres).
#
# Usage:
#   SUPABASE_ACCESS_TOKEN='sbp_...' bash scripts/backup-db.sh <project-ref> [outdir]
#   e.g. SUPABASE_ACCESS_TOKEN='sbp_...' bash scripts/backup-db.sh tnlbqirrrjrkxkxlkpat supabase/dumps
# ============================================================
set -euo pipefail

TOKEN="${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN env var required}"
REF="${1:?project ref required (e.g. tnlbqirrrjrkxkxlkpat)}"
OUT="${2:-supabase/dumps}"

mkdir -p "$OUT/data" "$OUT/schema"

q() { # q "<sql>" -> pretty JSON from the SQL endpoint
  curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1")" \
    "https://api.supabase.com/v1/projects/$REF/database/query"
}

echo "== table list =="
TABLES=$(q "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1" \
  | python3 -c 'import json,sys; print("\n".join(r["table_name"] for r in json.load(sys.stdin)))')
echo "$TABLES" | wc -l | xargs echo "tables found:"

echo "== data dump =="
for t in $TABLES; do
  q "SELECT coalesce(json_agg(t), '[]')::text AS data FROM (SELECT * FROM public.\"$t\") t" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["data"])' > "$OUT/data/$t.json"
  echo "  dumped $t ($(wc -c < "$OUT/data/$t.json") bytes)"
done

echo "== schema manifest =="
q "SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid,a.atttypmod) AS data_type, a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,a.attnum" \
  | python3 -m json.tool > "$OUT/schema/01_columns.json"
q "SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2" \
  | python3 -m json.tool > "$OUT/schema/02_constraints.json"
q "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2" \
  | python3 -m json.tool > "$OUT/schema/03_indexes.json"
q "SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1" \
  | python3 -m json.tool > "$OUT/schema/04_rls.json"
q "SELECT tablename, policyname, cmd, permissive, roles, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2" \
  | python3 -m json.tool > "$OUT/schema/05_policies.json"
q "SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1" \
  | python3 -m json.tool > "$OUT/schema/06_functions.json"
q "SELECT event_object_table AS tbl, trigger_name, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY 1,2" \
  | python3 -m json.tool > "$OUT/schema/07_triggers.json"

echo "DONE -> $OUT"
du -sh "$OUT"
