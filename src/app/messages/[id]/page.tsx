'use client'

/**
 * /messages/[id] — one 1:1 thread.
 *
 * Deliberately standalone (no <Layout>): a chat needs the whole screen, a
 * sticky header and a composer that stays above the keyboard. Only accepted
 * connections reach this page — `start_or_get_conversation` refuses to create
 * a thread otherwise, and the messages INSERT policy re-checks the connection
 * on every send (see 029_dms_connections.sql).
 *
 * Updates arrive over Supabase Realtime. If the socket dies (mobile browsers
 * kill WebSockets in the background), a slow poll takes over so a message is
 * never lost — the same fallback the retired chat page proved in production.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

import Avatar from '@/components/Avatar'
import { Icon } from '@/components/icons'
import { formatMessageTime } from '@/lib/messaging'

type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  message_type?: string | null
  is_deleted?: boolean | null
  created_at: string
}

const MAX_BODY = 4000
const POLL_MS = 20_000

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default function ChatPage() {
  const [user, setUser] = useState<any>(null)
  const [peer, setPeer] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const convId = params.id as string

  const append = useCallback((rows: Message[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id))
      const fresh = rows.filter((m) => !seen.has(m.id))
      return fresh.length ? [...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)) : prev
    })
  }, [])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, message_type, is_deleted, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (data) setMessages((data as Message[]).filter((m) => !m.is_deleted))
  }, [convId, supabase])

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/login?redirect=' + encodeURIComponent(`/messages/${convId}`))
          return
        }
        setUser(user)

        const { data: conv } = await supabase
          .from('conversations')
          .select('id, conversation_participants(profile_id, profiles(full_name, username, avatar_url))')
          .eq('id', convId)
          .maybeSingle()

        if (!conv) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const participants = (conv as any).conversation_participants || []
        const peerRow = participants.find((p: any) => p.profile_id !== user.id)
        let peerProfile = one(peerRow?.profiles)
        let peerId: string | null = peerRow?.profile_id ?? null

        await fetchMessages()

        // The participants policy may only return my own row, and a private
        // profile can hide the name even when the row is visible. The thread
        // is still valid in both cases: identify the peer from the messages.
        if (!peerId) {
          const { data: firstPeerMessage } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('conversation_id', convId)
            .neq('sender_id', user.id)
            .limit(1)
            .maybeSingle()
          peerId = firstPeerMessage?.sender_id ?? null
        }

        if (!peerProfile && peerId) {
          const { data } = await supabase
            .from('profiles')
            .select('full_name, username, avatar_url')
            .eq('id', peerId)
            .single()
          peerProfile = data
        }

        // A conversation with no peer at all is not a DM we can render.
        if (!peerId) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setPeer(peerProfile || { full_name: null, username: null, avatar_url: null })
        setLoading(false)
        await supabase.rpc('mark_conversation_read', { p_conversation_id: convId })
      } catch {
        setNotFound(true)
        setLoading(false)
      }
    }
    load()
  }, [convId, supabase, router, fetchMessages])

  // Live inserts; a slow poll only if Realtime cannot connect.
  useEffect(() => {
    if (!convId || !user) return
    let poll: ReturnType<typeof setInterval> | null = null
    const channel = supabase
      .channel(`dm:${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload: any) => {
          append([payload.new])
          supabase.rpc('mark_conversation_read', { p_conversation_id: convId })
        }
      )
      .subscribe((status) => {
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !poll) {
          poll = setInterval(fetchMessages, POLL_MS)
        }
      })
    return () => {
      supabase.removeChannel(channel)
      if (poll) clearInterval(poll)
    }
  }, [convId, user, supabase, append, fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async () => {
    const body = text.trim()
    if (!body || !user || sending) return
    if (body.length > MAX_BODY) {
      setSendError(`Keep it under ${MAX_BODY} characters`)
      return
    }
    setSending(true)
    setSendError(null)
    setText('')
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: user.id,
        content: body,
        message_type: 'text',
      })
      .select('id, conversation_id, sender_id, content, message_type, is_deleted, created_at')
      .single()
    setSending(false)
    if (error) {
      setText(body) // never lose what they typed
      setSendError('Message not sent — you can only message accepted connections')
      return
    }
    if (data) append([data as Message])
    inputRef.current?.focus()
  }

  if (loading)
    return (
      <div
        className="chat-doodle-bg"
        style={{
          height: 'var(--app-dvh)',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          margin: '0 auto',
        }}
        aria-busy="true"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          <div className="skeleton" style={{ width: 140, height: 16, borderRadius: 6 }} />
        </div>
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                height: 46,
                width: i % 2 ? '58%' : '66%',
                borderRadius: 14,
                alignSelf: i % 2 ? 'flex-end' : 'flex-start',
              }}
            />
          ))}
        </div>
      </div>
    )

  if (notFound || !peer)
    return (
      <div
        style={{
          minHeight: 'var(--app-dvh)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <span
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 14px',
              borderRadius: 16,
              background: 'var(--accent-light)',
              color: 'var(--accent-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="message" size={26} />
          </span>
          <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Conversation not available
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
            You can only open chats with students you&apos;re connected with. Send a request first — once they accept,
            messaging unlocks for both of you.
          </p>
          <button
            onClick={() => router.push('/messages?tab=find')}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Find people to connect with
          </button>
        </div>
      </div>
    )

  const peerName = peer.full_name || (peer.username ? `@${peer.username}` : 'Student')

  return (
    <div
      className="chat-doodle-bg"
      style={{
        height: 'var(--app-dvh)',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 720,
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          paddingTop: 'calc(10px + env(safe-area-inset-top))',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
          zIndex: 5,
        }}
      >
        <button
          onClick={() => router.push('/messages?tab=chats')}
          aria-label="Back to messages"
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            border: 'none',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', transform: 'rotate(90deg)' }}>
            <Icon name="chevron" size={19} />
          </span>
        </button>

        <Avatar
          name={peer.full_name}
          avatarUrl={peer.avatar_url}
          size={38}
          onClick={() => peer.username && router.push(`/profile/${peer.username}`)}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            onClick={() => peer.username && router.push(`/profile/${peer.username}`)}
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: peer.username ? 'pointer' : 'default',
            }}
          >
            {peerName}
          </p>
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--success-text)',
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="check" size={11} /> Connected
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', margin: 'auto 0', padding: '32px 12px' }}>
            <Avatar name={peer.full_name} avatarUrl={peer.avatar_url} size={60} />
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 4px' }}>
              You&apos;re connected with {peerName}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              Say hi and ask about their campus, branch or the drives they&apos;ve seen.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const mine = m.sender_id === user?.id
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '78%',
                  background: mine ? 'var(--accent)' : 'var(--bg)',
                  border: mine ? '1px solid transparent' : '1px solid var(--border)',
                  borderRadius: 14,
                  borderBottomRightRadius: mine ? 4 : 14,
                  borderBottomLeftRadius: mine ? 14 : 4,
                  padding: '9px 13px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: mine ? 'var(--on-accent)' : 'var(--text-primary)',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: mine ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)',
                    margin: '3px 0 0',
                    textAlign: 'right',
                  }}
                >
                  {formatMessageTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          padding: '10px 14px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        }}
      >
        {sendError && (
          <p role="alert" style={{ fontSize: 11.5, color: 'var(--danger)', margin: '0 0 6px' }}>
            {sendError}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (sendError) setSendError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={`Message ${peerName}…`}
            aria-label={`Message ${peerName}`}
            maxLength={MAX_BODY}
            style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid var(--border)',
              borderRadius: 22,
              padding: '11px 16px',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
              background: 'var(--bg-secondary)',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Send message"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: !text.trim() || sending ? 'var(--disabled)' : 'var(--accent)',
              color: 'var(--on-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !text.trim() || sending ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
