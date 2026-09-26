'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'

const SECTION_LABELS: Record<string, string> = {
  dsa: '🧩 DSA',
  discussion: '💬 Discussion',
  'web-dev': '🌐 Web Dev',
  english: '🔤 English',
  random: '🎲 Random',
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

  /**
   * Member names are fetched in a second query rather than embedded.
   * `live_voice_chat_members.user_id` references auth.users(id), not
   * profiles(id), so PostgREST has no relationship to embed across — asking
   * for `profiles(...)` here would fail the whole select.
   */
  const load = useCallback(async () => {
    const { data: groupRow, error: groupError } = await supabase
      .from('live_voice_chat_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError) {
      setError(groupError.message)
      setLoading(false)
      return
    }
    if (!groupRow) {
      setError('This room does not exist, or it is a campus room you cannot see.')
      setLoading(false)
      return
    }
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

    const { data: callRow } = await supabase
      .from('live_voice_chat_calls')
      .select('id, status, started_at')
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

  const joinGroup = async () => {
    if (!user) return requireLogin()
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('join_live_voice_chat_group', { p_group_id: groupId })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    setIsMember(true)
    await load()
  }

  const leaveGroup = async () => {
    if (!window.confirm(`Leave "${group?.name}"?`)) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('leave_live_voice_chat_group', { p_group_id: groupId })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    router.push('/live-voice-chat')
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
          ←
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
                <span style={{ fontSize: 40 }}>{group.icon || '🎙️'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    {group.name}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {SECTION_LABELS[group.section] || '🎲 Random'} ·{' '}
                    {group.scope === 'global' ? '🌐 Global' : '🏫 Campus'} · {members.length} member
                    {members.length === 1 ? '' : 's'}
                  </p>
                </div>
                {call && (
                  <span
                    style={{
                      background: 'var(--danger)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      flexShrink: 0,
                    }}
                  >
                    ● LIVE
                  </span>
                )}
              </div>

              {group.description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
                  {group.description}
                </p>
              )}

              {isMember ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={enterCall}
                    disabled={busy}
                    style={{
                      flex: 1,
                      background: busy ? 'var(--disabled)' : call ? 'var(--success, var(--accent))' : 'var(--accent)',
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
                    {busy ? 'Connecting…' : call ? `🎧 Join call (${participants.length} in)` : '🎙️ Start voice chat'}
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
                </div>
              ) : (
                <button
                  onClick={joinGroup}
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
                  {busy ? 'Joining…' : 'Join room'}
                </button>
              )}
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
              {call ? `In the call now (${participants.length})` : 'Members'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No members yet.</p>
              ) : (
                members
                  // While a call is live, show who is actually in it, on top.
                  .slice()
                  .sort((a, b) => {
                    if (!call) return 0
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
                        {inCall && (
                          <span style={{ fontSize: 11, color: 'var(--success-text, var(--accent))', flexShrink: 0 }}>
                            🔴 in call
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
