'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

import Avatar from '@/components/Avatar'
import { CardSkeleton } from '@/components/Skeleton'

const timeAgo = (date: string) => {
  const d = new Date(date)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 1) return `Yesterday, ${time}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + time
}

export default function ChatPage() {
  const [user, setUser] = useState<any>(null)
  const [peer, setPeer] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const convId = params.id as string

  const append = useCallback((rows: any[]) => {
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id))
      const fresh = rows.filter(m => !seen.has(m.id))
      return fresh.length ? [...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)) : prev
    })
  }, [])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(full_name, username, avatar_url)')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages((data || []).filter((m: any) => !m.is_deleted))
  }, [convId, supabase])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent('/connections?tab=chats')); return }
      setUser(user)

      const { data: conv } = await supabase
        .from('conversations')
        .select('id, conversation_participants(profile_id, profiles(full_name, username, avatar_url))')
        .eq('id', convId)
        .maybeSingle()

      if (!conv) { setNotFound(true); setLoading(false); return }
      const peerRow = (conv.conversation_participants || []).find((p: any) => p.profile_id !== user.id)
      setPeer(peerRow?.profiles || null)

      await fetchMessages()
      setLoading(false)
      await supabase.rpc('mark_conversation_read', { p_conversation_id: convId })
    }
    load()
  }, [convId, supabase, router, fetchMessages])

  // Realtime: live inserts + a gentle polling fallback so mobile always catches up.
  useEffect(() => {
    if (!convId) return
    const channel = supabase
      .channel(`messages:${convId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload: any) => {
          append([payload.new])
          supabase.rpc('mark_conversation_read', { p_conversation_id: convId })
        })
      .subscribe()
    const poll = setInterval(fetchMessages, 8000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [convId, supabase, append, fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const send = async () => {
    const body = text.trim()
    if (!body || !user || sending) return
    setSending(true)
    setText('')
    const { error } = await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: user.id,
      content: body,
      message_type: 'text',
    })
    setSending(false)
    if (error) setText(body) // restore on failure so nothing is lost
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', padding: '24px 16px', maxWidth: 640, margin: '0 auto' }}>
      <CardSkeleton rows={4} />
    </div>
  )

  if (notFound || !peer) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 44, marginBottom: 10 }}>🔒</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Conversation not found</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>You can only open chats with people you&apos;re connected with.</p>
        <button onClick={() => router.push('/connections?tab=chats')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>← Back to Chats</button>
      </div>
    </div>
  )

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', maxWidth: 640, margin: '0 auto', paddingBottom: 84 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push('/messages')} aria-label="Back" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-8px 0 -8px -10px', flexShrink: 0 }}>←</button>
        <Avatar name={peer.full_name} avatarUrl={peer.avatar_url} size={36} onClick={() => peer.username && router.push(`/profile/${peer.username}`)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.full_name || '@' + peer.username}</p>
          <p style={{ fontSize: 11.5, color: 'var(--success-text)', margin: 0 }}>Connected ✓</p>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: '40px 0' }}>You&apos;re connected — say hi 👋</p>
        )}
        {messages.map(m => {
          const mine = m.sender_id === user.id
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', background: mine ? 'var(--accent)' : 'var(--bg)', border: mine ? 'none' : '1px solid var(--border)', borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4, padding: '9px 13px', boxShadow: mine ? 'var(--accent-glow)' : 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: mine ? 'var(--on-accent)' : 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                <p style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', margin: '3px 0 0', textAlign: 'right' }}>{timeAgo(m.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 640, margin: '0 auto', background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 8, zIndex: 30 }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder={`Message ${peer.full_name || peer.username}...`}
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 22, padding: '10px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }}
        />
        <button onClick={send} disabled={!text.trim() || sending}
          style={{ padding: '10px 20px', borderRadius: 22, border: 'none', background: !text.trim() || sending ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: !text.trim() || sending ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
