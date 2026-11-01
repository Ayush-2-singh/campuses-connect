'use client'

/**
 * LIVE BATTLE HUB — create a room, join by code, or reopen one you host.
 *
 * Creation calls `live_quiz_create`, which copies the selected questions into an
 * immutable snapshot and allocates the 6-digit room code. Everything on this
 * screen is a thin control over that one RPC: no scoring, no timing and no
 * question content is decided in the browser.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

type BankQuestion = { id: string; question_text: string; difficulty: string; subject: string; marks: number }
type MyRoom = {
  id: string
  title: string
  room_code: string
  status: string
  question_count: number
  created_at: string
}

const STATUS_TONE: Record<string, string> = {
  draft: 'hc-tag--ghost',
  waiting: 'hc-tag--warn',
  live: 'hc-tag--success',
  paused: 'hc-tag--warn',
  completed: 'hc-tag--ghost',
  cancelled: 'hc-tag--danger',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 4,
}

export default function LiveHub({ user }: { user: any }) {
  const supabase = createClient()
  const router = useRouter()

  const [bank, setBank] = useState<BankQuestion[]>([])
  const [rooms, setRooms] = useState<MyRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('DSA')
  const [timer, setTimer] = useState(20)
  const [points, setPoints] = useState(100)
  const [bonus, setBonus] = useState(20)
  const [maxParticipants, setMaxParticipants] = useState(500)
  const [allowLate, setAllowLate] = useState(true)
  const [visibility, setVisibility] = useState<'code_only' | 'public'>('code_only')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ id: string; room_code: string; question_count: number } | null>(null)

  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [bankRes, roomsRes] = await Promise.all([
      supabase
        .from('question_bank')
        .select('id, question_text, difficulty, subject, marks')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('competitions')
        .select('id, title, room_code, status, question_count, created_at')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    if (bankRes.error) setError('Could not load your question bank.')
    setBank((bankRes.data ?? []) as BankQuestion[])
    setRooms((roomsRes.data ?? []) as MyRoom[])
    setLoading(false)
  }, [supabase, user.id])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const pickRandom = (count: number) => {
    const shuffled = [...bank].sort(() => Math.random() - 0.5)
    setSelected(shuffled.slice(0, count).map((q) => q.id))
  }

  const create = async () => {
    if (!title.trim()) {
      setError('Give the competition a title first.')
      return
    }
    if (selected.length === 0) {
      setError('Pick at least one question from your bank.')
      return
    }
    setCreating(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('live_quiz_create', {
        p_title: title.trim(),
        p_question_ids: selected,
        p_category: category,
        p_timer_seconds: timer,
        p_points_correct: points,
        p_max_speed_bonus: bonus,
        p_max_participants: maxParticipants,
        p_allow_late_join: allowLate,
        p_visibility: visibility,
      })
      if (rpcError) throw rpcError
      const room = Array.isArray(data) ? data[0] : data
      if (!room?.room_code) throw new Error('The room was created without a code — try again.')
      setCreated({ id: room.id, room_code: room.room_code, question_count: room.question_count ?? selected.length })
      setNotice('Room created. Share the code with your viewers.')
      setTitle('')
      setSelected([])
      load()
    } catch (err: any) {
      setError(err?.message || 'Could not create the room.')
    } finally {
      setCreating(false)
    }
  }

  const join = () => {
    const code = joinCode.replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) {
      setError('A room code is six digits.')
      return
    }
    router.push(`/live/${code}`)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      setError('Copy failed — select the text and copy it manually.')
    }
  }

  const joinUrl = created
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/live/${created.room_code}`
    : ''

  return (
    <div className="hc-page">
      <div className="hc-page-head hc-reveal">
        <button className="hc-back" onClick={() => router.push('/compete')} aria-label="Back to Compete">
          <Icon name="chevron" size={16} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span className="hc-eyebrow">Compete · Live Battle</span>
        <h1 className="hc-h1">
          Run a live quiz, <em className="hc-em">right now.</em>
        </h1>
        <p className="hc-lede">
          Build a room, share the six-digit code on your stream, and students answer in sync. YouTube carries the
          session — this page owns the timing and the scoring.
        </p>
      </div>

      {notice && (
        <p className="hc-note hc-reveal" style={{ marginBottom: 14 }} role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="hc-alert" role="alert">
          {error}
        </div>
      )}

      {/* Join */}
      <section className="hc-card hc-reveal" aria-label="Join a room" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="users" size={16} />
          <strong style={{ fontSize: 14 }}>Join with a code</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="482931"
            aria-label="Six-digit room code"
            style={{
              flex: '1 1 140px',
              minWidth: 0,
              padding: '12px 14px',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: '0.22em',
              textAlign: 'center',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <button className="hc-btn hc-btn--primary" type="button" onClick={join}>
            <Icon name="chevron" size={14} /> Join room
          </button>
        </div>
      </section>

      {/* Created room */}
      {created && (
        <section
          className="hc-card hc-reveal"
          aria-label="Room created"
          style={{ marginBottom: 16, borderColor: 'var(--accent)', background: 'var(--accent-light)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={16} />
            <strong style={{ fontSize: 14 }}>Room is live — share this</strong>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: 'var(--accent-text)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {created.room_code}
          </p>
          <div className="hc-tags">
            <span className="hc-tag">{created.question_count} questions</span>
            <span className="hc-tag hc-tag--ghost">Students join at /live/{created.room_code}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="hc-btn" type="button" onClick={() => copy(created.room_code, 'code')}>
              <Icon name="copy" size={13} /> {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button className="hc-btn" type="button" onClick={() => copy(joinUrl, 'link')}>
              <Icon name="copy" size={13} /> {copied === 'link' ? 'Copied' : 'Copy join link'}
            </button>
            <Link
              className="hc-btn hc-btn--primary"
              href={`/compete/live/host/${created.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Icon name="gamepad" size={13} /> Open host controls
            </Link>
          </div>
        </section>
      )}

      {/* Create */}
      <section className="hc-form hc-reveal" aria-label="Create a room">
        <h2 className="hc-form-title">New competition</h2>

        <label>
          <span style={fieldLabel}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday DSA Live Battle"
            maxLength={140}
          />
        </label>

        <div className="hc-form-row">
          <label>
            <span style={fieldLabel}>Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="DSA" maxLength={60} />
          </label>
          <label>
            <span style={fieldLabel}>Visibility</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'code_only' | 'public')}>
              <option value="code_only">Code only</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>

        <div className="hc-form-row">
          <label>
            <span style={fieldLabel}>Seconds per question</span>
            <input type="number" min={5} max={300} value={timer} onChange={(e) => setTimer(Number(e.target.value))} />
          </label>
          <label>
            <span style={fieldLabel}>Points per correct answer</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="hc-form-row">
          <label>
            <span style={fieldLabel}>Max speed bonus</span>
            <input type="number" min={0} max={200} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
          </label>
          <label>
            <span style={fieldLabel}>Maximum participants</span>
            <input
              type="number"
              min={1}
              max={5000}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
            />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={allowLate}
            onChange={(e) => setAllowLate(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Allow students to join after the quiz starts
        </label>

        {/* Question picker */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...fieldLabel, marginBottom: 0 }}>Questions · {selected.length} selected</span>
            <span className="hc-spacer" />
            <button className="hc-chip" type="button" onClick={() => pickRandom(10)} disabled={bank.length === 0}>
              Random 10
            </button>
            <button className="hc-chip" type="button" onClick={() => setSelected([])} disabled={selected.length === 0}>
              Clear
            </button>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: 90, borderRadius: 10, marginTop: 8 }} />
          ) : bank.length === 0 ? (
            <p className="hc-note" style={{ marginTop: 8 }}>
              Your bank is empty. <Link href="/compete/live/questions">Add questions first →</Link>
            </p>
          ) : (
            <div
              style={{
                marginTop: 8,
                maxHeight: 280,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-secondary)',
              }}
            >
              {bank.map((q) => {
                const checked = selected.includes(q.id)
                return (
                  <label
                    key={q.id}
                    style={{
                      display: 'flex',
                      gap: 9,
                      alignItems: 'flex-start',
                      padding: '9px 11px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: checked ? 'var(--accent-light)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(q.id)}
                      style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
                    />
                    <span style={{ minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {q.question_text}
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {q.subject} · {q.difficulty} · {q.marks} pts
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <button className="hc-btn hc-btn--primary hc-btn--block" type="button" onClick={create} disabled={creating}>
          <Icon name="zap" size={14} /> {creating ? 'Creating…' : 'Create room & get code'}
        </button>
      </section>

      {/* My rooms */}
      <section className="hc-reveal" aria-label="Your competitions" style={{ marginTop: 18 }}>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 8px',
          }}
        >
          Your recent competitions
        </h2>
        {rooms.length === 0 ? (
          <p className="hc-empty-s" style={{ margin: 0 }}>
            Nothing yet — your first room will appear here.
          </p>
        ) : (
          <div className="hc-grid hc-grid--list" style={{ gap: 6 }}>
            {rooms.map((room) => (
              <div
                key={room.id}
                className="hc-card"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '11px 13px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {room.title}
                  </p>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {room.room_code} · {room.question_count} questions
                  </p>
                </div>
                <span className={`hc-tag ${STATUS_TONE[room.status] ?? ''}`}>{room.status}</span>
                <Link className="hc-chip" href={`/compete/live/host/${room.id}`} style={{ textDecoration: 'none' }}>
                  <Icon name="gamepad" size={12} /> Host
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
