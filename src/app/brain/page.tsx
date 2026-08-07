'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  sources?: { source: string; similarity?: number }[]
  usedMemory?: boolean
  saved?: boolean
  saving?: boolean
}

export default function BrainPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [docs, setDocs] = useState<any[]>([])
  const [memories, setMemories] = useState<any[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'chat' | 'files'>('chat')
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const loadDocs = async () => {
    const res = await fetch('/api/brain/documents', { credentials: 'include' })
    if (res.ok) { const json = await res.json(); setDocs(json.data || []) }
  }

  const loadMemories = async () => {
    const res = await fetch('/api/brain/memories', { credentials: 'include' })
    if (res.ok) { const json = await res.json(); setMemories(json.data || []) }
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
      loadDocs()
      loadMemories()
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAsk = async () => {
    const question = input.trim()
    if (!question || asking) return
    setInput('')
    setError('')
    setMessages(m => [...m, { role: 'user', content: question }])
    setAsking(true)
    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/brain/ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to get an answer.')
      setMessages(m => [...m, {
        role: 'assistant',
        content: json.answer,
        sources: json.sources,
        usedMemory: json.usedMemory,
      }])
    } catch (e: any) {
      setError(e.message)
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message}` }])
    } finally {
      setAsking(false)
    }
  }

  const handleSaveMemory = async (index: number) => {
    const target = messages[index]
    if (!target || target.role !== 'assistant') return
    const prev = messages[index - 1]
    if (!prev || prev.role !== 'user') return
    setMessages(msgs => msgs.map((m, i) => i === index ? { ...m, saving: true } : m))
    setError('')
    try {
      const res = await fetch('/api/brain/memorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prev.content, answer: target.content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save memory.')
      setMessages(msgs => msgs.map((m, i) => i === index ? { ...m, saved: true, saving: false } : m))
      loadMemories()
    } catch (e: any) {
      setError(e.message)
      setMessages(msgs => msgs.map((m, i) => i === index ? { ...m, saving: false } : m))
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadStatus('Reading file...')
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/brain/upload', { method: 'POST', credentials: 'include', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed.')
      setUploadStatus(`✅ ${json.document.title} — ${json.chunkCount} chunks embedded`)
      setShowUpload(false)
      loadDocs()
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) {
      setError(e.message)
      setUploadStatus('')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Delete this document from your brain?')) return
    await fetch(`/api/brain/documents?id=${id}`, { method: 'DELETE', credentials: 'include' })
    loadDocs()
  }

  const handleDeleteMemory = async (id: string) => {
    if (!confirm('Forget this memory?')) return
    await fetch(`/api/brain/memories?id=${id}`, { method: 'DELETE', credentials: 'include' })
    loadMemories()
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const,
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🧠 AI Brain</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Your personal academic memory — upload notes, ask anything, never forget
            </p>
          </div>
          {user && (
            <button onClick={() => setShowUpload(s => !s)}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Upload
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {[{ key: 'chat', label: 'Ask your Brain' }, { key: 'files', label: `My Files (${docs.length})` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 18px', fontSize: 14, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Upload */}
        {showUpload && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Add to your brain</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              PDF, TXT, MD, or photos of notes (PNG/JPG). Text is embedded and becomes searchable.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'white', fontFamily: 'inherit' }} />
              {uploading && <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted)' }}>⏳ {uploadStatus}</span>}
            </div>
            {uploadStatus && !uploading && <p style={{ fontSize: 13, color: '#15803d', margin: '10px 0 0', fontWeight: 600 }}>{uploadStatus}</p>}
          </div>
        )}

        {tab === 'chat' && (
          <div>
            {/* Chat */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
                  <p style={{ fontSize: 14, margin: '0 0 4px' }}>Ask anything about your notes.</p>
                  <p style={{ fontSize: 12, margin: 0 }}>Try: {'"Summarize everything I know about Binary Trees"'}</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%', background: m.role === 'user' ? 'var(--accent)' : 'white',
                  color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  borderRadius: 14, padding: '12px 16px', boxShadow: 'var(--shadow-sm)',
                  whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14,
                }}>
                  {m.content}
                  {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.sources.map((s, j) => (
                        <span key={j} style={{ fontSize: 11, background: '#f5f3ff', color: '#6d28d9', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                          📄 {s.source}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' && m.usedMemory && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>🧠 used your saved memories</p>
                  )}
                  {m.role === 'assistant' && !m.saved && (
                    <button onClick={() => handleSaveMemory(i)} disabled={m.saving}
                      style={{ marginTop: 10, fontSize: 12, background: '#eff6ff', color: 'var(--accent)', border: '1px solid #bfdbfe', padding: '5px 12px', borderRadius: 20, fontWeight: 600, cursor: m.saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      {m.saving ? 'Saving...' : '💾 Save to memory'}
                    </button>
                  )}
                  {m.role === 'assistant' && m.saved && (
                    <p style={{ fontSize: 11, color: '#15803d', margin: '8px 0 0', fontWeight: 600 }}>✓ Saved to your memory</p>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="Ask your brain..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleAsk} disabled={!input.trim() || asking}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: !input.trim() || asking ? '#93c5fd' : 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {asking ? '…' : 'Ask'}
              </button>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div>
            {/* Documents */}
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>📚 Your documents</h3>
            {docs.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
                No documents yet. Upload your notes to start building your brain.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {docs.map(d => (
                  <div key={d.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{d.file_type === 'pdf' ? '📕' : d.file_type === 'png' || d.file_type === 'jpg' || d.file_type === 'jpeg' ? '📸' : '📄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        {d.chunkCount} chunks · {Math.round(d.char_count / 1000)}k chars · {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteDoc(d.id)}
                      style={{ fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Memories */}
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>💾 Your memories ({memories.length})</h3>
            {memories.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                Save a chat exchange to build your long-term memory.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {memories.map(m => (
                  <div key={m.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 16px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {m.knowledge_gained && <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 4px' }}><strong>Learned:</strong> {m.knowledge_gained}</p>}
                        {m.struggles_faced && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}><strong>Struggles:</strong> {m.struggles_faced}</p>}
                        {m.core_facts && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}><strong>Facts:</strong> {m.core_facts}</p>}
                        {m.is_core_memory && <span style={{ fontSize: 11, background: '#fefce8', color: '#a16207', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⭐ Core memory</span>}
                      </div>
                      <button onClick={() => handleDeleteMemory(m.id)}
                        style={{ fontSize: 12, background: 'none', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        Forget
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
