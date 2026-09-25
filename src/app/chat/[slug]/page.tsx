'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import ErrorBoundary from '@/components/ErrorBoundary'
import { CardSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'
import { useAdminContext } from '@/lib/permissions'
import { useHaptic, useSwipeBack } from '@/hooks/useMobile'
import {
  LIFT_ACTIONS,
  MODERATION_ACTIONS,
  MODERATION_DURATIONS,
  actionNeedsConfirm,
  actionNeedsDuration,
  activeLabel,
  canModerate,
  chatErrorCopy,
  daySeparatorLabel,
  describeDuration,
  formatCount,
  groupMessages,
  isNewDay,
  isSendable,
  messageTime,
  postingReasonCopy,
  postingVerdict,
  replyPreview,
  type ChatBlockReason,
  type ChatMessageRow,
  type ModerationAction,
} from '@/lib/chat'

/**
 * Live Chat — one room.
 *
 * Mobile-first: the header carries the room identity, the thread scrolls the
 * page naturally (no nested scroll containers, which are the usual source of
 * mobile scroll bugs), and the composer is sticky so it rides above the
 * keyboard. Long-press/⋯ on any message opens a bottom sheet.
 *
 * Authorization is entirely server-side. Every mutation calls a SECURITY
 * DEFINER function from 20261017_live_chat.sql, and the tables have no
 * INSERT/UPDATE/DELETE policy — so the disabled state of the composer here is a
 * courtesy, not the enforcement.
 */

interface Author {
  full_name: string | null
  username: string | null
  avatar_url: string | null
}

interface Message extends ChatMessageRow {
  author?: Author
  /** emoji -> user ids who reacted */
  reactions?: Record<string, string[]>
  pending?: boolean
  failed?: boolean
}

interface Community {
  id: string
  key: string
  name: string
  icon: string | null
  tagline: string | null
  is_active: boolean
  chat_enabled: boolean
}

interface ChatReport {
  id: string
  reason: string
  created_at: string
  target_user_id: string
  reporter_id: string
  message_id: string | null
  target?: Author
  reporter?: Author
}

const QUICK_REACTIONS = ['👍', '🔥', '😂', '🎯', '❤️']

const MESSAGE_SELECT =
  'id, community_id, author_id, body, attachment_url, attachment_type, reply_to_id, pinned_at, edited_at, deleted_at, created_at, profiles!chat_messages_author_id_fkey(full_name, username, avatar_url)'

export default function ChatRoomPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const supabase = createClient()
  const haptic = useHaptic()
  const swipe = useSwipeBack()
  const authorsRef = useRef<Record<string, Author>>({})

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [community, setCommunity] = useState<Community | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [pinned, setPinned] = useState<Message[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [isMember, setIsMember] = useState(false)
  const [blockReason, setBlockReason] = useState<ChatBlockReason>(null)
  const [joining, setJoining] = useState(false)

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Sheets
  const [actionSheet, setActionSheet] = useState<Message | null>(null)
  const [modTarget, setModTarget] = useState<{ id: string; author?: Author } | null>(null)
  const [modAction, setModAction] = useState<ModerationAction>('warn')
  const [modReason, setModReason] = useState('')
  const [modMinutes, setModMinutes] = useState<number | null>(60)
  const [modBusy, setModBusy] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [reports, setReports] = useState<ChatReport[]>([])
  const [reportReason, setReportReason] = useState('')

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[] | null>(null)
  const [searching, setSearching] = useState(false)

  // Library -> Chat handoff: /chat/<room>?resource=<noteId> carries a resource
  // into the conversation so `[ Discuss ]` on a Library card lands here with
  // context. Read from the URL directly rather than useSearchParams, which
  // would force this client page behind a Suspense boundary at build time.
  const [resource, setResource] = useState<{
    id: string
    title: string
    resource_type?: string | null
    author?: string | null
    external_file_url?: string | null
    drive_link?: string | null
    external_link?: string | null
    profiles?: { full_name?: string | null; username?: string | null } | null
  } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const nearBottomRef = useRef(true)

  // Load the shared resource, if the URL carried one.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('resource')
    if (!id) return
    let cancelled = false
    supabase
      .from('notes')
      .select(
        'id, title, resource_type, author, external_file_url, drive_link, external_link, profiles!notes_uploaded_by_fkey(full_name, username)'
      )
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setResource(data as any)
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  const admin = useAdminContext(user?.id)
  const isModerator = admin.isPlatformAdmin || admin.communityIds.includes(community?.id || '')

  const canSendNow = postingVerdict({
    signedIn: !!user,
    isMember,
    chatEnabled: !!community?.chat_enabled,
    blockReason,
  }).allowed
  const blockCopy = postingReasonCopy(
    postingVerdict({ signedIn: !!user, isMember, chatEnabled: !!community?.chat_enabled, blockReason }).reason
  )

  // ── Scrolling ───────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior })
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      nearBottomRef.current = gap < 140
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const ensureAuthor = useCallback(
    async (id: string): Promise<Author | undefined> => {
      if (authorsRef.current[id]) return authorsRef.current[id]
      const { data } = await supabase.from('profiles').select('full_name, username, avatar_url').eq('id', id).single()
      if (data) {
        authorsRef.current[id] = data as Author
        return data as Author
      }
      return undefined
    },
    [supabase]
  )

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: comm, error: commErr } = await supabase
      .from('communities')
      .select('id, key, name, icon, tagline, is_active, chat_enabled')
      .eq('key', slug)
      .maybeSingle()

    if (commErr) {
      setError(commErr.message)
      setLoading(false)
      return
    }
    if (!comm) {
      setNotFound(true)
      setLoading(false)
      return
    }
    // Archived/inactive rooms are unreachable by URL, not merely hidden.
    if (!comm.is_active) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setCommunity(comm as Community)

    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData?.user ?? null
    setUser(authUser)

    // Thread + pinned + presence, in parallel.
    const [threadRes, pinnedRes, actRes] = await Promise.all([
      supabase
        .from('chat_messages')
        .select(MESSAGE_SELECT)
        .eq('community_id', comm.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('chat_messages')
        .select(
          'id, community_id, author_id, body, attachment_url, attachment_type, reply_to_id, pinned_at, edited_at, deleted_at, created_at, profiles!chat_messages_author_id_fkey(full_name, username, avatar_url)'
        )
        .eq('community_id', comm.id)
        .not('pinned_at', 'is', null)
        .order('pinned_at', { ascending: false })
        .limit(3),
      supabase.rpc('chat_activity_counts', { p_window_minutes: 15 }),
    ])

    if (threadRes.error) setError(threadRes.error.message)

    const rows = ((threadRes.data || []) as any[]).map((r) => {
      const author = (r.profiles || undefined) as Author | undefined
      if (author) authorsRef.current[r.author_id] = author
      return { ...r, author, reactions: {} } as Message
    })
    rows.reverse()

    // Reactions for the visible window.
    const ids = rows.map((m) => m.id)
    if (ids.length) {
      const { data: reacts } = await supabase
        .from('chat_message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', ids)

      const map: Record<string, Record<string, string[]>> = {}
      for (const r of (reacts || []) as any[]) {
        map[r.message_id] = map[r.message_id] || {}
        map[r.message_id][r.emoji] = map[r.message_id][r.emoji] || []
        map[r.message_id][r.emoji].push(r.user_id)
      }
      for (const m of rows) if (map[m.id]) m.reactions = map[m.id]
    }

    setMessages(rows)
    setPinned(((pinnedRes.data || []) as any[]).map((r) => ({ ...r, author: r.profiles })) as Message[])

    const actRow = ((actRes.data || []) as any[]).find((a) => a.community_id === comm.id)
    setActiveCount(Number(actRow?.active_count || 0))
    setMemberCount(Number(actRow?.member_count || 0))

    if (authUser) {
      const [profRes, memRes, blockRes] = await Promise.all([
        supabase.from('profiles').select('*, campuses(name)').eq('id', authUser.id).single(),
        supabase
          .from('community_members')
          .select('community_id')
          .eq('community_id', comm.id)
          .eq('user_id', authUser.id)
          .maybeSingle(),
        supabase.rpc('chat_block_reason', { p_user_id: authUser.id, p_community_id: comm.id }),
      ])
      setProfile(profRes.data)
      setIsMember(!!memRes.data)
      setBlockReason(((blockRes.data as ChatBlockReason) ?? null) as ChatBlockReason)
    }

    setLoading(false)
    requestAnimationFrame(() => scrollToBottom())
  }, [slug, supabase, scrollToBottom])

  useEffect(() => {
    load()
  }, [load])

  // ── Read state + presence heartbeat ─────────────────────────────────────────
  useEffect(() => {
    if (!community || !user) return
    supabase.rpc('mark_chat_read', { p_community_id: community.id })
    // One lightweight upsert a minute while the room is open. This is what
    // makes the category list's "active now" number real.
    const timer = setInterval(() => {
      supabase.rpc('mark_chat_read', { p_community_id: community.id })
    }, 60_000)
    return () => clearInterval(timer)
  }, [community, user, supabase])

  // ── Realtime: ONE channel, scoped to this room ──────────────────────────────
  useEffect(() => {
    if (!community) return
    const channel = supabase
      .channel(`chat:${community.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `community_id=eq.${community.id}` },
        async (payload: any) => {
          const row = payload.new as ChatMessageRow
          const author = await ensureAuthor(row.author_id)

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev

            // The realtime echo of our own optimistic message: swap the
            // placeholder in place instead of appending a duplicate.
            const placeholder = prev.findIndex(
              (m) => m.pending && m.author_id === row.author_id && (m.body || '') === (row.body || '')
            )
            if (placeholder >= 0) {
              const copy = [...prev]
              copy[placeholder] = { ...row, author, reactions: copy[placeholder].reactions || {} }
              return copy
            }
            return [...prev, { ...row, author, reactions: {} }]
          })

          if (nearBottomRef.current) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `community_id=eq.${community.id}` },
        (payload: any) => {
          const row = payload.new as ChatMessageRow
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
          setPinned((prev) =>
            row.pinned_at
              ? prev.some((p) => p.id === row.id)
                ? prev
                : [{ ...row, author: authorsRef.current[row.author_id] }, ...prev].slice(0, 3)
              : prev.filter((p) => p.id !== row.id)
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [community, supabase, ensureAuthor])

  // Hide the global FAB on this screen — it would sit on top of the composer.
  useEffect(() => {
    document.documentElement.setAttribute('data-chat-room', '1')
    return () => document.documentElement.removeAttribute('data-chat-room')
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const resetComposer = () => {
    setText('')
    setReplyTo(null)
    setEditing(null)
  }

  const patchMessage = (id: string, patch: Partial<Message>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const send = async () => {
    if (!community || !user || sending) return
    if (editing) return saveEdit()
    if (!isSendable(text) || !canSendNow) return

    const body = text.trim()
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      community_id: community.id,
      author_id: user.id,
      body,
      reply_to_id: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      author: { full_name: profile?.full_name, username: profile?.username, avatar_url: profile?.avatar_url },
      reactions: {},
      pending: true,
    }

    setMessages((prev) => [...prev, optimistic])
    resetComposer()
    setSending(true)
    haptic.tap()
    requestAnimationFrame(() => scrollToBottom('smooth'))

    const { data, error: sendErr } = await supabase.rpc('chat_post', {
      p_community_id: community.id,
      p_body: body,
      p_reply_to: optimistic.reply_to_id,
    })
    setSending(false)

    if (sendErr) {
      patchMessage(tempId, { pending: false, failed: true })
      setError(chatErrorCopy(sendErr.message))
      return
    }

    const created = (Array.isArray(data) ? data[0] : data) as { id: string; created_at: string } | null
    if (created) {
      patchMessage(tempId, { id: created.id, created_at: created.created_at, pending: false })
    } else {
      patchMessage(tempId, { pending: false })
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const body = text.trim()
    if (!isSendable(body)) return
    setSending(true)
    const { error: editErr } = await supabase.rpc('edit_chat_message', { p_message_id: editing.id, p_body: body })
    setSending(false)
    if (editErr) {
      setError(chatErrorCopy(editErr.message))
      return
    }
    patchMessage(editing.id, { body, edited_at: new Date().toISOString() })
    resetComposer()
  }

  const startEdit = (m: Message) => {
    setEditing(m)
    setReplyTo(null)
    setText(m.body || '')
    setActionSheet(null)
    composerRef.current?.focus()
  }

  const removeMessage = async (m: Message) => {
    setActionSheet(null)
    if (!window.confirm('Delete this message?')) return
    const { error: delErr } = await supabase.rpc('delete_chat_message', { p_message_id: m.id })
    if (delErr) {
      setError(chatErrorCopy(delErr.message))
      return
    }
    patchMessage(m.id, { deleted_at: new Date().toISOString() })
  }

  const togglePin = async (m: Message, pin: boolean) => {
    setActionSheet(null)
    const { error: pinErr } = await supabase.rpc('pin_chat_message', { p_message_id: m.id, p_pin: pin })
    if (pinErr) {
      setError(chatErrorCopy(pinErr.message))
      return
    }
    patchMessage(m.id, { pinned_at: pin ? new Date().toISOString() : null })
  }

  const toggleReaction = async (m: Message, emoji: string) => {
    if (!user) return
    const mine = (m.reactions?.[emoji] || []).includes(user.id)

    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x
        const next = { ...(x.reactions || {}) }
        const set = new Set(next[emoji] || [])
        if (mine) set.delete(user.id)
        else set.add(user.id)
        next[emoji] = Array.from(set)
        return { ...x, reactions: next }
      })
    )
    haptic.tap()

    if (mine) {
      await supabase
        .from('chat_message_reactions')
        .delete()
        .eq('message_id', m.id)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
    } else {
      await supabase.from('chat_message_reactions').insert({ message_id: m.id, user_id: user.id, emoji })
    }
  }

  const submitReport = async () => {
    if (!actionSheet) return
    if (reportReason.trim().length < 3) {
      setError('Please add a short reason.')
      return
    }
    const { error: repErr } = await supabase.rpc('report_chat_message', {
      p_message_id: actionSheet.id,
      p_reason: reportReason.trim(),
    })
    setActionSheet(null)
    setReportReason('')
    if (repErr) {
      setError(chatErrorCopy(repErr.message))
      return
    }
    setNotice('Report sent to the moderators.')
  }

  const joinRoom = async () => {
    if (!community || !user) {
      router.push(`/auth/login?redirect=${encodeURIComponent(`/chat/${slug}`)}`)
      return
    }
    setJoining(true)
    const { data, error: joinErr } = await supabase.rpc('join_community', { p_community_id: community.id })
    setJoining(false)
    if (joinErr) {
      setError(chatErrorCopy(joinErr.message))
      return
    }
    const result = data as string
    if (result === 'joined' || result === 'already') {
      setIsMember(true)
      setBlockReason(null)
      haptic.success()
      return
    }
    // The room has an entry gate (test / password / approval) — send the student
    // through the existing community flow rather than bypassing it.
    router.push(`/communities/${community.key}`)
  }

  const runModeration = async () => {
    if (!modTarget || !community) return
    if (actionNeedsConfirm(modAction) && !window.confirm(`${modAction.toUpperCase()} this user?`)) return

    setModBusy(true)
    const { error: modErr } = await supabase.rpc('moderate_chat', {
      p_target_user_id: modTarget.id,
      p_community_id: community.id,
      p_action: modAction,
      p_reason: modReason.trim() || null,
      p_duration_minutes: actionNeedsDuration(modAction) ? modMinutes : null,
    })
    setModBusy(false)

    if (modErr) {
      setError(chatErrorCopy(modErr.message))
      return
    }

    setModTarget(null)
    setModReason('')
    haptic.success()
    setNotice(`${modAction.charAt(0).toUpperCase()}${modAction.slice(1)} applied.`)

    if (modAction === 'kick' || modAction === 'ban') {
      // Their membership may be gone — refresh presence locally.
      setMemberCount((c) => Math.max(0, c - 1))
    }
  }

  const loadReports = async () => {
    if (!community) return
    const { data } = await supabase
      .from('chat_reports')
      .select('id, reason, created_at, target_user_id, reporter_id, message_id, status')
      .eq('community_id', community.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50)

    const rows = (data || []) as ChatReport[]
    const ids = Array.from(new Set(rows.flatMap((r) => [r.target_user_id, r.reporter_id])))
    if (ids.length) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', ids)
      const byId: Record<string, Author> = {}
      for (const p of (people || []) as any[]) byId[p.id] = p
      for (const r of rows) {
        r.target = byId[r.target_user_id]
        r.reporter = byId[r.reporter_id]
      }
    }
    setReports(rows)
  }

  const resolveReport = async (id: string, status: 'resolved' | 'dismissed') => {
    const { error: resErr } = await supabase.rpc('resolve_chat_report', { p_report_id: id, p_status: status })
    if (resErr) {
      setError(chatErrorCopy(resErr.message))
      return
    }
    setReports((prev) => prev.filter((r) => r.id !== id))
  }

  const runSearch = async () => {
    if (!community) return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    const { data } = await supabase
      .from('chat_messages')
      .select(MESSAGE_SELECT)
      .eq('community_id', community.id)
      .ilike('body', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(40)
    setSearching(false)
    setSearchResults(((data || []) as any[]).map((r) => ({ ...r, author: r.profiles })) as Message[])
  }

  const grouped = useMemo(() => groupMessages(messages) as (Message & { groupWithPrev: boolean })[], [messages])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <Layout user={user} profile={profile}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 16px' }}>
          <EmptyState
            icon="message"
            title="Room not found"
            body="This chat room does not exist or has been turned off."
            cta="Browse rooms"
            onCta={() => router.push('/chat')}
          />
        </div>
      </Layout>
    )
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="chat-room">
        <div {...swipe} style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 24px' }}>
          {/* ── Header ── */}
          <div
            className="chat-room-header"
            style={{
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              onClick={() => router.push('/chat')}
              aria-label="Back to rooms"
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="chevron" size={18} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 15.5,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span aria-hidden="true">{community?.icon || '💬'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {community?.name || 'Room'}
                </span>
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
                {formatCount(memberCount)} members
                {activeLabel(activeCount) ? ` • ${activeLabel(activeCount)}` : ''}
              </p>
            </div>

            <button
              onClick={() => {
                setSearchOpen((s) => !s)
                setSearchResults(null)
              }}
              aria-label="Search messages"
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="search" size={17} />
            </button>

            {isModerator && (
              <button
                onClick={() => {
                  setShowReports(true)
                  loadReports()
                }}
                aria-label="Open reports"
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-secondary)',
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                🛡
              </button>
            )}
          </div>

          {/* ── Shared Library resource ── */}
          {resource && (
            <div
              style={{
                margin: '10px 12px 0',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--accent-light)',
                background: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>📘</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resource.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Discussing this resource
                  {resource.profiles?.username
                    ? ` · 👤 ${resource.profiles.full_name || resource.profiles.username}`
                    : ''}
                </p>
              </div>
              {(resource.external_file_url || resource.drive_link || resource.external_link) && (
                <a
                  href={(resource.external_file_url || resource.drive_link || resource.external_link) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    textDecoration: 'none',
                  }}
                >
                  Open
                </a>
              )}
              <button
                onClick={() => setResource(null)}
                aria-label="Dismiss shared resource"
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Search panel ── */}
          {searchOpen && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Search in this room…"
                  aria-label="Search messages in this room"
                  style={{
                    flex: 1,
                    minHeight: 44,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'inherit',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={runSearch}
                  style={{
                    minHeight: 44,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Go
                </button>
              </div>

              {searching && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }}>Searching…</p>}

              {searchResults && (
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {searchResults.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No messages match.</p>
                  )}
                  {searchResults.map((r) => (
                    <div
                      key={r.id}
                      style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 12px' }}
                    >
                      <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 2px' }}>
                        {r.author?.full_name || r.author?.username || 'Student'} · {messageTime(r.created_at)}
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
                        {replyPreview(r.body, 140)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Pinned ── */}
          {pinned.length > 0 && (
            <div style={{ padding: '10px 16px 0' }}>
              <div
                style={{
                  background: 'var(--accent-light)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '10px 14px',
                }}
              >
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-text)', margin: '0 0 4px' }}>
                  📌 PINNED
                </p>
                {pinned.map((p) => (
                  <p key={p.id} style={{ fontSize: 12.5, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                    {replyPreview(p.body, 110)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── Notices ── */}
          {(error || notice) && (
            <div style={{ padding: '12px 16px 0' }}>
              {error && (
                <div
                  role="alert"
                  style={{
                    background: 'var(--danger-light)',
                    color: 'var(--danger)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <span>{error}</span>
                  <button
                    onClick={() => setError('')}
                    aria-label="Dismiss error"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
              {notice && (
                <div
                  role="status"
                  style={{
                    background: 'var(--success-light, var(--bg-secondary))',
                    color: 'var(--success-text)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                    marginTop: error ? 8 : 0,
                  }}
                >
                  {notice}
                  <button
                    onClick={() => setNotice('')}
                    style={{
                      marginLeft: 10,
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Thread ── */}
          <div className="chat-thread" style={{ padding: '14px 16px 8px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <CardSkeleton rows={2} />
                <CardSkeleton rows={2} />
              </div>
            ) : !user ? (
              <EmptyState
                icon="user"
                title="Sign in to read the room"
                body="Chat is only visible to signed-in students."
                cta="Sign in"
                onCta={() => router.push(`/auth/login?redirect=${encodeURIComponent(`/chat/${slug}`)}`)}
              />
            ) : grouped.length === 0 ? (
              <EmptyState
                icon="message"
                title="No messages yet"
                body={
                  isMember ? 'Say hello — you are the first one here.' : 'Join this room to start the conversation.'
                }
              />
            ) : (
              grouped.map((m) => {
                const prev = grouped[grouped.indexOf(m) - 1]
                const showDay = !prev || isNewDay(prev.created_at, m.created_at)
                const mine = m.author_id === user.id
                const deleted = !!m.deleted_at
                const reactions = Object.entries(m.reactions || {}).filter(([, users]) => users.length > 0)

                return (
                  <div key={m.id}>
                    {showDay && (
                      <div style={{ textAlign: 'center', margin: '18px 0 12px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-secondary)',
                            padding: '4px 12px',
                            borderRadius: 20,
                          }}
                        >
                          {daySeparatorLabel(m.created_at)}
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: m.groupWithPrev ? 3 : 12,
                        justifyContent: mine ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                      }}
                    >
                      {!mine && (
                        <div style={{ width: 30, flexShrink: 0 }}>
                          {!m.groupWithPrev && (
                            <Avatar
                              name={m.author?.full_name ?? undefined}
                              avatarUrl={m.author?.avatar_url ?? undefined}
                              size={30}
                            />
                          )}
                        </div>
                      )}

                      <div style={{ maxWidth: '82%', minWidth: 0 }}>
                        {!m.groupWithPrev && !mine && (
                          <p
                            style={{
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: 'var(--text-muted)',
                              margin: '0 0 3px 2px',
                            }}
                          >
                            {m.author?.full_name || (m.author?.username ? `@${m.author.username}` : 'Student')}
                          </p>
                        )}

                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => !deleted && setActionSheet(m)}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !deleted) setActionSheet(m)
                          }}
                          style={{
                            background: deleted ? 'var(--bg-secondary)' : mine ? 'var(--accent)' : 'var(--bg)',
                            color: deleted ? 'var(--text-muted)' : mine ? 'var(--on-accent)' : 'var(--text-primary)',
                            border: mine && !deleted ? 'none' : '1px solid var(--border)',
                            borderRadius: 14,
                            padding: '9px 13px',
                            fontSize: 14.5,
                            lineHeight: 1.45,
                            fontStyle: deleted ? 'italic' : 'normal',
                            opacity: m.pending ? 0.65 : 1,
                            boxShadow: 'var(--shadow-sm)',
                            whiteSpace: 'pre-wrap',
                            cursor: deleted ? 'default' : 'pointer',
                          }}
                        >
                          {deleted
                            ? mine
                              ? 'You deleted this message'
                              : 'Message deleted'
                            : renderBody(m.body || '', mine)}

                          {m.attachment_url && !deleted && (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'block',
                                marginTop: 6,
                                fontSize: 12.5,
                                color: mine ? 'inherit' : 'var(--accent)',
                                textDecoration: 'underline',
                              }}
                            >
                              🖼 Open image
                            </a>
                          )}
                        </div>

                        {/* Meta line: time · edited · pending/failed */}
                        <p
                          style={{
                            fontSize: 10.5,
                            color: m.failed ? 'var(--danger)' : 'var(--text-muted)',
                            margin: '3px 0 0',
                            textAlign: mine ? 'right' : 'left',
                            display: 'flex',
                            gap: 6,
                            justifyContent: mine ? 'flex-end' : 'flex-start',
                          }}
                        >
                          {m.edited_at && !deleted && <span>edited</span>}
                          <span>{messageTime(m.created_at)}</span>
                          {m.pending && <span>· sending…</span>}
                          {m.failed && <span>· not sent — tap to retry</span>}
                        </p>

                        {/* Reactions */}
                        {reactions.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 4,
                              flexWrap: 'wrap',
                              marginTop: 4,
                              justifyContent: mine ? 'flex-end' : 'flex-start',
                            }}
                          >
                            {reactions.map(([emoji, users]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(m, emoji)}
                                aria-label={`${emoji} ${users.length}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  minHeight: 28,
                                  padding: '2px 9px',
                                  borderRadius: 20,
                                  border: users.includes(user.id)
                                    ? '1px solid var(--accent)'
                                    : '1px solid var(--border)',
                                  background: users.includes(user.id) ? 'var(--accent-light)' : 'var(--bg)',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                <span>{emoji}</span>
                                <span style={{ fontWeight: 700 }}>{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Composer / join bar ── */}
          <div className="chat-composer" style={{ padding: '8px 12px 12px' }}>
            {!user ? (
              <button
                onClick={joinRoom}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sign in to join the chat
              </button>
            ) : !isMember && blockReason !== 'banned' ? (
              <button
                onClick={joinRoom}
                disabled={joining}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: joining ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: joining ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {joining ? 'Joining…' : `Join ${community?.name || 'room'} to chat`}
              </button>
            ) : (
              <>
                {(replyTo || editing) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderBottom: 'none',
                      borderRadius: '12px 12px 0 0',
                      padding: '8px 12px',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
                      {editing ? 'Editing' : 'Replying to'}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12.5,
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {editing
                        ? replyPreview(editing.body, 60)
                        : `${replyTo?.author?.full_name || 'Student'}: ${replyPreview(replyTo?.body, 60)}`}
                    </span>
                    <button
                      onClick={resetComposer}
                      aria-label="Cancel"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        minHeight: 32,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: replyTo || editing ? '0 0 12px 12px' : 12,
                    padding: 6,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <textarea
                    ref={composerRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends on a physical keyboard; on a phone the
                      // on-screen keyboard needs Enter to be a newline.
                      if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    disabled={!canSendNow && !editing}
                    placeholder={canSendNow || editing ? 'Type a message…' : blockCopy}
                    rows={1}
                    aria-label="Message"
                    style={{
                      flex: 1,
                      minHeight: 40,
                      maxHeight: 132,
                      resize: 'none',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontFamily: 'inherit',
                      fontSize: 15,
                      lineHeight: 1.45,
                      color: 'var(--text-primary)',
                      padding: '9px 8px',
                      boxSizing: 'border-box',
                    }}
                  />

                  <button
                    onClick={() => send()}
                    disabled={(!isSendable(text) && !editing) || !canSendNow || sending}
                    aria-label={editing ? 'Save edit' : 'Send message'}
                    style={{
                      width: 44,
                      height: 44,
                      flexShrink: 0,
                      borderRadius: '50%',
                      border: 'none',
                      background: (isSendable(text) || editing) && canSendNow ? 'var(--accent)' : 'var(--disabled)',
                      color: 'var(--on-accent)',
                      fontSize: 17,
                      fontWeight: 700,
                      cursor: (isSendable(text) || editing) && canSendNow ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {editing ? '✓' : '➤'}
                  </button>
                </div>

                {!canSendNow && blockCopy && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 2px 0' }}>{blockCopy}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Message action sheet ── */}
        {actionSheet && (
          <Sheet onClose={() => setActionSheet(null)} title="Message">
            <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px', flexWrap: 'wrap' }}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    toggleReaction(actionSheet, emoji)
                    setActionSheet(null)
                  }}
                  aria-label={`React ${emoji}`}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    fontSize: 21,
                    cursor: 'pointer',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {actionSheet.author_id !== user?.id && (
              <SheetRow
                label="Reply"
                icon="↩"
                onClick={() => {
                  setReplyTo(actionSheet)
                  setEditing(null)
                  setActionSheet(null)
                  composerRef.current?.focus()
                }}
              />
            )}
            {actionSheet.author_id === user?.id && !actionSheet.deleted_at && (
              <SheetRow label="Edit" icon="✏️" onClick={() => startEdit(actionSheet)} />
            )}
            {actionSheet.body && (
              <SheetRow
                label="Copy text"
                icon="📋"
                onClick={() => {
                  navigator.clipboard?.writeText(actionSheet.body || '')
                  setActionSheet(null)
                  setNotice('Copied.')
                }}
              />
            )}
            {isModerator && !actionSheet.deleted_at && (
              <SheetRow
                label={actionSheet.pinned_at ? 'Unpin message' : 'Pin message'}
                icon="📌"
                onClick={() => togglePin(actionSheet, !actionSheet.pinned_at)}
              />
            )}
            {(actionSheet.author_id === user?.id || isModerator) && (
              <SheetRow label="Delete message" icon="🗑" danger onClick={() => removeMessage(actionSheet)} />
            )}

            {/* Report reason input, shown inline when reporting is requested. */}
            {actionSheet.author_id !== user?.id && !actionSheet.deleted_at && (
              <div style={{ padding: '8px 16px 4px', borderTop: '1px solid var(--border)', marginTop: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '8px 0 6px' }}>
                  🚩 REPORT THIS MESSAGE
                </p>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="What is wrong with it?"
                  rows={2}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 14,
                    resize: 'none',
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={submitReport}
                  disabled={reportReason.trim().length < 3}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    minHeight: 46,
                    borderRadius: 10,
                    border: 'none',
                    background: reportReason.trim().length < 3 ? 'var(--disabled)' : 'var(--danger)',
                    color: 'var(--on-accent)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: reportReason.trim().length < 3 ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Send report
                </button>
              </div>
            )}

            {/* The client only pre-filters the case it can actually know (self).
                Whether the target is another admin is enforced server-side in
                moderate_chat(), so targetIsPlatformAdmin is left false here —
                this is a courtesy hint, never the guard. */}
            {isModerator &&
              actionSheet.author_id !== user?.id &&
              canModerate({
                adminId: user?.id ?? null,
                targetId: actionSheet.author_id,
                adminIsPlatformAdmin: admin.isPlatformAdmin,
                targetIsPlatformAdmin: false,
              }) && (
                <SheetRow
                  label="Moderate this user"
                  icon="🛡"
                  onClick={() => {
                    setModTarget({ id: actionSheet.author_id, author: actionSheet.author })
                    setModAction('warn')
                    setModReason('')
                    setModMinutes(60)
                    setActionSheet(null)
                  }}
                />
              )}
          </Sheet>
        )}

        {/* ── Moderation sheet ── */}
        {modTarget && (
          <Sheet onClose={() => setModTarget(null)} title={modTarget.author?.full_name || 'Student'}>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px', padding: '0 20px' }}>
              {modTarget.author?.username ? `@${modTarget.author.username}` : 'Member of this room'}
            </p>

            <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', flexWrap: 'wrap' }}>
              {MODERATION_ACTIONS.map((a) => (
                <button
                  key={a.action}
                  onClick={() => setModAction(a.action)}
                  aria-pressed={modAction === a.action}
                  style={{
                    minHeight: 44,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: modAction === a.action ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: modAction === a.action ? 'var(--accent-light)' : 'var(--bg)',
                    color: modAction === a.action ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {a.label}
                </button>
              ))}
              {LIFT_ACTIONS.map((a) => (
                <button
                  key={a.action}
                  onClick={() => setModAction(a.action)}
                  aria-pressed={modAction === a.action}
                  style={{
                    minHeight: 44,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: modAction === a.action ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 20px 10px' }}>
              {MODERATION_ACTIONS.find((a) => a.action === modAction)?.hint ||
                (modAction === 'unmute' ? 'Lift an active mute' : 'Lift an active ban')}
            </p>

            {actionNeedsDuration(modAction) && (
              <div style={{ padding: '0 16px 12px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 6px' }}>Duration</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MODERATION_DURATIONS.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => setModMinutes(d.minutes)}
                      aria-pressed={modMinutes === d.minutes}
                      style={{
                        minHeight: 44,
                        padding: '0 14px',
                        borderRadius: 10,
                        border: modMinutes === d.minutes ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: modMinutes === d.minutes ? 'var(--accent-light)' : 'var(--bg)',
                        color: modMinutes === d.minutes ? 'var(--accent-text)' : 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modAction !== 'unmute' && modAction !== 'unban' && (
              <div style={{ padding: '0 16px 12px' }}>
                <textarea
                  value={modReason}
                  onChange={(e) => setModReason(e.target.value)}
                  placeholder="Reason (optional, kept in the audit log)"
                  rows={2}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 14,
                    resize: 'none',
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ padding: '0 16px' }}>
              <button
                onClick={runModeration}
                disabled={modBusy}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: modBusy
                    ? 'var(--disabled)'
                    : MODERATION_ACTIONS.find((a) => a.action === modAction)?.destructive
                      ? 'var(--danger)'
                      : 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: modBusy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {modBusy
                  ? 'Applying…'
                  : `${modAction.charAt(0).toUpperCase()}${modAction.slice(1)}${
                      actionNeedsDuration(modAction) ? ` · ${describeDuration(modMinutes)}` : ''
                    }`}
              </button>
            </div>
          </Sheet>
        )}

        {/* ── Reports sheet ── */}
        {showReports && (
          <Sheet onClose={() => setShowReports(false)} title="Open reports">
            {reports.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 20px 12px', margin: 0 }}>
                Nothing to review. 🎉
              </p>
            ) : (
              reports.map((r) => (
                <div key={r.id} style={{ padding: '10px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                    {r.target?.full_name || 'Student'}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                      {r.target?.username ? ` @${r.target.username}` : ''}
                    </span>
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 2px' }}>{r.reason}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                    reported by {r.reporter?.full_name || 'a student'} · {messageTime(r.created_at)}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => resolveReport(r.id, 'resolved')}
                      style={{
                        minHeight: 44,
                        padding: '0 16px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        fontWeight: 700,
                        fontSize: 13.5,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => resolveReport(r.id, 'dismissed')}
                      style={{
                        minHeight: 44,
                        padding: '0 16px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: 13.5,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => {
                        setShowReports(false)
                        setModTarget({ id: r.target_user_id, author: r.target })
                        setModAction('warn')
                        setModReason(r.reason)
                        setModMinutes(60)
                      }}
                      style={{
                        minHeight: 44,
                        padding: '0 16px',
                        borderRadius: 10,
                        border: '1px solid var(--danger)',
                        background: 'var(--bg)',
                        color: 'var(--danger)',
                        fontWeight: 700,
                        fontSize: 13.5,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      🛡 Moderate
                    </button>
                  </div>
                </div>
              ))
            )}
          </Sheet>
        )}
      </ErrorBoundary>
    </Layout>
  )
}

/** Highlight @mentions without dangerouslySetInnerHTML. */
function renderBody(body: string, isMine: boolean) {
  if (!body) return null
  return body.split(/(@[a-zA-Z0-9_]{2,32})/g).map((part, i) =>
    /^@[a-zA-Z0-9_]{2,32}$/.test(part) ? (
      <span key={i} style={{ fontWeight: 700, color: isMine ? 'inherit' : 'var(--accent)' }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

/** Bottom sheet shell — backdrop tap or ✕ closes it. */
function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="chat-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="chat-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
            margin: '0 0 8px',
            padding: '0 20px',
          }}
        >
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}

function SheetRow({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string
  icon: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      className="chat-sheet-row"
      onClick={onClick}
      style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
    >
      <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center' }} aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  )
}
