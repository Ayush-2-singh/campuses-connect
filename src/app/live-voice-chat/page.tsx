'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms } from '@/lib/liveVoice'
import Layout from '@/components/Layout'
import SectionShell from '@/components/SectionShell'
import { Icon } from '@/components/icons'
import { voiceIcon } from '@/lib/liveVoice'
import {
  CATEGORY_SECTIONS,
  ROOM_CATEGORIES,
  ROOM_SECTIONS,
  SECTION_LABEL,
  sectionsForCategory,
  type RoomCategoryId,
} from '@/lib/rooms'

/**
 * Live Voice Chat — student-created voice groups, filed under a section.
 *
 * The section taxonomy lives in src/lib/rooms.ts (ROOM_SECTIONS) and must stay
 * in sync with the CHECK constraint on live_voice_chat_groups.section — the
 * database rejects anything else, and the RPC silently falls back to 'random'.
 *
 * Rooms are browsed and created through the CATEGORY the product already uses
 * (Games / Learn / Language / Discuss / Build) and then the exact TOPIC inside
 * it (DSA, Web Dev, Java, …), so the picker never shows one flat wall of '#'. */

/** Icon names — stored on the group row, rendered through the shared set. */
const ICONS = ['mic', 'layers', 'message', 'globe', 'type', 'shuffle', 'book', 'rocket']

