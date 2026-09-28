'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms } from '@/lib/liveVoice'
import Layout from '@/components/Layout'
import SectionShell from '@/components/SectionShell'
import { Icon } from '@/components/icons'
import { voiceIcon } from '@/lib/liveVoice'

/**
 * Live Voice Chat — student-created voice groups, filed under a section.
 *
 * Sections are the organising unit on this page. Their `key`s must stay in
 * sync with the CHECK constraint on `live_voice_chat_groups.section` (see
 * supabase/migrations/20260920_live_voice_chat.sql) — the database rejects
 * anything else, and the RPC silently falls back to 'random'.
 */
const SECTIONS = [
  { key: 'all', label: 'All', icon: 'sparkles' },
  { key: 'dsa', label: 'DSA', icon: 'layers' },
  { key: 'discussion', label: 'Discussion', icon: 'message' },
  { key: 'web-dev', label: 'Web Dev', icon: 'globe' },
  { key: 'english', label: 'English', icon: 'type' },
  { key: 'random', label: 'Random', icon: 'shuffle' },
] as const

/** Icon names — stored on the group row, rendered through the shared set. */
const ICONS = ['mic', 'layers', 'message', 'globe', 'type', 'shuffle', 'book', 'rocket']

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--bg)',
  boxSizing: 'border-box' as const,
}

