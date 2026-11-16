'use client'

// ═══════════════════════════════════════════════════════════════════════════
// CodeSprintRoom — the live 2–8 player Code Sprint.
//
//   entry → lobby → countdown → running → done
//
// The room lifecycle is the typing battle's (create/join by 6-digit code,
// ready-up, host start), the text is seeded per room on the server, and the
// 60-second clock is the same for every seat. Completion calls
// `complete_code_sprint()`, which verifies the typed words against the room's
// stored text and records verified characters as the seat's score; when the last
// seat submits, the room finishes and the winner is the highest verified score.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TypingTracker, diffInput } from '@/lib/games/typing'
import { CODE_SPRINT_MS, countdownStyle, sprintClock } from '@/lib/games/codeSprint'
import { copyToClipboard, getGuestId, getSavedNickname, isValidRoomCode, saveNickname } from '@/lib/games/utils'
import SprintText from './SprintText'

type Phase = 'entry' | 'lobby' | 'countdown' | 'running' | 'done'

type Seat = {
  player_id: string
  nickname: string
  is_host: boolean
  is_ready: boolean
  user_id: string | null
  score: number | null
}

type RoomRow = {
  id: string
  room_code: string
  host_id: string
  status: 'waiting' | 'starting' | 'active' | 'finished' | 'expired'
  round_started_at: string | null
}

type MyResult = { wpm: number; accuracy: number; chars: number; words: number }