/** A compact secondary chip — the topic row under the category row. */
const topicChip = (active: boolean) => ({
  flexShrink: 0,
  whiteSpace: 'nowrap' as const,
  padding: '6px 12px',
  borderRadius: 999,
  border: active ? 'none' : '1px solid var(--border)',
  background: active ? 'var(--accent-light)' : 'var(--bg)',
  color: active ? 'var(--accent-text)' : 'var(--text-muted)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer' as const,
  fontFamily: 'inherit',
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 6,
})

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
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Invite-only rooms are not listed here, so an invited student pastes the
  // link they were sent to open the room (and then the password prompt).
  const [inviteInput, setInviteInput] = useState('')
  // Two-level browsing: a top-level category, then the exact topic inside it.
  const [category, setCategory] = useState<RoomCategoryId | 'all'>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [liveOnly, setLiveOnly] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'mic',
    section: 'random',
    scope: 'campus' as 'campus' | 'global',
    isPrivate: false,
    password: '',
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

  const join = async (groupId: string, password?: string) => {
    if (!user) return requireLogin()
    if (memberships.includes(groupId) && password === undefined) {
      router.push(`/live-voice-chat/${groupId}`)
      return
    }
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('join_live_voice_chat_group', {
      p_group_id: groupId,
      p_password: password ?? null,
    })
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
      p_is_private: form.isPrivate,
      p_password: form.isPrivate ? form.password : null,
    })
    setBusy(false)

    if (rpcError || !groupId) {
      // The RPC returns NULL (not an error) when the caller isn't allowed to
      // create this scope — most often a student with no campus asking for a
      // campus group, or a private room with a too-short password.
      setError(
        rpcError?.message ||
          (form.isPrivate && form.password.trim().length < 4
            ? 'Private rooms need a password of at least 4 characters.'
            : form.scope === 'campus'
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
      isPrivate: false,
      password: '',
    })
    setShowCreate(false)
    router.push(`/live-voice-chat/${groupId}`)
  }

  /**
   * Open the create panel, pre-seeded with the topic being browsed.
   *
   * Browsing "Java" and pressing "+ New Room" used to open the form on
   * whatever section was last chosen (`random` on first load), so the room the
   * student thought they were creating for Java silently landed somewhere
   * else. The browsed topic is now the default, and the snippet below keeps the
   * picker in sync while the panel is open.
   */
  const openCreate = () => {
    if (showCreate) {
      setShowCreate(false)
      return
    }
    if (sectionFilter !== 'all') setForm((f) => ({ ...f, section: sectionFilter }))
    setShowCreate(true)
  }

  /** Open a room from a pasted invite link (or a bare room id). */
  const openInvite = () => {
    const raw = inviteInput.trim()
    if (!raw) return
    const id = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    if (!id) {
      setError('That does not look like a room invite. Paste the full link you were sent.')
      return
    }
    router.push(`/live-voice-chat/${id}`)
  }

  // Filter: an exact topic wins; otherwise the whole category; otherwise all.
  // The text search and "live now" filter stack on top of that, and live rooms
  // sort first — a silent room from last week should never outrank one where
  // people are talking right now.
  const visible = useMemo(() => {
    let rows = groups
    if (sectionFilter !== 'all') rows = rows.filter((g) => g.section === sectionFilter)
    else if (category !== 'all') rows = rows.filter((g) => CATEGORY_SECTIONS[category].includes(g.section))

    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (g) =>
          String(g.name || '')
            .toLowerCase()
            .includes(q) ||
          String(g.description || '')
            .toLowerCase()
            .includes(q)
      )
    }
    if (liveOnly) rows = rows.filter((g) => (liveByGroup[g.id] || 0) > 0)

    return [...rows].sort((a, b) => {
      const byLive = (liveByGroup[b.id] || 0) - (liveByGroup[a.id] || 0)
      if (byLive !== 0) return byLive
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [groups, sectionFilter, category, query, liveOnly, liveByGroup])

  // The topics offered for the current category (every topic under 'All').
  const browsableSections = category === 'all' ? ROOM_SECTIONS : sectionsForCategory(category)
  const activeFilterLabel =
    sectionFilter !== 'all'
      ? SECTION_LABEL[sectionFilter] || 'Rooms'
      : category !== 'all'
        ? ROOM_CATEGORIES.find((c) => c.id === category)?.label || 'Rooms'
        : 'All'

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
                  label: showCreate
                    ? 'Cancel'
                    : sectionFilter !== 'all'
                      ? `+ New Room in ${activeFilterLabel}`
                      : '+ New Room',
                  primary: true,
                  icon: 'plus',
                  onClick: openCreate,
                },
              ]
            : undefined
        }
      >
        {/* Invite entry — locked rooms are hidden from the list below, so the
            only way in is the link (or id) the room admin shared. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg)',
            border: '1px dashed var(--border-strong, var(--border))',
            borderRadius: 12,
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-text)', flexShrink: 0 }} aria-hidden="true">
            <Icon name="link" size={16} strokeWidth={2.2} />
          </span>
          <input
            type="text"
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && openInvite()}
            placeholder="Got an invite link? Paste it here to open the locked room"
            aria-label="Paste a room invite link"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={openInvite}
            disabled={!inviteInput.trim()}
            style={{
              flexShrink: 0,
              background: inviteInput.trim() ? 'var(--accent)' : 'var(--disabled)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: inviteInput.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            Open
          </button>
        </div>

        {/* Browse — the category the product already uses… */}
        <div
          className="scrollbar-hide chip-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 4 }}
        >
          {[{ id: 'all' as const, label: 'All', icon: 'sparkles' }, ...ROOM_CATEGORIES].map((c) => {
            const active = category === c.id
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCategory(c.id)
                  setSectionFilter('all')
                }}
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
                <Icon name={c.icon} size={14} strokeWidth={2.2} />
                {c.label}
              </button>
            )
          })}
        </div>

        {/* …then the exact topic inside it: DSA, Web Dev, Java, Python, … */}
        <div
          className="scrollbar-hide chip-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}
        >
          <button onClick={() => setSectionFilter('all')} style={topicChip(sectionFilter === 'all')}>
            <Icon name="sparkles" size={13} strokeWidth={2.2} />
            All topics
          </button>
          {browsableSections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSectionFilter(s.id)
                // A room created from this view must belong to this topic.
                if (showCreate) setForm((f) => ({ ...f, section: s.id }))
              }}
              style={topicChip(sectionFilter === s.id)}
            >
              <Icon name={s.icon} size={13} strokeWidth={2.2} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Search + live-only: with 100 rooms loaded, a topic chip alone is not
            discovery. Rooms with people in them lead the list (see `visible`). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 12px',
            }}
          >
            <Icon name="search" size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms by name or topic"
              aria-label="Search rooms"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  padding: 0,
                }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => setLiveOnly((v) => !v)}
            aria-pressed={liveOnly}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 10,
              border: liveOnly ? 'none' : '1px solid var(--border)',
              background: liveOnly ? 'var(--accent)' : 'var(--bg)',
              color: liveOnly ? 'var(--on-accent)' : 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: liveOnly ? 'var(--on-accent)' : 'var(--success-text)',
              }}
            />
            Live now
          </button>
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
                {/* Topic picker — grouped by category so every real section
                    (DSA, Web Dev, Java, Python, SQL, AI/ML, English, …) is one
                    scroll away instead of a flat wall. */}
                <select
                  value={form.section}
                  onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                  aria-label="Room topic"
                >
                  {ROOM_CATEGORIES.map((c) => (
                    <optgroup key={c.id} label={c.label}>
                      {sectionsForCategory(c.id).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
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

              {/* Private room toggle + password — only the people the admin
                  shares the password with can join. */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.isPrivate}
                  onChange={(e) => setForm((f) => ({ ...f, isPrivate: e.target.checked, password: '' }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="lock" size={14} strokeWidth={2.2} />
                  Locked room — invite only. Only people you send the link + password to can join
                </span>
              </label>
              {form.isPrivate && (
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Room password * (min 4 characters)"
                  autoComplete="new-password"
                  style={inputStyle}
                  maxLength={40}
                />
              )}
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
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 14px' }}>
                {query || liveOnly ? 'No rooms match those filters.' : `No rooms in ${activeFilterLabel} yet`}
              </p>
              {/* Empty state carries the action: the student is already on the
                  topic they want, so creating one is a single click away. */}
              <button
                onClick={user ? openCreate : requireLogin}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 16px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="plus" size={15} strokeWidth={2.4} />
                {user ? `Create a room in ${activeFilterLabel}` : 'Sign in to create a room'}
              </button>
            </div>
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
                      {g.is_private && (
                        <span
                          title="Private room — password required"
                          aria-label="Private room"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: 'var(--warning-text)',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name="lock" size={13} strokeWidth={2.4} />
                        </span>
                      )}
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
                      {(SECTION_LABEL[g.section] || 'Random') + (g.scope === 'global' ? ' · Global' : ' · Campus')}
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
