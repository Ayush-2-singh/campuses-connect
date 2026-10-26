'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms } from '@/lib/liveVoice'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import { voiceIcon } from '@/lib/liveVoice'

const SECTION_LABELS: Record<string, string> = {
  dsa: 'DSA',
  discussion: 'Discussion',
  'web-dev': 'Web Dev',
  english: 'English',
  random: 'Random',
}

function initials(name?: string | null, fallback = '?') {
  return (name || fallback).trim().charAt(0).toUpperCase()
}

export default function LiveVoiceChatRoomPage() {
  const { id: groupId } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [call, setCall] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Private rooms: the password prompt for non-members.
  const [pwPrompt, setPwPrompt] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwError, setPwError] = useState('')
  // Invite link copy feedback (locked rooms are invite-only).
  const [inviteCopied, setInviteCopied] = useState(false)
  // Last session's attendance — computed from the participants table.
  const [lastSession, setLastSession] = useState<{ minutes: number; people: number; live: boolean } | null>(null)
  const [reported, setReported] = useState(false)
  /** Which member's role is being handed out right now (co-admin tap). */
  const [roleBusy, setRoleBusy] = useState<string | null>(null)
  /** Room size dial and lock switch are the admin's — neither may double-fire. */
  const [sizeBusy, setSizeBusy] = useState(false)
  const [lockBusy, setLockBusy] = useState(false)

  // ── Load bookkeeping ───────────────────────────────────────────────────────
  // Realtime, the focus refetch and the 15s fallback all call load() and they
  // overlap. `seq` makes the NEWEST load the only one allowed to write state,
  // so a slow, older request can never repaint the screen — or post an error —
  // from a snapshot nobody is looking at any more.
  const loadSeq = useRef(0)
  /** The room currently on screen: lets a null read mean "gone" only when
   *  there is genuinely nothing to show, and "transient RLS flap" otherwise. */
  const groupRef = useRef<any>(null)
  /** The banner load() itself produced, so a successful pass can clear exactly
   *  that and leave an RPC error from a button press untouched. */
  const loadErrorRef = useRef('')

  const NOT_FOUND = 'This room does not exist, or it is a campus room you cannot see.'

  /**
   * Member names are fetched in a second query rather than embedded.
   * `live_voice_chat_members.user_id` references auth.users(id), not
   * profiles(id), so PostgREST has no relationship to embed across — asking
   * for `profiles(...)` here would fail the whole select.
   */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const isCurrent = () => seq === loadSeq.current

    const { data: groupData, error: groupError } = await supabase
      .from('live_voice_chat_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()
    // Mutable: the invite-link fallback below may replace it.
    let groupRow = groupData

    if (!isCurrent()) return // a newer load owns the screen now

    if (groupError) {
      loadErrorRef.current = groupError.message
      setError(groupError.message)
      setLoading(false)
      return
    }

    if (!groupRow) {
      // Locked rooms are invite-only: RLS keeps them out of every listing, so
      // a non-member legitimately reads nothing from the table above. A student
      // holding the INVITE LINK must still land on the room and reach the
      // password prompt, so fall back to the invite read — it returns the room
      // to anyone who has the id. Knowing the id IS the invite; the password is
      // the second lock (and never leaves the server).
      const { data: invited } = await supabase.rpc('get_live_voice_chat_group', { p_group_id: groupId })
      if (!isCurrent()) return
      const invitedRow = Array.isArray(invited) ? invited[0] : invited
      groupRow = invitedRow ?? null
    }

    if (!groupRow) {
      // First look and nothing to show → the room really is gone, unshared, or
      // outside your campus. If a room is ALREADY on screen this is a transient
      // visibility gap (a session refresh can make RLS hide a campus room for
      // exactly one request) — announcing "does not exist" over a fully
      // rendered room is a lie, so stay quiet and let the next pass confirm.
      if (!groupRef.current) {
        loadErrorRef.current = NOT_FOUND
        setError(loadErrorRef.current)
      }
      setLoading(false)
      return
    }

    // The room is visible again — any banner from an earlier pass is stale.
    if (loadErrorRef.current) {
      loadErrorRef.current = ''
      setError('')
    }
    groupRef.current = groupRow
    setGroup(groupRow)

    const { data: memberRows } = await supabase
      .from('live_voice_chat_members')
      .select('user_id, role, joined_at')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    const ids = (memberRows || []).map((m: any) => m.user_id)
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids)
      : { data: [] as any[] }
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]))

    setMembers(
      (memberRows || []).map((m: any) => ({
        ...m,
        name: byId.get(m.user_id)?.full_name || byId.get(m.user_id)?.username || 'Student',
        avatar_url: byId.get(m.user_id)?.avatar_url || null,
      }))
    )

    // Sweep ghost presence BEFORE reading it (the RPC closes heartbeat-dead
    // participant rows and ends calls nobody is in), so this room's LIVE
    // badge can never count a student whose tab already crashed.
    await fetchLiveVoiceRooms(supabase)
    if (!isCurrent()) return // the sweep is the slowest step — re-check after it

    const { data: callRow } = await supabase
      .from('live_voice_chat_calls')
      .select('id, status, started_at, locked')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .maybeSingle()
    setCall(callRow || null)

    if (callRow) {
      const { data: partRows } = await supabase
        .from('live_voice_chat_participants')
        .select('user_id, is_muted, left_at')
        .eq('call_id', callRow.id)
      setParticipants((partRows || []).filter((p: any) => !p.left_at))
    } else {
      setParticipants([])
    }

    setLoading(false)
  }, [groupId, supabase])

  useEffect(() => {
    // App Router keeps this component mounted when only the dynamic param
    // changes, so the PREVIOUS room's card and banner would otherwise survive
    // the navigation — a deleted room's "does not exist" banner sitting on top
    // of the next room's card. A new id means a new room: start clean.
    loadSeq.current++ // anything still in flight for the old room is stale
    groupRef.current = null
    loadErrorRef.current = ''
    setGroup(null)
    setMembers([])
    setCall(null)
    setParticipants([])
    setIsMember(false)
    setError('')
    setLoading(true)
  }, [groupId])

  useEffect(() => {
    const init = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(prof)
        const { data: mine } = await supabase
          .from('live_voice_chat_members')
          .select('group_id')
          .eq('group_id', groupId)
          .eq('user_id', authUser.id)
          .maybeSingle()
        setIsMember(!!mine)
      }
      await load()
    }
    void init()
  }, [groupId, load, supabase])

  // ── LIVE STATE (bug fix) ─────────────────────────────────────────────────
  // The room page used to fetch once on mount and go stale: after leaving a
  // call the Join button kept its old "N in call" label, and a call started
  // by someone else never appeared. Realtime on calls + participants keeps
  // everything honest, with a focus refetch as belt-and-braces.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel(`voice-room:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_voice_chat_calls', filter: `group_id=eq.${groupId}` },
        () => {
          void load()
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_voice_chat_participants' }, () => {
        void load()
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Realtime unavailable — fall back to gentle polling so the Join
          // button never lies.
          if (!pollRef.current) pollRef.current = setInterval(() => void load(), 15_000)
        }
      })

    // Refetch when the tab/page becomes visible again (e.g. back from call).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      void supabase.removeChannel(channel)
    }
  }, [groupId, supabase, load])

  const requireLogin = () => router.replace('/auth/login?redirect=' + encodeURIComponent(`/live-voice-chat/${groupId}`))

  const joinGroup = async (password?: string) => {
    if (!user) return requireLogin()
    // A private room shown to a non-member first asks for the password.
    if (password === undefined && group?.is_private && !isMember) {
      setPwPrompt(true)
      return
    }
    setBusy(true)
    setError('')
    setPwError('')
    const { error: rpcError } = await supabase.rpc('join_live_voice_chat_group', {
      p_group_id: groupId,
      p_password: password ?? null,
    })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    // FALSE without an error means the password did not match (or the room
    // became invisible). Say so instead of silently doing nothing.
    if (password !== undefined) {
      // re-check membership to confirm the join actually happened
      const { data: mine } = await supabase
        .from('live_voice_chat_members')
        .select('group_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!mine) {
        setPwError('Wrong password. Ask the room admin for the current one.')
        return
      }
    }
    setIsMember(true)
    setPwPrompt(false)
    setPwValue('')
    await load()
  }

  /**
   * SHARE THE ROOM — the system share sheet on a phone, the clipboard
   * everywhere else. The message carries the room's NAME, so what lands in the
   * chat reads like an invite: people were copying the bare UUID out of the
   * address bar ("link ajeeb hai") and it told the recipient nothing.
   */
  const shareRoom = async () => {
    const link =
      typeof window !== 'undefined'
        ? `${window.location.origin}/live-voice-chat/${groupId}`
        : `/live-voice-chat/${groupId}`
    const label = group?.name || 'our live voice room'
    const text = `Join "${label}" on ConnectToCampus — voice room for students`

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: group?.name || 'ConnectToCampus', text, url: link })
        return
      } catch (err) {
        // Dismissing the sheet is not a failure — do NOT fall through and copy
        // a link the user just said no to.
        if ((err as { name?: string } | null)?.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}: ${link}`)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      setError('Could not share the link. Copy it from the address bar instead.')
    }
  }

  const leaveGroup = async () => {
    if (!window.confirm(`Leave "${group?.name}"?`)) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('leave_live_voice_chat_group', { p_group_id: groupId })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    router.push('/live-voice-chat')
  }

  /**
   * Remove the room entirely. Offered to the creator and to a member whose
   * role is `admin`; the API also accepts a platform admin, who can do the same
   * from /admin → Content → Rooms. Members, calls and participants cascade.
   */
  const deleteRoom = async () => {
    if (!window.confirm(`Delete "${group?.name}" for everyone? This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/live-voice-chat/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not delete the room.')
        setBusy(false)
        return
      }
      router.push('/live-voice-chat')
    } catch {
      setError('Could not delete the room.')
      setBusy(false)
    }
  }

  /** Start a room, or join the one already running, then open the call UI. */
  const enterCall = async () => {
    if (!user) return requireLogin()
    setBusy(true)
    setError('')

    let callId = call?.id as string | undefined

    if (!callId) {
      const { data: started, error: startError } = await supabase.rpc('start_live_voice_chat_call', {
        p_group_id: groupId,
      })
      if (startError || !started) {
        setBusy(false)
        return setError(startError?.message || 'Could not start the call. Join the room first.')
      }
      callId = started as string
    } else {
      const { error: joinError } = await supabase.rpc('join_live_voice_chat_call', { p_call_id: callId })
      if (joinError) {
        setBusy(false)
        return setError(joinError.message)
      }
    }

    router.push(`/live-voice-chat/${groupId}/call?callId=${callId}`)
  }

  // LIVE ⇔ a call exists AND at least one participant is actually in it.
  // An 'active' call row full of crashed ghosts is NOT live.
  // Attendance for the latest session, once we are allowed to see it. RLS only
  // exposes participants of a room to its members; a non-member simply sees
  // nothing rather than a broken card.
  useEffect(() => {
    if (!group?.id || !isMember) return
    let cancelled = false
    void (async () => {
      try {
        const { data: lastCall } = await supabase
          .from('live_voice_chat_calls')
          .select('id, started_at, ended_at')
          .eq('group_id', group.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!lastCall || cancelled) return

        const { data: rows } = await supabase
          .from('live_voice_chat_participants')
          .select('user_id, joined_at, left_at')
          .eq('call_id', lastCall.id)
        if (cancelled || !rows?.length) return

        const end = lastCall.ended_at ? new Date(lastCall.ended_at).getTime() : Date.now()
        const people = new Set(rows.map((r: any) => r.user_id)).size
        const ms = rows.reduce((sum: number, r: any) => {
          const from = new Date(r.joined_at).getTime()
          const to = r.left_at ? new Date(r.left_at).getTime() : end
          return sum + Math.max(0, to - from)
        }, 0)
        setLastSession({
          minutes: Math.max(1, Math.round(ms / 60000)),
          people,
          live: !lastCall.ended_at,
        })
      } catch {
        // Quiet: attendance is context, not a blocker.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [group?.id, isMember, supabase])

  /** File a report against this room. Admins read these; members never see them. */
  const reportRoom = async () => {
    const reason = window.prompt('What is wrong with this room? This goes to the admins only.')
    if (!reason || reason.trim().length < 3) return
    try {
      const res = await fetch(`/api/live-voice-chat/groups/${groupId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not send the report.')
        return
      }
      setReported(true)
    } catch {
      setError('Could not send the report.')
    }
  }

  const isLive = !!call && participants.length > 0
  /* The creator and the room's own admins may remove the room. */
  const canDeleteRoom =
    !!user && (group?.created_by === user.id || members.some((m: any) => m.user_id === user.id && m.role === 'admin'))
  /* …and hand out co-admin power, which is what lets a co-admin run the call
     (mute people, keep order) when the owner is away. */
  const canPromote =
    !!user && (group?.created_by === user.id || members.some((m: any) => m.user_id === user.id && m.role === 'admin'))
  /* Who RUNS the room: locking it and silencing it are owner/admin/co-admin. */
  const myRole = members.find((m: any) => m.user_id === user?.id)?.role
  const canRunRoom = !!user && (group?.created_by === user.id || myRole === 'admin' || myRole === 'co-admin')
  /** Free4talk-style cap: how big this room may grow (admin's dial). */
  const roomSize = (group?.max_participants ?? null) as number | null
  const roomLocked = !!call?.locked
  const amInCall = participants.some((p: any) => p.user_id === user?.id)
  const atCapacity = roomSize !== null && participants.length >= roomSize
  /** Locked or full stops NEW people — never somebody already inside, and
   *  never whoever runs the room (they must always be able to get back in). */
  const shutOut = isLive && !amInCall && !canRunRoom && (roomLocked || atCapacity)

  const setRoomSize = async (next: number) => {
    const capped = Math.min(200, Math.max(2, next))
    if (capped === roomSize) return
    setSizeBusy(true)
    try {
      const { error: rpcError } = await supabase.rpc('set_live_voice_chat_room_size', {
        p_group_id: groupId,
        p_max: capped,
      })
      if (rpcError) throw new Error(rpcError.message)
      setGroup((g: any) => (g ? { ...g, max_participants: capped } : g))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the room size.')
    } finally {
      setSizeBusy(false)
    }
  }

  const toggleRoomLock = async () => {
    if (!call) return
    const next = !roomLocked
    setLockBusy(true)
    try {
      const { error: rpcError } = await supabase.rpc('set_live_voice_chat_call_lock', {
        p_call_id: call.id,
        p_locked: next,
      })
      if (rpcError) throw new Error(rpcError.message)
      setCall((c: any) => (c ? { ...c, locked: next } : c))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the lock.')
    } finally {
      setLockBusy(false)
    }
  }

  const promoteMember = async (userId: string, role: 'co-admin' | 'member') => {
    setRoleBusy(userId)
    try {
      // The role check lives in SQL (set_live_voice_chat_role): owner or
      // admin only, never the owner's own row, never yourself by accident.
      const { error: rpcError } = await supabase.rpc('set_live_voice_chat_role', {
        p_group_id: groupId,
        p_user_id: userId,
        p_role: role,
      })
      if (rpcError) throw new Error(rpcError.message)
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that role.')
    } finally {
      setRoleBusy(null)
    }
  }

  if (loading) {
    return (
      <Layout user={user} profile={profile}>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>Loading room…</p>
      </Layout>
    )
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <button
          onClick={() => router.push('/live-voice-chat')}
          aria-label="Back"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            color: 'var(--text-muted)',
            width: 44,
            height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            margin: '0 0 6px -12px',
          }}
        >
          <Icon name="chevron" size={22} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </button>

        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {group && (
          <>
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 20,
                marginBottom: 16,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                  }}
                  aria-hidden="true"
                >
                  <Icon name={voiceIcon(group.icon)} size={28} strokeWidth={2} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    {group.name}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {SECTION_LABELS[group.section] || 'Random'} · {group.scope === 'global' ? 'Global' : 'Campus'} ·{' '}
                    {members.length} member
                    {members.length === 1 ? '' : 's'}
                    {group.is_private && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginLeft: 6,
                          color: 'var(--warning-text)',
                          fontWeight: 600,
                        }}
                      >
                        <Icon name="lock" size={12} strokeWidth={2.4} />
                        Invite only
                      </span>
                    )}
                  </p>
                  {lastSession && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      {lastSession.live ? 'This session' : 'Last session'} · {lastSession.minutes} min ·{' '}
                      {lastSession.people} {lastSession.people === 1 ? 'student' : 'students'}
                    </p>
                  )}
                </div>
                {isLive && (
                  <span
                    style={{
                      background: 'var(--danger)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} aria-hidden="true" />
                    LIVE
                  </span>
                )}
              </div>

              {group.description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
                  {group.description}
                </p>
              )}

              {(canPromote || (canRunRoom && isLive)) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginBottom: 12,
                    padding: '9px 12px',
                    border: '1px dashed var(--border)',
                    borderRadius: 12,
                    background: 'var(--bg-secondary)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {canPromote && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      Room size
                      <button
                        onClick={() => void setRoomSize((roomSize ?? participants.length) - 1)}
                        disabled={sizeBusy || (roomSize ?? 2) <= 2}
                        aria-label="Decrease the room size"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--text-primary)',
                          cursor: sizeBusy ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >
                        −
                      </button>
                      <strong style={{ color: 'var(--text-primary)', minWidth: 58, textAlign: 'center' }}>
                        {participants.length}
                        {roomSize !== null ? ` / ${roomSize}` : ''}
                      </strong>
                      <button
                        onClick={() => void setRoomSize((roomSize ?? participants.length) + 1)}
                        disabled={sizeBusy || (roomSize ?? 0) >= 200}
                        aria-label="Increase the room size"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--text-primary)',
                          cursor: sizeBusy ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >
                        +
                      </button>
                    </span>
                  )}

                  {canRunRoom && isLive && (
                    <button
                      onClick={() => void toggleRoomLock()}
                      disabled={lockBusy}
                      aria-pressed={roomLocked}
                      style={{
                        marginLeft: 'auto',
                        minHeight: 34,
                        padding: '0 12px',
                        borderRadius: 9,
                        border: 'none',
                        background: roomLocked ? 'var(--accent)' : 'var(--bg-tertiary)',
                        color: roomLocked ? 'var(--on-accent)' : 'var(--text-primary)',
                        fontSize: 12.5,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: lockBusy ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon name={roomLocked ? 'lock' : 'unlock'} size={14} strokeWidth={2.2} />
                      {lockBusy ? '…' : roomLocked ? 'Locked — tap to open' : 'Lock the room'}
                    </button>
                  )}
                </div>
              )}

              {shutOut && (
                <p
                  role="status"
                  style={{
                    margin: '0 0 12px',
                    padding: '9px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--danger)',
                    background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  }}
                >
                  {roomLocked
                    ? 'This room is locked — the host has to let you in.'
                    : `This room is full (${participants.length}/${roomSize}). An admin has to make it bigger.`}
                </p>
              )}

              {isMember ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={enterCall}
                    disabled={busy || shutOut}
                    style={{
                      flex: 1,
                      background:
                        busy || shutOut
                          ? 'var(--disabled)'
                          : isLive
                            ? 'var(--success, var(--accent))'
                            : 'var(--accent)',
                      color: 'var(--on-accent)',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: busy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {busy ? (
                      'Connecting…'
                    ) : (
                      <>
                        <Icon name="mic" size={17} strokeWidth={2.2} />
                        {shutOut
                          ? roomLocked
                            ? 'Room is locked'
                            : 'Room is full'
                          : isLive
                            ? `Join call (${participants.length} in)`
                            : 'Start voice chat'}
                      </>
                    )}
                  </button>
                  {/* EVERY room is shareable — not just locked ones. Locked
                      rooms still need the password on top, but a public room
                      shared as a raw UUID read as broken to whoever got it. */}
                  <button
                    onClick={shareRoom}
                    title="Share this room — opens your phone's share sheet, or copies the link"
                    aria-label="Share this room"
                    style={{
                      background: 'var(--bg)',
                      color: inviteCopied ? 'var(--success-text)' : 'var(--accent-text)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="link" size={15} strokeWidth={2.2} />
                    {inviteCopied ? 'Copied' : 'Share'}
                  </button>
                  <button
                    onClick={leaveGroup}
                    disabled={busy}
                    style={{
                      background: 'var(--bg)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 18px',
                      fontSize: 14,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Leave
                  </button>
                  <button
                    onClick={reportRoom}
                    disabled={reported}
                    title="Report this room to the admins"
                    style={{
                      background: 'none',
                      color: reported ? 'var(--success-text)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px 8px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: reported ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={reported ? 'check' : 'shield'} size={14} strokeWidth={2.2} />
                    {reported ? 'Reported' : 'Report'}
                  </button>
                  {canDeleteRoom && (
                    <button
                      onClick={deleteRoom}
                      disabled={busy}
                      title="Delete this room for everyone"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--danger)',
                        border: '1px solid var(--danger)',
                        borderRadius: 10,
                        padding: '12px 16px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="trash" size={15} strokeWidth={2.2} />
                      Delete room
                    </button>
                  )}
                </div>
              ) : pwPrompt ? (
                /* Password prompt for private rooms — the admin shared this
                   password with the people who are allowed inside. */
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void joinGroup(pwValue)
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <p
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      margin: 0,
                    }}
                  >
                    <Icon name="lock" size={15} strokeWidth={2.2} />
                    This room is invite-only. Enter the password the admin shared with you.
                  </p>
                  <input
                    type="password"
                    value={pwValue}
                    onChange={(e) => setPwValue(e.target.value)}
                    placeholder="Room password"
                    autoComplete="off"
                    autoFocus
                    style={{
                      width: '100%',
                      border: pwError ? '1px solid var(--danger)' : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '11px 14px',
                      fontSize: 14,
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--text-primary)',
                      background: 'var(--bg)',
                      boxSizing: 'border-box',
                    }}
                  />
                  {pwError && <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: 0 }}>{pwError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="submit"
                      disabled={busy || pwValue.trim().length === 0}
                      style={{
                        flex: 1,
                        background: pwValue.trim() && !busy ? 'var(--accent)' : 'var(--disabled)',
                        color: 'var(--on-accent)',
                        border: 'none',
                        borderRadius: 10,
                        padding: '11px',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: pwValue.trim() && !busy ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                      }}
                    >
                      {busy ? 'Checking…' : 'Unlock & join'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPwPrompt(false)
                        setPwError('')
                        setPwValue('')
                      }}
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '11px 18px',
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => void joinGroup()}
                  disabled={busy}
                  style={{
                    width: '100%',
                    background: busy ? 'var(--disabled)' : 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {busy ? (
                    'Joining…'
                  ) : (
                    <>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          justifyContent: 'center',
                        }}
                      >
                        {group.is_private && <Icon name="lock" size={16} strokeWidth={2.2} />}
                        {group.is_private ? 'Enter password to join' : 'Join room'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
              {isLive ? `In the call now (${participants.length})` : 'Members'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No members yet.</p>
              ) : (
                members
                  // While a call is live, show who is actually in it, on top.
                  .slice()
                  .sort((a, b) => {
                    if (!isLive) return 0
                    const aIn = participants.some((p) => p.user_id === a.user_id) ? 0 : 1
                    const bIn = participants.some((p) => p.user_id === b.user_id) ? 0 : 1
                    return aIn - bIn
                  })
                  .map((m) => {
                    const inCall = participants.some((p) => p.user_id === m.user_id)
                    return (
                      <div
                        key={m.user_id}
                        style={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: inCall ? 'var(--success, var(--accent))' : 'var(--bg-secondary)',
                            color: 'var(--on-accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {initials(m.name)}
                        </div>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name}
                          {m.user_id === user?.id ? ' (You)' : ''}
                        </span>
                        {m.role === 'admin' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Admin</span>
                        )}
                        {m.role === 'co-admin' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Co-admin</span>
                        )}
                        {canPromote && m.role !== 'admin' && m.user_id !== user?.id && (
                          <button
                            onClick={() => void promoteMember(m.user_id, m.role === 'co-admin' ? 'member' : 'co-admin')}
                            disabled={roleBusy === m.user_id}
                            aria-label={
                              m.role === 'co-admin' ? `Remove co-admin from ${m.name}` : `Make ${m.name} a co-admin`
                            }
                            style={{
                              minHeight: 30,
                              padding: '0 10px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: m.role === 'co-admin' ? 'var(--accent)' : 'var(--bg-secondary)',
                              color: m.role === 'co-admin' ? 'var(--on-accent)' : 'var(--text-primary)',
                              fontSize: 11.5,
                              fontWeight: 700,
                              fontFamily: 'inherit',
                              cursor: roleBusy === m.user_id ? 'wait' : 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            {roleBusy === m.user_id ? '…' : m.role === 'co-admin' ? 'Remove co-admin' : 'Make co-admin'}
                          </button>
                        )}
                        {inCall && (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--success-text, var(--accent))',
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span
                              style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }}
                              aria-hidden="true"
                            />
                            in call
                          </span>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
