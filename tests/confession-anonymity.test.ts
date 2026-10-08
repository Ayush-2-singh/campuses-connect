/**
 * Confessions — total anonymity + two honest delete paths.
 *
 * Guards the three requirements behind
 * supabase/migrations/20260928_confession_total_anonymity.sql:
 *
 *   1. No author id exists at all (dropped, retroactively): the create RPC
 *      writes no identity, and ownership is a one-time secret whose SHA-256
 *      is the only thing the database keeps.
 *   2. Admins (platform/campus) hard-delete anything through an audited RPC —
 *      audit row written BEFORE the confession disappears.
 *   3. The poster deletes their own with the token their browser stored —
 *      the token, never an identity check.
 *
 * The UI must offer both paths and must only ever read through the
 * confessions_public view (the base table grants nothing to clients).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const MIGRATION = 'supabase/migrations/20260928_confession_total_anonymity.sql'
const TAB = 'src/components/community/ConfessionsTab.tsx'

describe('confessions are anonymous at rest', () => {
  const migration = read(MIGRATION)

  it('drops both stored identity columns', () => {
    expect(migration).toMatch(/DROP COLUMN IF EXISTS author_id/)
    expect(migration).toMatch(/DROP COLUMN IF EXISTS campus_id/)
    // the author index and read-own policy must go with them
    expect(migration).toMatch(/DROP INDEX IF EXISTS idx_confessions_author/)
    expect(migration).toMatch(/DROP POLICY IF EXISTS confessions_select_own/)
  })

  it('create_confession inserts no identity and hands back a one-time token', () => {
    const insert = migration.match(/INSERT INTO public\.confessions \(([^)]*)\)/)?.[1] ?? ''
    expect(insert).not.toContain('author_id')
    expect(insert).not.toContain('campus_id')

    expect(migration).toContain('RETURNS JSONB')
    expect(migration).toContain("jsonb_build_object('id'")
    // the plaintext token leaves the database — only its sha256 stays
    expect(migration).toMatch(/encode\(sha256\(convert_to\(v_token/)
    // …and it needs no extension beyond core Postgres
    expect(migration).not.toContain('CREATE EXTENSION')
  })

  it('reads still go through the public view, never the base table', () => {
    expect(read('supabase/migrations/20261023_confessions.sql')).toContain('confessions_public')
    expect(read(TAB)).not.toMatch(/\.from\(\s*['"]confessions['"]/)
  })
})

describe('delete paths', () => {
  const migration = read(MIGRATION)

  it('poster delete proves ownership with the hashed token, not an identity', () => {
    const fn = migration.slice(
      migration.indexOf('public.delete_confession'),
      migration.indexOf('public.admin_delete_confession')
    )
    expect(fn).toContain('p_delete_token')
    expect(fn).toContain('v_hash <> v_try')
    expect(fn).not.toContain('auth.uid()')
  })

  it('admin delete requires an admin grant and audits before removing', () => {
    const fn = migration.slice(migration.indexOf('public.admin_delete_confession'))
    expect(fn).toContain("'platform_admin', 'campus_admin'")
    expect(fn).toContain('audit_log')
    // audit FIRST — the row (and its id) must still exist for the entry
    expect(fn.indexOf('INSERT INTO public.audit_log')).toBeLessThan(fn.indexOf('DELETE FROM public.confessions'))
  })

  it('the UI offers both delete buttons and keeps the token in this browser', () => {
    const tab = read(TAB)
    expect(tab).toContain("rpc('delete_confession'")
    expect(tab).toContain("rpc('admin_delete_confession'")
    expect(tab).toContain('rememberDeleteToken')
    expect(tab).toContain('forgetDeleteToken')
    expect(tab).toContain('useAdminContext')
  })
})
