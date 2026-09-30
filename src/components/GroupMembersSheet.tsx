'use client'

/**
 * GROUP MEMBERS SHEET — the Telegram-style administration panel for
 * user-created groups, opened from the chat room header.
 *
 * Surfaces:
 *   • invite code (tap to copy) — the group's address
 *   • pending join requests (approval groups) — approve / reject
 *   • the member list with role badges and per-member actions for mods:
 *     promote, demote, mute (1h / 24h / until I undo), remove
 *
 * Authority mirrors the DB RPC group_member_action: the creator can do
 * everything; admins/mods can moderate non-admins; nobody moderates the
 * creator. The RPC re-checks everything server-side — this sheet only
 * decides what to SHOW.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

export interface GroupMemberRow {
  user_id: string
  role: string
  status: string
  profiles: { full_name: string | null; username: string | null; avatar_url: string | null } | null
}

interface CommunitySettingsRow {
  created_by: string | null
  invite_code: string | null
  name: string
  description: string | null
  icon: string | null
  visibility: 'open' | 'approval' | 'private'
  folder_id: string | null
}

const SELECT_MEMBERS = 'user_id, role, status, profiles!community_members_user_id_fkey(full_name, username, avatar_url)'

function normaliseProfiles(rows: any[] | null): GroupMemberRow[] {
  return ((rows as any[]) || []).map((r) => ({
    user_id: r.user_id,
    role: r.role,
    status: r.status,
    profiles: Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : (r.profiles ?? null),
  }))
}

export default function GroupMembersSheet({
  communityId,
  onClose,
  onMemberCountChange,
}: {
  communityId: string
  onClose: () => void
  onMemberCountChange?: (n: number) => void
}) {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [rows, setRows] = useState<GroupMemberRow[]>([])
  const [copied, setCopied] = useState(false)
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  // Creator settings — rename, visibility, password, invite regeneration.
  const [settings, setSettings] = useState<CommunitySettingsRow | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    icon: '',
    visibility: 'open' as CommunitySettingsRow['visibility'],
    password: '',
  })
  const [settingsBusy, setSettingsBusy] = useState(false)

  const isMod = useCallback(
    (userId: string) =>
      creatorId === userId || rows.some((r) => r.user_id === userId && r.role !== 'member' && r.status === 'approved'),
    [creatorId, rows]
  )

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    setMe(user?.id ?? null)

    const [commRes, memRes] = await Promise.all([
      supabase
        .from('communities')
        .select('created_by, invite_code, name, description, icon, visibility, folder_id')
        .eq('id', communityId)
        .single(),
      supabase.from('community_members').select(SELECT_MEMBERS).eq('community_id', communityId),
    ])
    setCreatorId((commRes.data as any)?.created_by ?? null)
    setInviteCode((commRes.data as any)?.invite_code ?? null)
    setSettings((commRes.data as any) ?? null)
    const list = normaliseProfiles(memRes.data as any[] | null)
    setRows(list)
    onMemberCountChange?.(list.filter((r) => r.status === 'approved').length)
  }, [communityId, supabase, onMemberCountChange])

  useEffect(() => {
    void load()
  }, [load])

  // Close any open member menu on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenMenuFor(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const act = async (userId: string, action: string, hours?: number) => {
    setOpenMenuFor(null)
    setNotice('')
    const { data, error } = await supabase.rpc('group_member_action', {
      p_community_id: communityId,
      p_user_id: userId,
      p_action: action,
      p_hours: hours ?? null,
    })
    if (error || data !== 'ok') {
      setNotice(data === 'forbidden' ? 'You do not have permission for that' : 'That did not work — try again')
      return
    }
    if (action === 'remove' || action === 'reject') setNotice('Removed')
    if (action === 'approve') setNotice('Approved')
    if (action === 'promote') setNotice('Promoted to moderator')
    if (action === 'demote') setNotice('Changed to member')
    if (action === 'mute') setNotice('Member muted')
    if (action === 'unmute') setNotice('Unmuted')
    void load()
  }

  const openSettings = () => {
    if (!settings) return
    setSettingsForm({
      name: settings.name || '',
      description: settings.description || '',
      icon: settings.icon || '',
      visibility: settings.visibility || 'open',
      password: '', // never prefilled — the hash is unreadable by design
    })
    setShowSettings(true)
  }

  const saveSettings = async () => {
    if (!settings || settingsBusy) return
    const name = settingsForm.name.trim()
    if (!name) {
      setNotice('Name cannot be empty')
      return
    }
    if (settingsForm.visibility === 'private' && !settingsForm.password.trim() && !hasPasswordSet) {
      setNotice('A locked group needs a password (min 4 characters)')
      return
    }
    setSettingsBusy(true)
    const { data, error } = await supabase.rpc('update_user_group', {
      p_community_id: communityId,
      p_name: name,
      p_description: settingsForm.description.trim(),
      p_icon: settingsForm.icon || null,
      p_visibility: settingsForm.visibility,
      p_password: settingsForm.password.trim() ? settingsForm.password.trim() : null,
    })
    setSettingsBusy(false)
    if (error || data !== 'ok') {
      setNotice(
        data === 'password_required'
          ? 'A locked group needs a password (min 4 characters)'
          : data === 'forbidden'
            ? 'Only the creator can edit the group'
            : 'That did not work — try again'
      )
      return
    }
    setNotice('Saved')
    setShowSettings(false)
    void load()
  }

  const regenerateInvite = async () => {
    if (!window.confirm('Generate a new invite code? The old code stops working immediately.')) return
    const { data } = await supabase.rpc('regenerate_group_invite', { p_community_id: communityId })
    if (data) {
      setInviteCode(data)
      setNotice('New invite code generated')
    } else {
      setNotice('Only the creator can regenerate the invite')
    }
  }

  const copyCode = () => {
    if (!inviteCode) return
    try {
      void navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  const approved = rows.filter((r) => r.status === 'approved')
  const pending = rows.filter((r) => r.status === 'pending')
  const name = (r: GroupMemberRow) => r.profiles?.full_name || r.profiles?.username || 'Student'
  const isCreator = !!me && me === creatorId
  /** Best-effort signal for the settings form: a private group with a saved
   *  password shows "unchanged" instead of demanding a new one every time. */
  const hasPasswordSet = (settings?.visibility ?? 'open') === 'private'

  const Row = ({ r }: { r: GroupMemberRow }) => {
    const isCreator = r.user_id === creatorId
    const canTarget =
      me && r.user_id !== me && r.user_id !== creatorId && (creatorId === me || !r.role || r.role === 'member')
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 2px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {name(r).slice(0, 1).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{name(r)}</span>
            {isCreator && <span title="Group creator">👑</span>}
            {!isCreator && r.role !== 'member' && r.status === 'approved' && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: 6,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                }}
              >
                {r.role}
              </span>
            )}
          </span>
          {r.profiles?.username && (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>@{r.profiles.username}</span>
          )}
        </span>
        {canTarget && (
          <button
            aria-label={`Manage ${name(r)}`}
            aria-haspopup="menu"
            aria-expanded={openMenuFor === r.user_id}
            onClick={() => setOpenMenuFor((o) => (o === r.user_id ? null : r.user_id))}
            style={{
              width: 30,
              height: 30,
              border: 'none',
              borderRadius: 8,
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
        )}
        {openMenuFor === r.user_id && (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 70,
            }}
          >
            <div
              role="presentation"
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }}
              onClick={() => setOpenMenuFor(null)}
            />
            <div
              role="menu"
              aria-label={`Actions for ${name(r)}`}
              style={{
                position: 'absolute',
                right: 16,
                bottom: 24,
                minWidth: 230,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.25))',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {creatorId === me && r.role === 'member' && (
                <button role="menuitem" onClick={() => act(r.user_id, 'promote')} style={menuItem}>
                  ⭐ Promote to moderator
                </button>
              )}
              {creatorId === me && r.role === 'moderator' && (
                <button role="menuitem" onClick={() => act(r.user_id, 'demote')} style={menuItem}>
                  ↩️ Change to member
                </button>
              )}
              <button role="menuitem" onClick={() => act(r.user_id, 'mute', 1)} style={menuItem}>
                🔇 Mute 1 hour
              </button>
              <button role="menuitem" onClick={() => act(r.user_id, 'mute', 24)} style={menuItem}>
                🔇 Mute 24 hours
              </button>
              <button role="menuitem" onClick={() => act(r.user_id, 'mute')} style={menuItem}>
                🔇 Mute until I undo
              </button>
              {r.role !== 'member' && creatorId === me && (
                <button role="menuitem" onClick={() => act(r.user_id, 'unmute')} style={menuItem}>
                  🔊 Unmute
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  if (window.confirm(`Remove ${name(r)} from the group?`)) act(r.user_id, 'remove')
                }}
                style={{ ...menuItem, color: 'var(--danger-text)' }}
              >
                🚫 Remove from group
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="chat-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="chat-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Group members"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 4,
            background: 'var(--border-strong, var(--border))',
            margin: '0 auto 10px',
          }}
          aria-hidden="true"
        />
        <p
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 12px',
            padding: '0 20px',
          }}
        >
          Group members · {approved.length}
        </p>

        {/* Invite code (+ regeneration for the creator) */}
        {inviteCode && (
          <div style={{ padding: '0 20px', marginBottom: 14 }}>
            <button
              onClick={copyCode}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: 'var(--bg-secondary)',
                border: '1px dashed var(--border-strong, var(--border))',
                borderRadius: 10,
                padding: '10px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
                {inviteCode}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{copied ? 'Copied ✓' : 'Tap to copy'}</span>
            </button>
            {isCreator && (
              <button
                onClick={regenerateInvite}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-text)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              >
                ↻ Regenerate invite code
              </button>
            )}
          </div>
        )}

        {/* Creator settings — rename, lock/unlock, change password */}
        {isCreator && (
          <div style={{ padding: '0 20px', marginBottom: 14 }}>
            {!showSettings ? (
              <button
                onClick={openSettings}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="pencil" size={13} /> Group settings
              </button>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <input
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                  maxLength={60}
                  placeholder="Group name"
                  style={settingsInput}
                />
                <input
                  value={settingsForm.description}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={120}
                  placeholder="Description"
                  style={settingsInput}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['open', 'approval', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setSettingsForm((f) => ({ ...f, visibility: v }))}
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: settingsForm.visibility === v ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: settingsForm.visibility === v ? 'var(--accent-light)' : 'var(--bg)',
                        color: 'var(--text-primary)',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Icon name={v === 'private' ? 'lock' : v === 'approval' ? 'eye' : 'unlock'} size={11} />
                      {v === 'private' ? 'Locked' : v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                {settingsForm.visibility === 'private' && (
                  <input
                    type="password"
                    value={settingsForm.password}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, password: e.target.value }))}
                    maxLength={64}
                    placeholder={
                      hasPasswordSet ? 'New password (leave blank to keep)' : 'Set password (min 4 characters)'
                    }
                    autoComplete="new-password"
                    style={settingsInput}
                  />
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowSettings(false)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 9,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSettings}
                    disabled={settingsBusy}
                    style={{
                      flex: 2,
                      background: settingsBusy ? 'var(--disabled)' : 'var(--accent)',
                      color: 'var(--on-accent)',
                      border: 'none',
                      borderRadius: 8,
                      padding: 9,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: settingsBusy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {settingsBusy ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {notice && (
          <p
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', margin: '0 0 8px', padding: '0 20px' }}
          >
            {notice}
          </p>
        )}

        {/* Pending requests */}
        {pending.length > 0 && isMod(me || '') && (
          <div style={{ padding: '0 20px', marginBottom: 12 }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--orange-text)', margin: '0 0 6px' }}>
              {pending.length} pending request{pending.length > 1 ? 's' : ''}
            </p>
            {pending.map((r) => (
              <div key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name(r)}</span>
                <button onClick={() => act(r.user_id, 'approve')} style={pill(true)}>
                  Approve
                </button>
                <button onClick={() => act(r.user_id, 'reject')} style={pill(false)}>
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Members */}
        <div style={{ padding: '0 20px 20px', maxHeight: '46vh', overflowY: 'auto' }}>
          {approved.map((r) => (
            <Row key={r.user_id} r={r} />
          ))}
        </div>
      </div>
    </div>
  )
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

const settingsInput: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

function pill(approve: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 8,
    border: 'none',
    background: approve ? 'var(--accent)' : 'var(--bg-secondary)',
    color: approve ? 'var(--on-accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
