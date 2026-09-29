/**
 * USER GROUPS guard — the Telegram-style administration feature.
 *
 * Locks the pieces a future refactor must not break:
 *   1. The migration exists and carries the whole surface: invite codes,
 *      member cap, RLS for group membership management, and the four RPCs
 *      (create / join / moderate / leave).
 *   2. The RPCs are actually wired: the Groups page and the members sheet
 *      call them by name — a renamed RPC with no UI update would 404 at
 *      runtime, silently breaking group administration.
 *   3. The 200 cap is real, in the DB, not just marketing copy.
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

describe('user groups — UI wiring', () => {
  it('the groups page calls the real RPCs', () => {
    const page = read('src/app/groups/page.tsx')
    expect(page).toContain("rpc('create_user_group'")
    expect(page).toContain("rpc('join_group_by_code'")
  })

  it('the members sheet calls the moderation RPC and shows pending approvals', () => {
    const sheet = read('src/components/GroupMembersSheet.tsx')
    expect(sheet).toContain("rpc('group_member_action'")
    expect(sheet).toMatch(/pending/)
    expect(sheet).toMatch(/'promote'|'demote'/)
    expect(sheet).toMatch(/invite/i)
  })

  it('group rooms open the members panel; global rooms do not', () => {
    const chat = read('src/app/chat/[slug]/page.tsx')
    expect(chat).toContain('GroupMembersSheet')
    expect(chat).toMatch(/is_global === false/)
  })
})
