/**
 * INVITE-ONLY LOCKED ROOMS — guards the change that took password-locked voice
 * rooms out of every public listing.
 *
 * The password always guarded ENTRY; the room's existence still leaked. Now a
 * locked room is visible only to its members, and a student who holds the
 * invite link gets in through a dedicated read. Failure modes guarded here:
 *   - the policy quietly reverting to "everyone can list locked rooms";
 *   - the invite read leaking password_hash to the client;
 *   - the room page losing its invite-link fallback (link holders locked out).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const migration = read('supabase/migrations/20261107_voice_invite_only_rooms.sql')

describe('locked rooms are invite-only at the data layer', () => {
  it('hides private rooms from non-members in the SELECT policy', () => {
    expect(migration).toContain('lvc_groups_select')
    expect(migration).toMatch(/NOT is_private OR public\.is_lvc_member\(id\)/)
  })

  it('asks membership through a SECURITY DEFINER helper (no RLS recursion)', () => {
    expect(migration).toMatch(/FUNCTION public\.is_lvc_member/)
    expect(migration).toMatch(/SECURITY DEFINER/)
  })

  it('keeps the invite read available so a link holder can still enter', () => {
    expect(migration).toMatch(/FUNCTION public\.get_live_voice_chat_group/)
    // The invite read must NEVER hand the password hash to the client.
    const inviteFn = migration.slice(migration.indexOf('FUNCTION public.get_live_voice_chat_group'))
    expect(inviteFn).not.toContain('password_hash')
  })
})

describe('the room page honours the invite flow', () => {
  const room = read('src/app/live-voice-chat/[id]/page.tsx')

  it('falls back to the invite read when RLS hides the room', () => {
    expect(room).toMatch(/rpc\('get_live_voice_chat_group'/)
  })

  it('lets a member SHARE the invite link — every room, not just locked ones', () => {
    // The control used to be a clipboard copy behind `is_private`, so a public
    // room had no share button at all and people copied a bare UUID out of the
    // address bar. It now opens the system share sheet on a phone and falls
    // back to the clipboard, carrying the room's name in the message.
    expect(room).toMatch(/const shareRoom = async/)
    expect(room).toMatch(/navigator\.share/)
    expect(room).toMatch(/clipboard\.writeText/)
    expect(room).toMatch(/AbortError/) // dismissing the sheet must not copy
    expect(room).toMatch(/\/live-voice-chat\/\$\{groupId\}/)
    expect(room).toMatch(/aria-label="Share this room"/)
  })

  it('tells the invitee the room is invite-only', () => {
    expect(room).toMatch(/invite-only/i)
  })
})

describe('the hub routes invited students past the hidden list', () => {
  const hub = read('src/app/live-voice-chat/page.tsx')

  it('offers an invite-link entry box', () => {
    expect(hub).toContain('openInvite')
    expect(hub).toMatch(/Paste a room invite link/)
  })

  it('describes the lock as invite-only', () => {
    expect(hub).toMatch(/Locked room — invite only/)
  })
})
