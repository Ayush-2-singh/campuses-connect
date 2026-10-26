/**
 * LIVE-ROOM MODERATION — kick, the in-call door, and the trail it leaves.
 *
 * The ask this file pins down (voice note, 3am edition): an admin should be
 * able to REMOVE somebody from the call and not have them walk straight back
 * in; the lock and the room-size dial should be reachable from inside the call,
 * not only from the room page; and the moderation should leave a record an
 * admin can read afterwards.
 *
 * Guards the four ways that would quietly break:
 *   • a kick that only disconnects — the person rejoins a second later;
 *   • a co-admin (or anybody) removing the owner or their own rank;
 *   • the lock/size buttons showing up for people who do not run the room;
 *   • an action that happens but is never written to audit_log.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const migration = read('supabase/migrations/20261112_voice_kick_and_action_log.sql')
const kickRoute = read('src/app/api/live-voice-chat/kick/route.ts')
const muteRoute = read('src/app/api/live-voice-chat/mute/route.ts')
const tokenRoute = read('src/app/api/live-voice-chat/token/route.ts')
const surface = read('src/components/voice/CallSurface.tsx')

describe('a kick keeps them out, not just off the call', () => {
  it('remembers the removal per call, for the life of that call', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.live_voice_chat_kicks/)
    expect(migration).toMatch(/PRIMARY KEY \(call_id, user_id\)/)
    expect(migration).toMatch(/ALTER TABLE public\.live_voice_chat_kicks ENABLE ROW LEVEL SECURITY/)
    // Only the people who run the room may read it; nobody writes it directly.
    expect(migration).toMatch(/live_voice_chat_kicks_select/)
    // The token route reads the list AS THE CALLER, so their own removal has to
    // be visible to them — a moderators-only policy would hide the kick and the
    // door would quietly reopen.
    expect(migration).toMatch(/user_id = auth\.uid\(\)/)
    expect(migration).not.toMatch(/live_voice_chat_kicks\s+FOR INSERT/)
  })

  it('closes the participant row when the kick lands', () => {
    const kick = migration.slice(migration.indexOf('kick_live_voice_chat_participant'))
    expect(kick).toMatch(/UPDATE public\.live_voice_chat_participants/)
    expect(kick).toMatch(/SET left_at = now\(\)/)
    expect(kick).toMatch(/INSERT INTO public\.live_voice_chat_kicks/)
  })

  it('the token route reads the kick list BEFORE the "already inside" shortcut', () => {
    // A removed person's participant row still exists, so a kick check that ran
    // after `alreadyIn` would wave them straight back in.
    const gate = tokenRoute.slice(tokenRoute.indexOf('live_voice_chat_kicks'), tokenRoute.indexOf('const alreadyIn'))
    expect(gate).toMatch(/eq\('user_id', user\.id\)/)
    expect(gate).toMatch(/status: 403/)
    expect(tokenRoute.indexOf('live_voice_chat_kicks')).toBeGreaterThan(0)
    expect(tokenRoute.indexOf('live_voice_chat_kicks')).toBeLessThan(tokenRoute.indexOf('const alreadyIn'))
  })

  it('the API route drops the LiveKit connection too', () => {
    expect(kickRoute).toMatch(/kick_live_voice_chat_participant/)
    expect(kickRoute).toMatch(/roomService\.removeParticipant\(`live-voice-chat-\$\{callId\}`, targetUserId\)/)
    // The SQL function is the authorisation — a refused kick changes nothing.
    expect(kickRoute).toMatch(/if \(allowed !== true\) \{/)
  })
})

describe('nobody removes their own rank or above', () => {
  it('ranks owner > admin > co-admin > member in one place', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.live_voice_chat_role_rank/)
    expect(migration).toMatch(/WHEN 'admin' THEN 2/)
    expect(migration).toMatch(/WHEN 'co-admin' THEN 1/)
  })

  it('refuses a target at or above the caller, and refuses self', () => {
    const kick = migration.slice(migration.indexOf('kick_live_voice_chat_participant'))
    expect(kick).toMatch(/IF v_me_rank < 1 THEN RETURN FALSE/)
    expect(kick).toMatch(/IF v_target_rank >= v_me_rank THEN RETURN FALSE/)
    expect(kick).toMatch(/p_target = v_me/)
  })
})

describe('the room can be locked and sized from inside the call', () => {
  it('the More menu carries the lock and the size dial, behind the role check', () => {
    expect(surface).toMatch(/icon=\{roomLocked \? 'unlock' : 'lock'\}/)
    expect(surface).toMatch(/Open the room to new people/)
    expect(surface).toMatch(/Lock the room to new people/)
    expect(surface).toMatch(/Room size/)
    // Both live under `canModerate`, and size is the owner/admin dial alone.
    expect(surface).toMatch(/\{canModerate && \(/)
    expect(surface).toMatch(/\{canResize && \(/)
    expect(surface).toMatch(/set_live_voice_chat_room_size/)
  })

  it('the call screen hands the dials down from one moderation hook', () => {
    expect(surface).toMatch(/const \{[\s\S]{0,220}?roomSize,/)
    expect(surface).toMatch(/changeRoomSize/)
    expect(surface).toMatch(/canResize=\{canResize\}/)
    expect(surface).toMatch(/onRoomSize=\{changeRoomSize\}/)
    expect(surface).toMatch(/onToggleLock=\{toggleLock\}/)
  })
})

describe('removing somebody from the roster', () => {
  it('the People panel offers Remove next to Mute, moderators only', () => {
    expect(surface).toMatch(/onKick=\{kickParticipant\}/)
    expect(surface).toMatch(/aria-label=\{`Remove \$\{name\} from this call`\}/)
    expect(surface).toMatch(/window\.confirm\(`Remove \$\{name\} from this call\?`\)/)
    expect(surface).toMatch(/\/api\/live-voice-chat\/kick/)
  })
})

describe('the trail an admin can read', () => {
  it('writes into the existing audit_log, so /admin already shows it', () => {
    expect(migration).toMatch(/INSERT INTO public\.audit_log \(actor_id, action, entity_type, entity_id, metadata\)/)
    expect(migration).toMatch(/'voice\.kick'/)
    expect(migration).toMatch(/'voice\.' \|\| p_action/)
    expect(read('src/app/api/admin/audit-log/route.ts')).toMatch(/from\('audit_log'\)/)
  })

  it('records lock, unlock, size, mute and mute-all — kick writes itself', () => {
    expect(migration).toMatch(/'lock', 'unlock', 'size', 'mute', 'unmute', 'mute_all', 'unmute_all'/)
    expect(surface).toMatch(/void logAction\(locked \? 'lock' : 'unlock'\)/)
    expect(surface).toMatch(/void logAction\('size', \{ max: capped \}\)/)
    expect(muteRoute).toMatch(/logAction\(supabase, callId, muted \? 'mute' : 'unmute', targetUserId\)/)
    expect(muteRoute).toMatch(/logAction\(supabase, callId, muted \? 'mute_all' : 'unmute_all'\)/)
  })

  it('a missing log row never fails the action that already happened', () => {
    expect(muteRoute).toMatch(/the log is a record of what happened, never a gate on it/)
    expect(surface).toMatch(/the log records what happened; it never blocks it/)
  })
})
