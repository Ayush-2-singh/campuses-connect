'use client'

/**
 * GROUPS — Telegram-style user-created groups inside the verified campus.
 *
 * Surfaces, one page:
 *   • FOLDER TABS   — personal sections (Class, Hostel, Projects…) the user
 *                     creates to categorise their groups, exactly like
 *                     Telegram folders. "All" shows everything.
 *   • MY GROUPS     — approved memberships, one tap into the chat room
 *   • DISCOVER      — open/approval/locked groups at the user's campus
 *   • JOIN BY CODE  — CC-GRP-XXXX from a friend's invite (+ password for
 *                     locked groups)
 * plus the create sheet (name, icon, description, join model, password,
 * folder) and a per-group action menu (file to folder, leave, delete).
 *
 * Design rules from the research conversation: groups are campus-bound and
 * capped at 200 (Verge/Vox: 53% want ≤200; Dunbar ≈150), and moderation is
 * first-class because student groups die of noise, not lack of features.
 * The room itself is the existing /chat/[key] page — no second chat engine.
 *
 * Passwords never live on `communities` (its read path is public since
 * 20261026): create_user_group / join_group_by_code hash and verify them
 * inside the group_passwords store, which has RLS and zero policies.
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
  folder_id: string | null
  member_count?: number
  my_role?: string | null
}

interface FolderRow {
  id: string
  name: string
  emoji: string | null
}

const JOIN_ICONS = ['📘', '🎯', '🛠️', '🏆', '🧪', '🎭', '🏠', '♟️', '🎬', '☕']
const FOLDER_EMOJIS = ['📁', '📚', '🎓', '🏏', '💻', '🏠', '🎮', '🎨', '☕', '⭐']

const VISIBILITY_META: Record<GroupRow['visibility'], { label: string; hint: string }> = {
  open: { label: 'Open', hint: 'Anyone with the code (or on your campus) joins directly' },
  approval: { label: 'Approval', hint: 'People ask to join; you approve' },
  private: { label: 'Locked', hint: 'Password-protected — only the code + password get people in' },
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
    password: '',
    folder_id: '' as string | '',
  })

  // Folders — Telegram-style personal sections.
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [activeFolder, setActiveFolder] = useState<string>('all')
  const [folderEditorOpen, setFolderEditorOpen] = useState(false)
  const [folderForm, setFolderForm] = useState({ name: '', emoji: '📁' })
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderMsg, setFolderMsg] = useState('')
  const [managingFolders, setManagingFolders] = useState(false)

  // Join-by-code with the password step for locked groups.
  const [joinPassword, setJoinPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [joiningCode, setJoiningCode] = useState(false)

  // Per-group action menu (file / leave / delete).
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [groupMsg, setGroupMsg] = useState('')

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

    // Personal folders, tabs ordered.
    const { data: folderRows } = await supabase
      .from('group_folders')
      .select('id, name, emoji')
      .order('sort_order')
      .order('created_at')
    setFolders((folderRows as FolderRow[]) || [])

    // My approved groups, with role + member count.
    const { data: mine } = await supabase
      .from('community_members')
      .select(
        'role, status, communities(id, key, name, description, icon, visibility, member_cap, invite_code, created_by, folder_id)'
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
      .select('id, key, name, description, icon, visibility, member_cap, invite_code, created_by, folder_id')
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
    // Deep link: /groups?code=CC-GRP-XXXX prefills the join box (the chat
    // room routes locked groups here, since a password must be asked for).
    const fromUrl = new URLSearchParams(window.location.search).get('code')
    if (fromUrl) setCode(fromUrl.toUpperCase())
  }, [load])

  const createGroup = async () => {
    if (!form.name.trim() || creating) return
    if (form.visibility === 'private' && form.password.trim().length < 4) {
      setCodeMsg({ ok: false, text: 'A locked group needs a password (at least 4 characters)' })
      return
    }
    setCreating(true)
    try {
      const { data, error } = await supabase.rpc('create_user_group', {
        p_name: form.name.trim(),
        p_description: form.description.trim() || null,
        p_visibility: form.visibility,
        p_icon: form.icon,
        p_password: form.visibility === 'private' ? form.password.trim() : null,
        p_folder_id: form.folder_id || null,
      })
      if (error || !data) throw new Error(error?.message || 'Could not create the group')
      setForm({ name: '', description: '', icon: '📘', visibility: 'open', password: '', folder_id: '' })
      setShowCreate(false)
      router.push(`/chat/${data}`)
    } catch (e: any) {
      setCodeMsg({ ok: false, text: e.message || 'Could not create the group' })
    } finally {
      setCreating(false)
    }
  }

  const joinByCode = async () => {
    const clean = code.trim().toUpperCase()
    if (!clean || joiningCode) return
    setJoiningCode(true)
    setCodeMsg({ ok: true, text: 'Joining…' })
    const { data, error } = await supabase.rpc('join_group_by_code', {
      p_code: clean,
      p_password: needsPassword ? joinPassword.trim() : null,
    })
    setJoiningCode(false)
    if (error) {
      setCodeMsg({ ok: false, text: 'Something went wrong — try again' })
      return
    }
    switch (data) {
      case 'joined':
        setNeedsPassword(false)
        setJoinPassword('')
        setCodeMsg({ ok: true, text: 'Joined! Taking you there…' })
        void load()
        break
      case 'pending':
        setNeedsPassword(false)
        setCodeMsg({ ok: true, text: 'Request sent — an admin will approve you' })
        void load()
        break
      case 'already':
        setNeedsPassword(false)
        setCodeMsg({ ok: true, text: 'You are already a member' })
        break
      case 'wrong_password':
        setNeedsPassword(true)
        setCodeMsg({ ok: false, text: 'This group is locked — enter its password' })
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
      return
    }
    if (data === 'wrong_password') {
      // Locked group: surface the password step in the join box.
      setCode(g.invite_code)
      setNeedsPassword(true)
      setJoinPassword('')
      setCodeMsg({ ok: false, text: `${g.name} is locked — enter its password` })
    }
  }

  // ── Folder CRUD (RLS-scoped to the signed-in user) ──────────────────────────
  const saveFolder = async () => {
    const name = folderForm.name.trim()
    if (!name || folderSaving) return
    setFolderSaving(true)
    setFolderMsg('')
    const { error } = await supabase.from('group_folders').insert({ name, emoji: folderForm.emoji || null })
    setFolderSaving(false)
    if (error) {
      setFolderMsg(error.code === '23505' ? 'You already have a folder with that name' : 'Could not create the folder')
      return
    }
    setFolderForm({ name: '', emoji: '📁' })
    setFolderEditorOpen(false)
    void load()
  }

  const deleteFolder = async (id: string) => {
    if (!window.confirm('Delete this folder? Groups inside keep existing — they just become unfilled.')) return
    await supabase.from('group_folders').delete().eq('id', id)
    if (activeFolder === id) setActiveFolder('all')
    setManagingFolders(false)
    void load()
  }

  // ── Per-group actions ───────────────────────────────────────────────────────
  const fileGroup = async (communityId: string, folderId: string | null) => {
    setMenuFor(null)
    const { data } = await supabase.rpc('set_group_folder', {
      p_community_id: communityId,
      p_folder_id: folderId,
    })
    setGroupMsg(data === 'ok' ? 'Moved' : 'Could not move the group')
    void load()
  }

  const leaveGroup = async (g: GroupRow) => {
    setMenuFor(null)
    if (!window.confirm(`Leave ${g.name}? You will need an invite to come back.`)) return
    const { data } = await supabase.rpc('leave_group', { p_community_id: g.id })
    setGroupMsg(
      data === 'ok' ? `Left ${g.name}` : 'Creators cannot leave their own group — delete it or hand it over first'
    )
    void load()
  }

  const deleteGroup = async (g: GroupRow) => {
    setMenuFor(null)
    if (!window.confirm(`Delete ${g.name} permanently? Every message in it goes too.`)) return
    const { data } = await supabase.rpc('delete_user_group', { p_community_id: g.id })
    setGroupMsg(data === 'ok' ? `${g.name} deleted` : 'Only the creator can delete the group')
    void load()
  }

  const copyCode = (c: string) => {
    try {
      void navigator.clipboard.writeText(c)
    } catch {
      /* clipboard unavailable */
    }
  }

  const visibleGroups = activeFolder === 'all' ? myGroups : myGroups.filter((g) => g.folder_id === activeFolder)

  const GroupCard = ({ g, mine }: { g: GroupRow; mine?: boolean }) => (
    <div
      role={mine ? 'button' : undefined}
      tabIndex={mine ? 0 : undefined}
      onClick={() => mine && router.push(`/chat/${g.key}`)}
      onKeyDown={(e) => e.key === 'Enter' && mine && router.push(`/chat/${g.key}`)}
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
          {g.visibility === 'private' && (
            <span title="Locked — password required" style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>
              <Icon name="lock" size={12} strokeWidth={2.4} />
            </span>
          )}
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
              {g.visibility === 'approval' ? 'Request to join' : g.visibility === 'private' ? 'Unlock & join' : 'Join'}
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
      {mine ? (
        <>
          <button
            aria-label={`Actions for ${g.name}`}
            aria-haspopup="menu"
            aria-expanded={menuFor === g.id}
            onClick={(e) => {
              e.stopPropagation()
              setMenuFor((m) => (m === g.id ? null : g.id))
              setGroupMsg('')
            }}
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="more" size={15} />
          </button>
          <span style={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
        </>
      ) : null}
    </div>
  )

  const folderChip = (id: string, label: string, emoji?: string | null, count?: number) => {
    const active = activeFolder === id
    return (
      <button
        key={id}
        onClick={() => setActiveFolder(id)}
        aria-pressed={active}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          padding: '7px 14px',
          borderRadius: 999,
          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
          background: active ? 'var(--accent-light)' : 'var(--bg)',
          color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {emoji ? <span aria-hidden="true">{emoji}</span> : null}
        {label}
        {typeof count === 'number' && count > 0 ? (
          <span style={{ fontSize: 10.5, opacity: 0.7 }}>({count})</span>
        ) : null}
      </button>
    )
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
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

        {/* Folder tabs — personal sections, Telegram-style */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 14,
            scrollbarWidth: 'none',
          }}
        >
          {folderChip('all', 'All', '🗂️', myGroups.length)}
          {folders.map((f) => folderChip(f.id, f.name, f.emoji, myGroups.filter((g) => g.folder_id === f.id).length))}
          <button
            onClick={() => {
              setFolderEditorOpen((s) => !s)
              setFolderMsg('')
            }}
            aria-label="New folder"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px dashed var(--border-strong, var(--border))',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name="plus" size={13} /> Folder
          </button>
          {folders.length > 0 && (
            <button
              onClick={() => setManagingFolders(true)}
              aria-label="Manage folders"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
                padding: '7px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Icon name="pencil" size={13} />
            </button>
          )}
        </div>

        {/* Folder create sheet */}
        {folderEditorOpen && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              New folder
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {FOLDER_EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => setFolderForm((f) => ({ ...f, emoji: em }))}
                  style={{
                    fontSize: 18,
                    padding: '5px 8px',
                    borderRadius: 10,
                    border: folderForm.emoji === em ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: folderForm.emoji === em ? 'var(--accent-light)' : 'var(--bg)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={folderForm.name}
                onChange={(e) => setFolderForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && saveFolder()}
                maxLength={30}
                placeholder="Folder name (e.g. Class, Hostel, Projects)"
                style={{
                  flex: 1,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  minWidth: 0,
                }}
              />
              <button
                onClick={saveFolder}
                disabled={!folderForm.name.trim() || folderSaving}
                style={{
                  background: !folderForm.name.trim() || folderSaving ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !folderForm.name.trim() || folderSaving ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                {folderSaving ? '…' : 'Create'}
              </button>
            </div>
            {folderMsg && (
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger-text)', margin: '8px 0 0' }}>
                {folderMsg}
              </p>
            )}
          </div>
        )}

        {/* Manage folders sheet */}
        {managingFolders && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Manage folders
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {folders.map((f) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{f.emoji || '📁'}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {f.name}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {' '}
                      · {myGroups.filter((g) => g.folder_id === f.id).length} groups
                    </span>
                  </span>
                  <button
                    onClick={() => deleteFolder(f.id)}
                    aria-label={`Delete folder ${f.name}`}
                    style={{
                      width: 30,
                      height: 30,
                      border: 'none',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--danger-text)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                marginBottom: form.visibility === 'private' ? 10 : 12,
              }}
            >
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
                  <span style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
                    <Icon name={v === 'private' ? 'lock' : v === 'approval' ? 'eye' : 'unlock'} size={14} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                    {VISIBILITY_META[v].label}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{VISIBILITY_META[v].hint}</span>
                </button>
              ))}
            </div>
            {form.visibility === 'private' && (
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                maxLength={64}
                placeholder="Group password (min 4 characters)"
                autoComplete="new-password"
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 14,
                  marginBottom: 10,
                  fontFamily: 'inherit',
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            )}
            {folders.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>File into</span>
                <select
                  value={form.folder_id}
                  onChange={(e) => setForm((f) => ({ ...f, folder_id: e.target.value }))}
                  style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">No folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.emoji ? `${f.emoji} ` : ''}
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

        {/* Join by code (+ password step for locked groups) */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 12,
            marginBottom: codeMsg ? 6 : 24,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setCodeMsg(null)
              setNeedsPassword(false)
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
            disabled={!code.trim() || joiningCode}
            style={{
              background: code.trim() && !joiningCode ? 'var(--accent)' : 'var(--disabled)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: code.trim() && !joiningCode ? 'pointer' : 'default',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {joiningCode ? '…' : 'Join'}
          </button>
        </div>
        {needsPassword && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
              placeholder="Group password"
              autoComplete="off"
              autoFocus
              style={{
                flex: 1,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                minWidth: 0,
              }}
            />
            <button
              onClick={joinByCode}
              disabled={!joinPassword.trim() || joiningCode}
              style={{
                background: joinPassword.trim() ? 'var(--accent)' : 'var(--disabled)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: joinPassword.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="lock" size={13} /> Unlock
            </button>
          </div>
        )}
        {codeMsg && (
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: codeMsg.ok ? 'var(--success-text)' : 'var(--danger-text)',
              margin: '0 0 16px 4px',
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
          {activeFolder === 'all'
            ? 'My groups'
            : `${folders.find((f) => f.id === activeFolder)?.emoji || '📁'} ${
                folders.find((f) => f.id === activeFolder)?.name || 'Folder'
              }`}
        </h3>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        ) : visibleGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
            {activeFolder === 'all'
              ? 'No groups yet — create one or join with a code.'
              : 'Nothing in this folder yet — use the ⋯ menu on a group to file it here.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {visibleGroups.map((g) => (
              <GroupCard key={g.id} g={g} mine />
            ))}
          </div>
        )}
        {groupMsg && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', margin: '-14px 0 16px 4px' }}>
            {groupMsg}
          </p>
        )}

        {/* Per-group action menu */}
        {menuFor &&
          (() => {
            const g = myGroups.find((x) => x.id === menuFor)
            if (!g) return null
            const isCreator = g.created_by === user?.id
            return (
              <div
                role="presentation"
                onClick={() => setMenuFor(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.25)' }}
              >
                <div
                  role="menu"
                  aria-label={`Actions for ${g.name}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: 16,
                    right: 16,
                    bottom: 24,
                    maxWidth: 420,
                    margin: '0 auto',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.25))',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      margin: '2px 0 6px 4px',
                    }}
                  >
                    {g.icon || '👥'} {g.name}
                  </p>
                  {folders.length > 0 && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px 4px' }}>
                        File into
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        <button
                          role="menuitem"
                          onClick={() => fileGroup(g.id, null)}
                          style={{
                            ...chipBase,
                            borderColor: !g.folder_id ? 'var(--accent)' : 'var(--border)',
                          }}
                        >
                          No folder
                        </button>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            role="menuitem"
                            onClick={() => fileGroup(g.id, f.id)}
                            style={{
                              ...chipBase,
                              borderColor: g.folder_id === f.id ? 'var(--accent)' : 'var(--border)',
                            }}
                          >
                            {f.emoji || '📁'} {f.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <button role="menuitem" onClick={() => leaveGroup(g)} style={menuItem}>
                    🚪 Leave group
                  </button>
                  {isCreator && (
                    <button
                      role="menuitem"
                      onClick={() => deleteGroup(g)}
                      style={{ ...menuItem, color: 'var(--danger-text)' }}
                    >
                      🗑️ Delete group permanently
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

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

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12.5,
  fontWeight: 700,
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary, var(--bg))',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const menuItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