export default function LiveVoiceChatPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const [liveByGroup, setLiveByGroup] = useState<Record<string, number>>({})
  const [section, setSection] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'mic',
    section: 'random',
    scope: 'campus' as 'campus' | 'global',
  })
  const router = useRouter()
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data, error: groupsError } = await supabase
      .from('live_voice_chat_groups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (groupsError) {
      // Surface the real reason — a silent empty list is what made this page
      // undiagnosable before.
      setError(groupsError.message)
      setGroups([])
      return
    }
    setGroups(data || [])
  }, [supabase])

  /**
   * LIVE ⇔ at least one user is ACTUALLY inside the room right now — a
   * heartbeat-fresh participant, not merely an 'active' call row (crashed
   * tabs leave those behind for hours). Single source of truth shared with
   * every other voice surface: live_voice_chat_live_rooms().
   */
  const loadLive = useCallback(async () => {
    const rooms = await fetchLiveVoiceRooms(supabase)
    const next: Record<string, number> = {}
    for (const r of rooms) next[r.groupId] = r.participantCount
    setLiveByGroup(next)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        // Default the new-group scope to whatever the student actually has.
        const { data: prof } = await supabase
          .from('profiles')
          .select('*, campuses(name)')
          .eq('id', authUser.id)
          .single()
        setProfile(prof)
        if (!prof?.campus_id) setForm((f) => ({ ...f, scope: 'global' }))

        const { data: mem } = await supabase
          .from('live_voice_chat_members')
          .select('group_id')
          .eq('user_id', authUser.id)
        setMemberships((mem || []).map((m: any) => m.group_id))
      }
      await load()
      await loadLive()
    }
    void init()
  }, [load, loadLive, supabase])

  // LIVE must never go stale: refetch on realtime call events, on tab focus,
  // and on a gentle 30s tick while visible (realtime events only reach group
  // members — the tick keeps non-members' badges honest too).
  useEffect(() => {
    const channel = supabase
      .channel('lvc-hub-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_voice_chat_calls' }, () => {
        void loadLive()
      })
      .subscribe()

    const refresh = () => {
      if (document.visibilityState === 'visible') void loadLive()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 30_000)

    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [supabase, loadLive])

  const requireLogin = () => {
    router.replace(
      '/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')
    )
  }

  const join = async (groupId: string) => {
    if (!user) return requireLogin()
    if (memberships.includes(groupId)) {
      router.push(`/live-voice-chat/${groupId}`)
      return
    }
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('join_live_voice_chat_group', { p_group_id: groupId })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    setMemberships((m) => [...m, groupId])
    router.push(`/live-voice-chat/${groupId}`)
  }

  const create = async () => {
    if (!user) return requireLogin()
    if (!form.name.trim()) return
    setBusy(true)
    setError('')
    const { data: groupId, error: rpcError } = await supabase.rpc('create_live_voice_chat_group', {
      p_name: form.name.trim(),
      p_description: form.description.trim() || null,
      p_icon: form.icon,
      p_scope: form.scope,
      p_section: form.section,
    })
    setBusy(false)

    if (rpcError || !groupId) {
      // The RPC returns NULL (not an error) when the caller isn't allowed to
      // create this scope — most often a student with no campus asking for a
      // campus group.
      setError(
        rpcError?.message ||
          (form.scope === 'campus'
            ? 'Could not create a campus group. Add your campus in your profile, or pick Global.'
            : 'Could not create the group. Please try again.')
      )
      return
    }

    setMemberships((m) => [...m, groupId as string])
    setForm({
      name: '',
      description: '',
      icon: 'mic',
      section: 'random',
      scope: profile?.campus_id ? 'campus' : 'global',
    })
    setShowCreate(false)
    router.push(`/live-voice-chat/${groupId}`)
  }

  const visible = useMemo(
    () => (section === 'all' ? groups : groups.filter((g) => g.section === section)),
    [groups, section]
  )

  const activeSection = SECTIONS.find((s) => s.key === section) || SECTIONS[0]

  return (
    <Layout user={user} profile={profile}>
      <SectionShell
        icon="mic"
        title="Live Voice Chat"
        subtitle="Jump into a room and talk with students"
        stats={[{ value: groups.length, label: 'Rooms' }]}
        actions={
          user
            ? [
                {
                  label: showCreate ? 'Cancel' : '+ New Room',
                  primary: true,
                  icon: 'plus',
                  onClick: () => setShowCreate((s) => !s),
                },
              ]
            : undefined
        }
      >
        {/* Section filter — the sections the product asked for, in order. */}
        <div
          className="scrollbar-hide chip-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}
        >
          {SECTIONS.map((s) => {
            const active = s.key === section
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                style={{
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? 'none' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--bg)',
                  color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name={s.icon} size={14} strokeWidth={2.2} />
                {s.label}
              </button>
            )
          })}
        </div>

        {showCreate && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 20,
              marginBottom: 20,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>
              New voice room
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Room name * (e.g. DSA Doubt Solving)"
                style={inputStyle}
                maxLength={60}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select
                  value={form.section}
                  onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                >
                  {SECTIONS.filter((s) => s.key !== 'all').map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  value={form.scope}
                  onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as 'campus' | 'global' }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                >
                  {profile?.campus_id && (
                    <option value="campus">My campus — {profile?.campuses?.name || 'your campus'}</option>
                  )}
                  <option value="global">Global — every student in India</option>
                </select>
              </div>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this room for? (optional)"
                rows={2}
                style={{ ...inputStyle, resize: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setForm((f) => ({ ...f, icon }))}
                    aria-label={`Use ${icon}`}
                    style={{
                      width: 38,
                      height: 38,
                      display: 'grid',
                      placeItems: 'center',
                      padding: 0,
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: form.icon === icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: form.icon === icon ? 'var(--accent-light)' : 'var(--bg)',
                      color: form.icon === icon ? 'var(--accent-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon name={icon} size={18} strokeWidth={2.2} />
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={create}
              disabled={!form.name.trim() || busy}
              style={{
                marginTop: 12,
                width: '100%',
                background: form.name.trim() && !busy ? 'var(--accent)' : 'var(--disabled)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '11px',
                fontSize: 14,
                fontWeight: 600,
                cursor: form.name.trim() && !busy ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              {busy ? 'Creating…' : 'Create room'}
            </button>
          </div>
        )}

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
              No rooms in {activeSection.label} yet
            </p>
          ) : (
            visible.map((g) => {
              const isMember = memberships.includes(g.id)
              const isLive = (liveByGroup[g.id] || 0) > 0
              return (
                <div
                  key={g.id}
                  className="lvc-room"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 13,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      background: 'var(--accent-light)',
                      color: 'var(--accent-text)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon name={voiceIcon(g.icon)} size={22} strokeWidth={2} />
                  </span>
                  {/* flex/min-width live in CSS (.lvc-info), not inline —
                      an inline `flex: 1` would override the mobile media
                      query's flex-basis and squeeze the LIVE badge/desc
                      into ~100px next to the Join button. */}
                  <div className="lvc-info">
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: '0 0 3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                      </span>
                      {isLive && (
                        <span
                          style={{
                            background: 'var(--danger)',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            flexShrink: 0,
                          }}
                        >
                          LIVE
                        </span>
                      )}
                    </p>
                    <p className="lvc-desc" style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      {(SECTIONS.find((s) => s.key === g.section)?.label || 'Random') +
                        (g.scope === 'global' ? ' · Global' : ' · Campus')}
                      {g.description ? ` · ${g.description}` : ''}
                    </p>
                  </div>
                  <button
                    className="lvc-join"
                    onClick={() => join(g.id)}
                    disabled={busy}
                    style={{
                      background: isMember ? 'var(--bg-secondary)' : 'var(--accent)',
                      color: isMember ? 'var(--text-secondary)' : 'var(--on-accent)',
                      border: isMember ? '1px solid var(--border)' : 'none',
                      padding: '7px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    {isMember ? (isLive ? 'Join call' : 'Open') : 'Join'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </SectionShell>
    </Layout>
  )
}
