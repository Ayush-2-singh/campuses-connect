'use client'

/**
 * GROUPS — Telegram-style user-created groups inside the verified campus.
 *
 * Three surfaces, one page:
 *   • MY GROUPS     — approved memberships, one tap into the chat room
 *   • DISCOVER      — open/approval groups at the user's campus
 *   • JOIN BY CODE  — CC-GRP-XXXX from a friend's invite
 * plus the create sheet (name, icon, description, join model).
 *
 * Design rules from the research conversation: groups are campus-bound and
 * capped at 200 (Verge/Vox: 53% want ≤200; Dunbar ≈150), and moderation is
 * first-class because student groups die of noise, not lack of features.
 * The room itself is the existing /chat/[key] page — no second chat engine.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'

interface GroupRow {
  id: string
  key: string
  name: string
  description: string | null
  icon: string | null
  visibility: 'open' | 'approval' | 'private'
  member_cap: number
  invite_code: string | null
  created_by: string | null
  member_count?: number
  my_role?: string | null
}

const JOIN_ICONS = ['📘', '🎯', '🛠️', '🏆', '🧪', '🎭', '🏠', '♟️', '🎬', '☕']

const VISIBILITY_META: Record<GroupRow['visibility'], { label: string; hint: string }> = {
  open: { label: 'Open', hint: 'Anyone with the code (or on your campus) joins directly' },
  approval: { label: 'Approval', hint: 'People ask to join; you approve' },
  private: { label: 'Private', hint: 'Only the invite code gets people in' },
}

export default function GroupsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [myGroups, setMyGroups] = useState<GroupRow[]>([])
  const [discover, setDiscover] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: '📘',
    visibility: 'open' as GroupRow['visibility'],
  })

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    setUser(user)
    if (!user) {
      router.replace('/auth/login?redirect=/groups')
      return
    }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    // My approved groups, with role + member count.
    const { data: mine } = await supabase
      .from('community_members')
      .select(
        'role, status, communities(id, key, name, description, icon, visibility, member_cap, invite_code, created_by)'
      )
      .eq('user_id', user.id)
      .eq('status', 'approved')
    const myRows: GroupRow[] = ((mine as any[]) || [])
      .map((r) => ({ ...(r.communities || {}), my_role: r.role }))
      .filter((g) => g.id && g.created_by) // user groups only — global rooms live in Live Chat
    setMyGroups(myRows)

    // Discoverable at my campus: non-global, active, not already mine.
    const mineIds = new Set(myRows.map((g) => g.id))
    const q = supabase
      .from('communities')
      .select('id, key, name, description, icon, visibility, member_cap, invite_code, created_by')
      .eq('is_global', false)
      .eq('is_active', true)
      .neq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (prof?.campus_id) q.eq('campus_id', prof.campus_id)
    const { data: disc } = await q
    setDiscover(((disc as any[]) || []).filter((g) => !mineIds.has(g.id)))

    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const createGroup = async () => {
    if (!form.name.trim() || creating) return
    setCreating(true)
    try {
      const { data, error } = await supabase.rpc('create_user_group', {
        p_name: form.name.trim(),
        p_description: form.description.trim() || null,
        p_visibility: form.visibility,
        p_icon: form.icon,
      })
      if (error || !data) throw new Error(error?.message || 'Could not create the group')
      router.push(`/chat/${data}`)
    } catch (e: any) {
      setCodeMsg({ ok: false, text: e.message || 'Could not create the group' })
    } finally {
      setCreating(false)
    }
  }

  const joinByCode = async () => {
    const clean = code.trim().toUpperCase()
    if (!clean || codeMsg?.text.startsWith('Joining')) return
    setCodeMsg({ ok: true, text: 'Joining…' })
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: clean })
    if (error) {
      setCodeMsg({ ok: false, text: 'Something went wrong — try again' })
      return
    }
    switch (data) {
      case 'joined':
        setCodeMsg({ ok: true, text: 'Joined! Taking you there…' })
        void load()
        break
      case 'pending':
        setCodeMsg({ ok: true, text: 'Request sent — an admin will approve you' })
        void load()
        break
      case 'already':
        setCodeMsg({ ok: true, text: 'You are already a member' })
        break
      case 'full':
        setCodeMsg({ ok: false, text: 'That group is full (200 cap keeps it human-sized)' })
        break
      case 'not_found':
      default:
        setCodeMsg({ ok: false, text: 'No group found for that code' })
    }
  }

  const discoverJoin = async (g: GroupRow) => {
    if (!g.invite_code) return
    setCodeMsg(null)
    const { data } = await supabase.rpc('join_group_by_code', { p_code: g.invite_code })
    if (data === 'joined' || data === 'pending') {
      router.push(data === 'joined' ? `/chat/${g.key}` : '/groups')
    }
  }

  const copyCode = (c: string) => {
    try {
      void navigator.clipboard.writeText(c)
    } catch {
      /* clipboard unavailable */
    }
  }

  const GroupCard = ({ g, mine }: { g: GroupRow; mine?: boolean }) => (
    <button
      onClick={() => mine && router.push(`/chat/${g.key}`)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 16px',
        cursor: mine ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: 'var(--shadow-sm)',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }}>{g.icon || '👥'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</span>
          {g.my_role && g.my_role !== 'member' && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.05em',
                padding: '1px 6px',
                borderRadius: 6,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                textTransform: 'uppercase',
              }}
            >
              {g.my_role}
            </span>
          )}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {g.description || VISIBILITY_META[g.visibility]?.label}
        </span>
        {!mine && (
          <span style={{ display: 'inline-flex', gap: 8, marginTop: 8 }}>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                void discoverJoin(g)
              }}
              onKeyDown={(e) => e.key === 'Enter' && void discoverJoin(g)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: 8,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                cursor: 'pointer',
              }}
            >
              {g.visibility === 'approval' ? 'Request to join' : 'Join'}
            </span>
          </span>
        )}
        {mine && g.invite_code && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              copyCode(g.invite_code!)
            }}
            onKeyDown={(e) => e.key === 'Enter' && copyCode(g.invite_code!)}
            title="Copy invite code — share it in any chat"
            style={{
              display: 'inline-flex',
              marginTop: 6,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px dashed var(--border-strong, var(--border))',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {g.invite_code} ⧉
          </span>
        )}
      </span>
      <span style={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}>{mine ? '→' : ''}</span>
    </button>
  )

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Groups</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Your circles, your rules — verified students only
            </p>
          </div>
          <button
            onClick={() => setShowCreate((s) => !s)}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            + New group
          </button>
        </div>

        {/* Create sheet */}
        {showCreate && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 18,
              marginBottom: 20,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Create a group
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {JOIN_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                  style={{
                    fontSize: 20,
                    padding: '6px 9px',
                    borderRadius: 10,
                    border: form.icon === ic ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: form.icon === ic ? 'var(--accent-light)' : 'var(--bg)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={60}
              placeholder="Group name (e.g. CSE 3rd Sem Batch)"
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 14,
                marginBottom: 8,
                fontFamily: 'inherit',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={120}
              placeholder="What is this group for? (optional)"
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                marginBottom: 10,
                fontFamily: 'inherit',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {(Object.keys(VISIBILITY_META) as GroupRow['visibility'][]).map((v) => (
                <button
                  key={v}
                  onClick={() => setForm((f) => ({ ...f, visibility: v }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: form.visibility === v ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: form.visibility === v ? 'var(--accent-light)' : 'var(--bg)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {VISIBILITY_META[v].label}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{VISIBILITY_META[v].hint}</span>
                </button>
              ))}
            </div>
            <button
              onClick={createGroup}
              disabled={!form.name.trim() || creating}
              style={{
                width: '100%',
                background: !form.name.trim() || creating ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: 11,
                fontSize: 14,
                fontWeight: 700,
                cursor: !form.name.trim() || creating ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {creating ? 'Creating…' : 'Create group (200 member cap)'}
            </button>
          </div>
        )}

        {/* Join by code */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 12,
            marginBottom: 24,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setCodeMsg(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
            placeholder="Invite code — CC-GRP-XXXX"
            style={{
              flex: 1,
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              minWidth: 0,
            }}
          />
          <button
            onClick={joinByCode}
            disabled={!code.trim()}
            style={{
              background: code.trim() ? 'var(--accent)' : 'var(--disabled)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: code.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Join
          </button>
        </div>
        {codeMsg && (
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: codeMsg.ok ? 'var(--success-text)' : 'var(--danger-text)',
              margin: '-16px 0 16px 4px',
            }}
          >
            {codeMsg.text}
          </p>
        )}

        {/* My groups */}
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 10px',
          }}
        >
          My groups
        </h3>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        ) : myGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
            No groups yet — create one or join with a code.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {myGroups.map((g) => (
              <GroupCard key={g.id} g={g} mine />
            ))}
          </div>
        )}

        {/* Discover */}
        {discover.length > 0 && (
          <>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                margin: '0 0 10px',
              }}
            >
              At your campus
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discover.map((g) => (
                <GroupCard key={g.id} g={g} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
