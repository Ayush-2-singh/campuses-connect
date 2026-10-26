/**
 * ROOM MODERATION + VOLUME — who runs a room, who gets silenced, and how
 * loudly each person plays on YOUR device.
 *
 * The ask, in three parts:
 *   • owner/admin ko power do co-admin banane ka
 *   • ye dono log (aur ab co-admin bhi) mute kar sakte hain baaki logo ko
 *   • volume kam karne ka option sabke liye — jo jiska man, uska volume
 *
 * Guards the things that would quietly undo each one: a plain member handing
 * itself power, the moderator's mute being confused with a person's OWN mic
 * toggle, the mute surviving only in the browser (no server-side track), and
 * a "volume" that changes somebody else's call instead of only yours.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const surface = read('src/components/voice/CallSurface.tsx')
const page = read('src/app/live-voice-chat/[id]/page.tsx')
const migration = read('supabase/migrations/20261110_room_moderation.sql')
const controls = read('supabase/migrations/20261111_room_controls.sql')
const route = read('src/app/api/live-voice-chat/mute/route.ts')
const token = read('src/app/api/live-voice-chat/token/route.ts')

describe('co-admin is a real role, handed out by the owner or an admin', () => {
  it('grows the vocabulary of live_voice_chat_members', () => {
    expect(migration).toMatch(/CHECK \(role IN \('member', 'co-admin', 'admin'\)\)/)
  })

  it('decides the power in SQL, not in the browser', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.set_live_voice_chat_role/)
    // Only the creator or an admin may do it — a co-admin can not make more.
    expect(migration).toMatch(/IF NOT COALESCE\(v_is_owner, FALSE\) AND v_my_role IS DISTINCT FROM 'admin' THEN/)
    // The owner's own row is never on the table, and only members are in.
    expect(migration).toMatch(/IF p_user_id = v_owner THEN RETURN FALSE; END IF;/)
    expect(migration).toMatch(/p_role NOT IN \('member', 'co-admin'\)/)
  })

  it('is offered on the member row, never on an admin or yourself', () => {
    expect(page).toMatch(/const canPromote =/)
    expect(page).toMatch(/supabase\.rpc\('set_live_voice_chat_role'/)
    expect(page).toMatch(/\{canPromote && m\.role !== 'admin' && m\.user_id !== user\?\.id && \(/)
    expect(page).toMatch(/'Make co-admin'/)
    expect(page).toMatch(/m\.role === 'co-admin' \&\& \(/)
  })
})

describe('owner, admin and co-admin can mute the rest', () => {
  it('checks those three roles — and only those three — in SQL', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.set_live_voice_chat_host_mute/)
    expect(migration).toMatch(
      /IF NOT COALESCE\(v_is_owner, FALSE\)\s*\n\s*AND v_my_role IS DISTINCT FROM 'admin'\s*\n\s*AND v_my_role IS DISTINCT FROM 'co-admin' THEN/
    )
    // Nobody mutes themselves, and only somebody actually in this call.
    expect(migration).toMatch(/IF v_me IS NULL OR p_target = v_me THEN RETURN FALSE; END IF;/)
    expect(migration).toMatch(/AND left_at IS NULL;/)
  })

  it('keeps the moderator mute apart from the person’s own mic toggle', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS host_muted BOOLEAN NOT NULL DEFAULT FALSE;/)
    expect(migration).toMatch(/SET host_muted = p_muted/)
    // The person's own mute still only ever writes their own row.
    expect(read('supabase/migrations/20260927_voice_live_truth.sql')).toMatch(
      /SET is_muted = p_muted, last_seen_at = now\(\)/
    )
  })

  it('also asks LiveKit to silence the track, so a backgrounded tab stops too', () => {
    expect(route).toMatch(/new RoomServiceClient\(url, apiKey, apiSecret\)/)
    expect(route).toMatch(/mutePublishedTrack\(roomName, participant\.identity, microphone\.sid, muted\)/)
    // Authorisation still comes from the RPC — the route only relays it.
    expect(route).toMatch(/supabase\.rpc\('set_live_voice_chat_host_mute'/)
    expect(route).toMatch(/Only the owner, an admin or a co-admin can mute somebody/)
  })

  it('MUTE EVERYONE is one tap, and still the moderator’s power only', () => {
    expect(route).toMatch(/set_live_voice_chat_host_mute_all/)
    expect(route).toMatch(/Only the owner, an admin or a co-admin can mute everybody/)
    // Whoever pressed it keeps their own microphone.
    expect(route).toMatch(/participants\.filter\(\(p\) => p\.identity !== actorId\)/)
    expect(surface).toMatch(/body: JSON\.stringify\(\{ callId, all: true, muted \}\)/)
  })

  it('the muted client keeps its mic off and can not unmute it', () => {
    expect(surface).toMatch(/if \(!iamHostMuted \|\| !localParticipant \|\| !isMicrophoneEnabled\) return/)
    expect(surface).toMatch(/localParticipant\.setMicrophoneEnabled\(false\)/)
    expect(surface).toMatch(/if \(hostMuted\) return/)
    expect(surface).toMatch(/title=\{hostMuted \? 'Muted by a moderator' : undefined\}/)
  })

  it('every screen learns about it without polling', () => {
    expect(surface).toMatch(/table: 'live_voice_chat_participants', filter: `call_id=eq\.\$\{callId\}`/)
    expect(surface).toMatch(/table: 'live_voice_chat_members', filter: `group_id=eq\.\$\{groupId\}`/)
  })

  it('the mute button only exists for those three', () => {
    expect(surface).toMatch(/\{canModerate && !p\.isLocal && \(/)
    expect(surface).toMatch(/aria-label=\{silenced \? `Let \$\{name\} speak again` : `Mute \$\{name\} in this call`\}/)
  })
})

describe('volume is per person, and only ever yours', () => {
  it('gives every participant a slider', () => {
    expect(surface).toMatch(/type="range"/)
    expect(surface).toMatch(/aria-label=\{`Volume for \$\{name\}`\}/)
    expect(surface).toMatch(/onVolume\(p\.identity, Number\(e\.target\.value\) \/ 100\)/)
  })

  it('applies it to the running track, so the slider is heard at once', () => {
    expect(surface).toMatch(/if \(p instanceof RemoteParticipant\) p\.setVolume\(volume\)/)
    expect(surface).toMatch(/import \{ RemoteParticipant, Track \} from 'livekit-client'/)
  })

  it('is keyed by identity and kept for the whole call', () => {
    expect(surface).toMatch(/const \[volumes, setVolumes\] = useState<Record<string, number>>\(\{\}\)/)
    expect(surface).toMatch(/setVolumes\(\(prev\) => \(\{ \.\.\.prev, \[identity\]: volume \}\)\)/)
  })

  it('opens from the same More menu as the rest of the room’s controls', () => {
    expect(surface).toMatch(/icon="users"/)
    expect(surface).toMatch(/label=\{peopleOpen \? 'Close the people panel' : 'People — volume and mute'\}/)
  })
})

describe('the door: lock the room, size the room', () => {
  it('locks the call, and names who may flip the switch', () => {
    expect(controls).toMatch(/ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE/)
    expect(controls).toMatch(/CREATE OR REPLACE FUNCTION public\.set_live_voice_chat_call_lock/)
    // Owner, admin or co-admin — and nobody else, decided in SQL.
    expect(controls).toMatch(/AND v_my_role IS DISTINCT FROM 'co-admin' THEN/)
  })

  it('lets the admin make the room bigger or smaller, free4talk-style', () => {
    expect(controls).toMatch(/ADD COLUMN IF NOT EXISTS max_participants INTEGER/)
    expect(controls).toMatch(/CHECK \(max_participants BETWEEN 2 AND 200\)/)
    expect(controls).toMatch(/CREATE OR REPLACE FUNCTION public\.set_live_voice_chat_room_size/)
    // Size is the owner's / admin's dial, not a co-admin's.
    expect(controls).toMatch(/AND v_my_role IS DISTINCT FROM 'admin' THEN/)
  })

  it('mutes everyone except the moderator who pressed it', () => {
    expect(controls).toMatch(/CREATE OR REPLACE FUNCTION public\.set_live_voice_chat_host_mute_all/)
    expect(controls).toMatch(/AND user_id <> v_me/)
  })

  it('the door is enforced where tokens are minted, not just in a button', () => {
    // No token → no LiveKit room: being shut out happens at the source.
    expect(token).toMatch(/This room is locked — the host has to let you in\./)
    expect(token).toMatch(/This room is full\. An admin has to make it bigger\./)
    expect(token).toMatch(
      /const runsRoom = group\?\.created_by === user\.id \|\| myRole === 'admin' \|\| myRole === 'co-admin'/
    )
    // Somebody already inside — and whoever runs the room — always get back in.
    expect(token).toMatch(/const alreadyIn = !!mine/)
    expect(token).toMatch(/\.is\('left_at', null\)/)
  })

  it('the roster panel carries the lock and mute-everyone switches', () => {
    expect(surface).toMatch(/roomLocked=\{roomLocked\}/)
    expect(surface).toMatch(/onToggleLock=\{toggleLock\}/)
    expect(surface).toMatch(/onMuteAll=\{muteAll\}/)
    expect(surface).toMatch(/'Lock room'/)
    expect(surface).toMatch(/everyoneMuted \? 'Allow everyone' : 'Mute everyone'/)
    expect(surface).toMatch(/table: 'live_voice_chat_calls', filter: `id=eq\.\$\{callId\}`/)
  })

  it('the room page shows the dial, the lock, and why someone was shut out', () => {
    expect(page).toMatch(/supabase\.rpc\('set_live_voice_chat_room_size'/)
    expect(page).toMatch(/supabase\.rpc\('set_live_voice_chat_call_lock'/)
    expect(page).toMatch(/Room is locked/)
    expect(page).toMatch(/This room is full/)
    expect(page).toMatch(/aria-label="Decrease the room size"/)
  })
})