export default function CodeSprintRoom() {
  const supabase = useMemo(() => createClient(), [])
  const guestId = useRef(getGuestId()).current

  const [phase, setPhase] = useState<Phase>('entry')
  const [nickname, setNickname] = useState(getSavedNickname())
  const [codeInput, setCodeInput] = useState('')
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [startsAt, setStartsAt] = useState<number | null>(null)
  const [countLabel, setCountLabel] = useState('3')
  const [words, setWords] = useState<string[]>([])
  const [completed, setCompleted] = useState(0)
  const [current, setCurrent] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState({ net: 0, accuracy: 100 })
  const [myResult, setMyResult] = useState<MyResult | null>(null)
  const [winner, setWinner] = useState<string | null>(null)

  const trackerRef = useRef<TypingTracker | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  const isHost = room?.host_id === guestId
  const remaining = Math.max(0, CODE_SPRINT_MS - elapsed)
  const pct = Math.min(100, Math.round((elapsed / CODE_SPRINT_MS) * 100))

  const loadSeats = useCallback(
    async (roomId: string) => {
      const { data } = await supabase
        .from('game_players')
        .select('player_id, nickname, is_host, is_ready, user_id, score')
        .eq('room_id', roomId)
        .order('joined_at')
      if (data) setSeats(data as Seat[])
    },
    [supabase]
  )

  const loadRoom = useCallback(
    async (code: string) => {
      const { data } = await supabase
        .from('game_rooms')
        .select('id, room_code, host_id, status, round_started_at')
        .eq('room_code', code)
        .maybeSingle()
      return (data as RoomRow) ?? null
    },
    [supabase]
  )

  // Realtime: room status + seats. A finished room reveals the winner.
  useEffect(() => {
    if (!room?.id) return
    const roomId = room.id
    const channel = supabase
      .channel(`code-sprint-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        (payload: any) => {
          const r = payload.new as RoomRow
          setRoom((prev) => (prev ? { ...prev, ...r } : prev))
          if (r.status === 'active' && r.round_started_at) {
            setStartsAt(new Date(r.round_started_at).getTime())
            setPhase('countdown')
          } else if (r.status === 'finished') {
            setPhase('done')
            void (async () => {
              const { data } = await supabase
                .from('game_winners')
                .select('winner_nickname')
                .eq('room_id', roomId)
                .maybeSingle()
              if (data) setWinner((data as { winner_nickname: string }).winner_nickname)
            })()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `room_id=eq.${roomId}` },
        () => void loadSeats(roomId)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [room?.id, supabase, loadSeats])

  // Countdown: server deadline → 3/2/1/GO → play.
  useEffect(() => {
    if (phase !== 'countdown' || !startsAt) return
    const tick = () => {
      setCountLabel(countdownStyle(startsAt, Date.now()))
      if (Date.now() >= startsAt) setPhase('running')
    }
    tick()
    const t = setInterval(tick, 100)
    return () => clearInterval(t)
  }, [phase, startsAt])

  // Words only exist once the room is active; the server gates the read.
  useEffect(() => {
    if (phase !== 'running' || !room?.id || words.length > 0) return
    void (async () => {
      const { data, error: e } = await supabase.rpc('get_code_sprint_room_text', {
        p_room_id: room.id,
        p_player_id: guestId,
      })
      if (e || !data) {
        setError('Could not load the room code.')
        return
      }
      const w = (data as { words?: string[] }).words ?? []
      setWords(w)
      trackerRef.current = new TypingTracker(w, Date.now())
      submittedRef.current = false
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    })()
  }, [phase, room?.id, words.length, supabase, guestId])

  const submit = useCallback(async () => {
    const tr = trackerRef.current
    if (!tr || submittedRef.current || !room?.id) return
    submittedRef.current = true

    const stats = tr.stats
    const { data } = await supabase.rpc('complete_code_sprint', {
      p_room_id: room.id,
      p_player_id: guestId,
      p_words: tr.submission,
      p_correct_chars: stats.correctChars,
      p_total_chars: stats.totalTyped,
    })

    const r = data as {
      wpm: number
      accuracy: number
      correct_chars: number
      correct_words: number
      winner: string | null
    } | null

    setMyResult({
      wpm: Math.round(Number(r?.wpm) || tr.stats.wpm),
      accuracy: Math.round(Number(r?.accuracy) || tr.stats.accuracy),
      chars: Number(r?.correct_chars) || stats.correctChars,
      words: Number(r?.correct_words) || tr.completedWords,
    })
    if (r?.winner) {
      const seat = seats.find((s) => s.player_id === r.winner)
      if (seat) setWinner(seat.nickname)
    }
    setPhase('done')
    void loadSeats(room.id)
  }, [supabase, guestId, room?.id, seats, loadSeats])

  // Clock driven by the server start time, so every seat stops together.
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => {
      const tr = trackerRef.current
      if (!tr || !startsAt) return
      const ms = Math.max(0, Date.now() - startsAt)
      setElapsed(ms)
      const s = tr.stats
      setLive({ net: Math.round(s.wpm), accuracy: Math.round(s.accuracy) })
      if (ms >= CODE_SPRINT_MS) void submit()
    }, 500)
    return () => clearInterval(t)
  }, [phase, startsAt, submit])

  const applyKey = useCallback(
    (key: string) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished || submittedRef.current) return
      if (tr.handleKey(key)) setCompleted(tr.completedWords)
      if (tr.isFinished) void submit()
    },
    [submit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      if (e.nativeEvent.isComposing || e.key === 'Unidentified') return
      if (e.key === 'Backspace') {
        e.preventDefault()
        applyKey('Backspace')
        setCurrent(tr.currentInput)
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        applyKey(' ')
        setCurrent(tr.currentInput)
        return
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        applyKey(e.key)
        setCurrent(tr.currentInput)
      }
    },
    [applyKey]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      const prev = tr.currentInput
      const keys = diffInput(prev, e.target.value)
      if (!keys) {
        setCurrent(prev)
        return
      }
      for (const key of keys) {
        applyKey(key)
        if (tr.isFinished) break
      }
      setCurrent(tr.currentInput)
    },
    [applyKey]
  )

  const ensureNickname = () => {
    const name = nickname.trim()
    if (!name) {
      setError('Enter a nickname first.')
      return false
    }
    saveNickname(name)
    return true
  }

  const createRoom = async () => {
    if (!ensureNickname()) return
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('create_code_sprint_room', {
      p_player_id: guestId,
      p_nickname: nickname.trim(),
    })
    setBusy(false)
    if (e || !data) {
      setError('Could not create the room.')
      return
    }
    const r = data as { room_code: string; room_id: string }
    const existing = await loadRoom(r.room_code)
    if (existing) {
      setRoom(existing)
      await loadSeats(existing.id)
      setPhase('lobby')
    }
  }

  const joinRoom = async () => {
    const code = codeInput.trim()
    if (!isValidRoomCode(code)) {
      setError('Room code must be exactly 6 digits.')
      return
    }
    if (!ensureNickname()) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('join_code_sprint_room', {
      p_room_code: code,
      p_player_id: guestId,
      p_nickname: nickname.trim(),
    })
    setBusy(false)
    if (e) {
      setError(
        e.message.includes('room_full')
          ? 'That room is full (8 racers).'
          : e.message.includes('nickname_taken')
            ? 'That nickname is taken in this room.'
            : 'Could not join — check the code.'
      )
      return
    }
    const existing = await loadRoom(code)
    if (existing) {
      setRoom(existing)
      await loadSeats(existing.id)
      setPhase('lobby')
    }
  }

  const toggleReady = async () => {
    if (!room) return
    await supabase.rpc('toggle_code_sprint_ready', { p_room_id: room.id, p_player_id: guestId })
    void loadSeats(room.id)
  }

  const startMatch = async () => {
    if (!room) return
    setBusy(true)
    const { data, error: e } = await supabase.rpc('start_code_sprint_match', {
      p_room_id: room.id,
      p_player_id: guestId,
    })
    setBusy(false)
    if (e || !data) {
      setError(e?.message.includes('not_all_ready') ? 'Everyone must be ready.' : 'Could not start the sprint.')
      return
    }
    setStartsAt(new Date((data as { starts_at: string }).starts_at).getTime())
    setPhase('countdown')
  }

  const leave = async () => {
    if (room) await supabase.rpc('leave_room', { p_room_id: room.id, p_player_id: guestId })
    setRoom(null)
    setSeats([])
    setWords([])
    setMyResult(null)
    setWinner(null)
    setElapsed(0)
    setStartsAt(null)
    setPhase('entry')
  }

  const standings = [...seats].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const nicknameField = (
    <input
      value={nickname}
      onChange={(e) => setNickname(e.target.value)}
      maxLength={20}
      placeholder="Your nickname"
      aria-label="Your nickname"
      style={{
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '11px 14px',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'inherit',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        boxSizing: 'border-box',
      }}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {phase === 'entry' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Race 2–8 students over the same code for 60 seconds. Highest verified characters wins.
          </p>
          {nicknameField}
          <button
            onClick={createRoom}
            disabled={busy || !nickname.trim()}
            style={{
              background: busy || !nickname.trim() ? 'var(--disabled)' : 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 12,
              padding: 13,
              fontSize: 14,
              fontWeight: 800,
              cursor: busy || !nickname.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            CREATE SPRINT ROOM
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              placeholder="6-digit room code"
              inputMode="numeric"
              maxLength={6}
              aria-label="Room code"
              style={{
                flex: 1,
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '11px 14px',
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: 3,
                textAlign: 'center',
                fontFamily: '"SF Mono", "JetBrains Mono", monospace',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                minWidth: 0,
              }}
            />
            <button
              onClick={joinRoom}
              disabled={busy || codeInput.length !== 6 || !nickname.trim()}
              style={{
                background: busy || codeInput.length !== 6 || !nickname.trim() ? 'var(--disabled)' : 'var(--accent)',
                color: busy || codeInput.length !== 6 || !nickname.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
                border: 'none',
                borderRadius: 12,
                padding: '11px 20px',
                fontSize: 13.5,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              JOIN
            </button>
          </div>
          {error && (
            <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'lobby' && room && (
        <>
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                margin: '0 0 6px',
              }}
            >
              ROOM CODE
            </p>
            <p
              style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: 6,
                margin: '0 0 10px',
                fontFamily: '"SF Mono", "JetBrains Mono", monospace',
                color: 'var(--text-primary)',
              }}
            >
              {room.room_code}
            </p>
            <button
              onClick={async () => {
                if (await copyToClipboard(room.room_code)) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }
              }}
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                border: 'none',
                borderRadius: 10,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copied ? 'COPIED ✓' : 'COPY CODE'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {seats.map((s) => (
              <div
                key={s.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                <span>
                  {s.is_host ? '👑 ' : ''}
                  {s.nickname}
                  {s.player_id === guestId ? ' (you)' : ''}
                </span>
                <span style={{ color: s.is_ready ? 'var(--success-text)' : 'var(--text-muted)' }}>
                  {s.is_ready ? 'READY ✓' : 'not ready'}
                </span>
              </div>
            ))}
            {seats.length < 2 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                Waiting for one more racer — share the code (up to 8).
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={toggleReady}
              style={{
                flex: 1,
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 12,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Toggle ready
            </button>
            {isHost && (
              <button
                onClick={startMatch}
                disabled={busy || seats.length < 2 || seats.some((s) => !s.is_ready)}
                style={{
                  flex: 2,
                  background:
                    busy || seats.length < 2 || seats.some((s) => !s.is_ready) ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: seats.length < 2 || seats.some((s) => !s.is_ready) ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                START 60s SPRINT
              </button>
            )}
          </div>

          <button
            onClick={leave}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              padding: 0,
            }}
          >
            ← Leave room
          </button>
          {error && (
            <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'countdown' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p
            style={{
              fontSize: 96,
              fontWeight: 900,
              margin: 0,
              color: countLabel === 'GO!' ? 'var(--success-text)' : 'var(--accent)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countLabel}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0 0' }}>
            {seats.length} racers · same code for everyone
          </p>
        </div>
      )}

      {phase === 'running' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ color: 'var(--accent-text)', fontVariantNumeric: 'tabular-nums' }}>{live.net} WPM</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{live.accuracy}% Accuracy</span>
            <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{sprintClock(remaining)}</span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Sprint time used"
            style={{ height: 6, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: remaining <= 10_000 ? 'var(--danger)' : 'var(--accent)',
                transition: 'width 0.5s linear',
              }}
            />
          </div>

          {words.length > 0 ? (
            <SprintText words={words} completed={completed} current={current} />
          ) : (
            <div className="skeleton" style={{ height: 120, borderRadius: 14 }} />
          )}

          <input
            ref={inputRef}
            aria-label="Code sprint input"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={current}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 1, width: 1 }}
          />
        </>
      )}

      {phase === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                margin: '0 0 4px',
              }}
            >
              YOUR SPRINT
            </p>
            <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', margin: 0, lineHeight: 1.1 }}>
              {myResult?.wpm ?? 0}{' '}
              <span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 700 }}>net WPM</span>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
              {myResult?.accuracy ?? 0}% accuracy · {myResult?.chars ?? 0} correct chars · {myResult?.words ?? 0} words
            </p>
            {winner && (
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--success-text)', margin: '10px 0 0' }}>
                🏆 {winner} won this sprint
              </p>
            )}
            {!winner && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>
                Waiting for the other racers…
              </p>
            )}
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                margin: '0 0 6px',
              }}
            >
              STANDINGS · VERIFIED CHARS
            </p>
            {standings.map((s, i) => (
              <div
                key={s.player_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12.5,
                  fontWeight: s.player_id === guestId ? 800 : 600,
                  color: s.player_id === guestId ? 'var(--accent-text)' : 'var(--text-primary)',
                  padding: '3px 0',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {s.nickname}
                  {s.player_id === guestId ? ' (you)' : ''}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {s.score ?? 0} chars
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={leave}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 12,
              padding: 13,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            BACK TO ROOMS
          </button>
        </div>
      )}
    </div>
  )
}
