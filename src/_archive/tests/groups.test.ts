/**
 * USER GROUPS guard — the Telegram-style administration feature.
 *
 * Locks the pieces a future refactor must not break:
 *   1. The migrations carry the whole surface: invite codes, member cap,
 *      RLS for group membership management, the four original RPCs
 *      (create / join / moderate / leave), the v2 additions — password
 *      verification for locked groups, personal folders, creator settings,
 *      invite regeneration and delete — and the retirement of the old
 *      password-free signatures.
 *   2. The RPCs are actually wired: the Groups page, the members sheet and
 *      the chat room call them by name — a renamed RPC with no UI update
 *      would 404 at runtime, silently breaking group administration.
 *   3. The 200 cap is real, in the DB, not just marketing copy.
 *   4. Passwords never touch a publicly readable column: the hash lives in
 *      a zero-policy table because communities is anon-readable since
 *      20261026.
 *
 * Walked from the tree (not git), so uncommitted files are covered too.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

describe('user groups — migration surface', () => {
  const migration = read('supabase/migrations/20261029_user_groups.sql')

  it('adds invite codes with the confusion-free alphabet and a unique index', () => {
    expect(migration).toContain('invite_code')
    expect(migration).toMatch(/CC-GRP-/)
    expect(migration).toMatch(/idx_communities_invite_code/)
    // Same alphabet as note UIDs: no I/O/0/1.
    expect(migration).toContain("'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'")
  })

  it('enforces the member cap in the join RPC', () => {
    expect(migration).toContain('member_cap')
    expect(migration).toMatch(/v_cnt >= v_cap/)
    expect(migration).toMatch(/'full'/)
  })

  it('ships the four RPCs with revokes (never PUBLIC)', () => {
    for (const fn of ['create_user_group', 'join_group_by_code', 'group_member_action', 'leave_group']) {
      expect(migration).toContain(`FUNCTION public.${fn}`)
      expect(migration).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}`))
      expect(migration).toMatch(new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${fn}[^;]*TO authenticated`))
    }
  })

  it('routes mutes through chat_mutes so the chat room honours them', () => {
    expect(migration).toMatch(/INSERT INTO public\.chat_mutes/)
  })

  it('never lets a mod touch the creator', () => {
    expect(migration).toMatch(/nobody moderates the creator|p_user_id = v_group\.created_by/)
  })

  it('keeps global rooms out of the group paths', () => {
    expect(migration).toMatch(/is_global = FALSE/)
  })
})

describe('user groups v2 — passwords, folders, ownership', () => {
  const v2 = read('supabase/migrations/20261031_group_folders_password.sql')

  it('hashes group passwords in a zero-policy store, never on communities', () => {
    expect(v2).toMatch(/CREATE TABLE IF NOT EXISTS public\.group_passwords/)
    expect(v2).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(v2).toMatch(/crypt\(/)
    expect(v2).toMatch(/gen_salt\('bf'/)
    // The plaintext must never land on the anon-readable communities table.
    expect(v2).not.toMatch(/join_password/)
  })

  it('requires a password for locked groups — at create and at join', () => {
    expect(v2).toMatch(/password_required/)
    expect(v2).toMatch(/char_length\(btrim\(p_password\)\) < 4/)
    expect(v2).toMatch(/'wrong_password'/)
  })

  it('retires the old password-free signatures so no stale client can bypass', () => {
    expect(v2).toMatch(/DROP FUNCTION IF EXISTS public\.create_user_group\(TEXT, TEXT, TEXT, TEXT\)/)
    expect(v2).toMatch(/DROP FUNCTION IF EXISTS public\.join_group_by_code\(TEXT\)/)
  })

  it('keeps folders personal — owned rows only, unique per user', () => {
    expect(v2).toMatch(/CREATE TABLE IF NOT EXISTS public\.group_folders/)
    expect(v2).toMatch(/user_id = auth\.uid\(\)/)
    expect(v2).toMatch(/idx_group_folders_user_name/)
  })

  it('files groups with a member-gated RPC, not raw column writes', () => {
    expect(v2).toMatch(/FUNCTION public\.set_group_folder/)
    expect(v2).toMatch(/cm\.status = 'approved'/)
  })

  it('gives the creator rename, invite regeneration and cascade delete', () => {
    expect(v2).toMatch(/FUNCTION public\.update_user_group/)
    expect(v2).toMatch(/FUNCTION public\.regenerate_group_invite/)
    expect(v2).toMatch(/FUNCTION public\.delete_user_group/)
    expect(v2).toMatch(/created_by = v_me|created_by = auth\.uid\(\)/)
  })
})

describe('user groups — UI wiring', () => {
  it('the groups page calls the real RPCs', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toContain("rpc('create_user_group'")
    expect(page).toContain("rpc('join_group_by_code'")
  })

  it('the create sheet offers a password for locked groups and folder filing', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toMatch(/type="password"/)
    expect(page).toContain('p_password')
    expect(page).toContain('p_folder_id')
  })

  it('the join box unlocks locked groups with a password step', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toMatch(/wrong_password/)
    expect(page).toMatch(/needsPassword/)
  })

  it('renders Telegram-style folder tabs with folder CRUD', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toMatch(/from\('group_folders'\)/)
    expect(page).toMatch(/activeFolder/)
    expect(page).toMatch(/deleteFolder/)
  })

  it('offers leave and delete on every owned group', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toContain("rpc('leave_group'")
    expect(page).toContain("rpc('delete_user_group'")
    expect(page).toContain("rpc('set_group_folder'")
  })

  it('the members sheet calls the moderation RPC and shows pending approvals', () => {
    const sheet = read('src/components/GroupMembersSheet.tsx')
    expect(sheet).toContain("rpc('group_member_action'")
    expect(sheet).toMatch(/pending/)
    expect(sheet).toMatch(/'promote'|'demote'/)
    expect(sheet).toMatch(/invite/i)
  })

  it('the members sheet gives the creator settings and invite regeneration', () => {
    const sheet = read('src/components/GroupMembersSheet.tsx')
    expect(sheet).toContain("rpc('update_user_group'")
    expect(sheet).toContain("rpc('regenerate_group_invite'")
  })

  it('group rooms open the members panel; global rooms do not', () => {
    const chat = read('src/app/chat/[slug]/page.tsx')
    expect(chat).toContain('GroupMembersSheet')
    expect(chat).toMatch(/is_global === false/)
  })

  it('locked group rooms route the password step to /groups, not the gateway', () => {
    const chat = read('src/app/chat/[slug]/page.tsx')
    expect(chat).toMatch(/wrong_password/)
    expect(chat).toMatch(/\/groups\?code=/)
  })
})
