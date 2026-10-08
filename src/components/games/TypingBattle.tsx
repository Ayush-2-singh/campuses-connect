'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TypingBattle — game orchestrator (spec §12/§14)
//
// State machine: entry → (finding | lobby) → countdown → playing → finished
//   • finding: reuses the EXISTING game_matchmaking queue (p_game_type), no
//     second matchmaking architecture. Polls check_matchmaking_status().
//   • lobby: private 6-digit room, ready-up, host starts.
//   • countdown: driven by the SERVER deadline from start_typing_match.
//   • playing: words come from get_typing_words (zero-policy table) only when
//     the match is active. Progress heartbeats fire per completed word.
//   • finished: the server verdict (complete_typing_match) is the ONLY source
//     of win/loss — the client never declares a winner.
//   • rematch: same room, host re-uses it? No — a finished room is terminal,
//     so rematch recreates the room with the same opponent presence best-effort
//     (MVP: back to mode entry pre-filled, primary CTA stays one tap).
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TypingTracker } from '@/lib/games/typing'
import { createClient } from '@/lib/supabase/client'
import { getGuestId, getSavedNickname, saveNickname, isValidRoomCode, copyToClipboard } from '@/lib/games/utils'
import {
  countdownLabel,
  dailyWords,
  isPossibleDuration,
  type TypingPhase,
  type TypingVerdict,
} from '@/lib/games/typing'
import TypingArena from './TypingArena'
import TypingBoards from './TypingBoards'

interface SeatPlayer {
  player_id: string
  nickname: string
  is_host: boolean
  is_ready: boolean
  is_connected: boolean
  /** Set for signed-in players (048) — the call panel matches on it. */
  user_id?: string | null
}

interface RoomRow {
  id: string
  room_code: string
  host_id: string
  status: 'waiting' | 'starting' | 'active' | 'finished' | 'expired'
  round_started_at: string | null
}

interface ProgressRow {
  player_id: string
  completed: number
  total: number
  finished: boolean
}

interface VerdictState {
  won: boolean
  wpm: number
  accuracy: number
  durationMs: number
  opponentLeft: boolean
}

type Mode = 'menu' | 'quick' | 'private' | 'daily'

const BACK = <button onClick={() => window.location.reload()} style={{ display: 'none' }} aria-hidden="true" />
void BACK

export default function TypingBattle({
  initialRoomCode,
  onRoomReady,
  onRoster,
}: {
  initialRoomCode?: string
  /**
   * Fires with the 6-digit code once this client OWNS a room (create, not
   * join). The voice call uses it to hand the code to everyone on the call —
   * a join must stay silent or every player would re-broadcast and the room
   * would invite itself in a loop.
   */
  onRoomReady?: (code: string) => void
  /**
   * Mirrors the room's seat list upward. The in-call game panel matches it
   * against the people actually on the call, so everyone can see who joined.
   */
  onRoster?: (players: { playerId: string; nickname: string; userId: string | null }[]) => void
}) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const guestId = useRef(getGuestId()).current

  const [phase, setPhase] = useState<TypingPhase>(initialRoomCode ? 'lobby' : 'entry')
  const [mode, setMode] = useState<Mode>(initialRoomCode ? 'private' : 'menu')
  const [nickname, setNickname] = useState(getSavedNickname())
  const [nicknameLocked, setNicknameLocked] = useState(!!getSavedNickname())

  const [room, setRoom] = useState<RoomRow | null>(null)
  const [seats, setSeats] = useState<SeatPlayer[]>([])

  // Signed-in identity. game_players.user_id is what lets the voice call
  // recognise WHICH person on the call is sitting in a seat (LiveKit sets
  // identity = auth user id), and it is also what awards Aura on a win — so
  // every RPC below sends it instead of leaving the column NULL.
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null)
    })
    return () => {
      alive = false
    }
  }, [supabase])

  // Seat list → the call panel. Re-runs only when the seats really change
  // (onRoster is a stable useCallback in the panel).
  useEffect(() => {
    onRoster?.(seats.map((s) => ({ playerId: s.player_id, nickname: s.nickname, userId: s.user_id ?? null })))
  }, [seats, onRoster])
  const [codeInput, setCodeInput] = useState(initialRoomCode || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [startsAt, setStartsAt] = useState<number | null>(null)
  const [countLabel, setCountLabel] = useState('3')
  const [words, setWords] = useState<string[]>([])
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({})
  const [verdict, setVerdict] = useState<VerdictState | null>(null)
  const [copied, setCopied] = useState(false)
  const arenaTrackerRef = useRef<TypingTracker | null>(null)

  // Daily challenge
  const [dailyPool] = useState(() => dailyWords(new Date().toISOString().slice(0, 10)))
  const [dailyResult, setDailyResult] = useState<{ wpm: number; accuracy: number; rank: number } | null>(null)
  const [dailyStartedAt, setDailyStartedAt] = useState<number | null>(null)

  const myPlayerId = guestId
  const opponent = seats.find((s) => s.player_id !== myPlayerId) || null
  const isHost = room?.host_id === myPlayerId

  // ── Realtime: room row + seats + opponent progress ─────────────────────────
  useEffect(() => {
    if (!room?.id) return
    const roomId = room.id
    const channel = supabase
      .channel(`typing-${roomId}`)
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
            setPhase('finished')
          } else if (r.status === 'expired') {
            setError('Opponent disconnected')
            setPhase('finished')
            setVerdict((v) => v ?? { won: false, wpm: 0, accuracy: 0, durationMs: 0, opponentLeft: true })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `room_id=eq.${roomId}` },
        () => void loadSeats(roomId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_progress', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new as ProgressRow
          if (row?.player_id && row.player_id !== myPlayerId) {
            setProgress((p) => ({ ...p, [row.player_id]: row }))
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, supabase, myPlayerId])

  const loadSeats = useCallback(
    async (roomId: string) => {
      const { data } = await supabase.from('game_players').select('*').eq('room_id', roomId)
      if (data) setSeats(data as SeatPlayer[])
    },
    [supabase]
  )

  const loadRoom = useCallback(
    async (code: string): Promise<RoomRow | null> => {
      const { data } = await supabase
        .from('game_rooms')
        .select('id, room_code, host_id, status, round_started_at')
        .eq('room_code', code)
        .maybeSingle()
      return (data as RoomRow) ?? null
    },
    [supabase]
  )

  // Join deep link on mount.
  useEffect(() => {
    if (!initialRoomCode || !isValidRoomCode(initialRoomCode)) return
    void (async () => {
      const existing = await loadRoom(initialRoomCode)
      if (!existing) {
        setError('Room not found')
        return
      }
      setRoom(existing)
      await loadSeats(existing.id)
      setPhase(existing.status === 'waiting' ? 'lobby' : 'playing')
    })()
  }, [initialRoomCode, loadRoom, loadSeats])

  // Countdown ticker (server deadline → 3/2/1/GO → fetch words → play).
  useEffect(() => {
    if (phase !== 'countdown' || !startsAt) return
    const tick = () => {
      setCountLabel(countdownLabel(startsAt, Date.now()))
      if (Date.now() >= startsAt) {
        setPhase('playing')
      }
    }
    tick()
    const t = setInterval(tick, 100)
    return () => clearInterval(t)
  }, [phase, startsAt])

  // Words arrive only when the match is active (server-side gate).
  useEffect(() => {
    if (phase !== 'playing' || !room?.id || words.length > 0) return
    void (async () => {
      const { data, error: e } = await supabase.rpc('get_typing_words', {
        p_room_id: room.id,
        p_player_id: myPlayerId,
      })
      if (e || !data) {
        setError(e?.message || 'Could not load the words')
        return
      }
      setWords(data as string[])
    })()
  }, [phase, room?.id, words.length, supabase, myPlayerId])

  // Stuck-match guard: opponent seat empty/expired too long → release.
  useEffect(() => {
    if (phase !== 'finding') return
    const t = setTimeout(() => {
      setError('No opponent found — try again')
      setPhase('entry')
      setMode('menu')
    }, 60_000)
    return () => clearTimeout(t)
  }, [phase])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const ensureNickname = (): boolean => {
    if (nickname.trim()) return true
    setError('Enter a nickname first')
    return false
  }

  const enterQueue = async () => {
    if (!ensureNickname()) return
    setBusy(true)
    setError('')
    saveNickname(nickname.trim())
    setNicknameLocked(true)
    const { data, error: e } = await supabase.rpc('join_matchmaking', {
      p_player_id: guestId,
      p_nickname: nickname.trim(),
      p_difficulty: 'medium',
      p_total_rounds: 1,
      p_user_id: userId,
      p_game_type: 'typing_battle',
    })
    setBusy(false)
    if (e || !data) {
      setError(e?.message || 'Could not join the queue')
      return
    }
    const r = data as { status: string; room_code?: string }
    if (r.status === 'matched' && r.room_code) {
      const existing = await loadRoom(r.room_code)
      if (existing) {
        setRoom(existing)
        await loadSeats(existing.id)
        setPhase('lobby')
        return
      }
    }
    setPhase('finding')
  }

  // Poll while finding (check_matchmaking_status is the 047 contract).
  useEffect(() => {
    if (phase !== 'finding') return
    const poll = async () => {
      const { data } = await supabase.rpc('check_matchmaking_status', { p_player_id: guestId })
      const r = data as { status: string; room_code?: string } | null
      if (r?.status === 'matched' && r.room_code) {
        const existing = await loadRoom(r.room_code)
        if (existing) {
          setRoom(existing)
          await loadSeats(existing.id)
          setPhase('lobby')
        }
      }
    }
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  }, [phase, supabase, guestId, loadRoom, loadSeats])

  const createRoom = async () => {
    if (!ensureNickname()) return
    setBusy(true)
    setError('')
    saveNickname(nickname.trim())
    setNicknameLocked(true)
    const { data, error: e } = await supabase.rpc('create_typing_room', {
      p_player_id: guestId,
      p_nickname: nickname.trim(),
      p_user_id: userId,
    })
    setBusy(false)
    if (e || !data) {
      setError(e?.message || 'Could not create the room')
      return
    }
    const r = data as { room_code: string }
    onRoomReady?.(r.room_code)
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
      setError('Room code must be exactly 6 digits')
      return
    }
    if (!ensureNickname()) return
    setBusy(true)
    setError('')
    saveNickname(nickname.trim())
    setNicknameLocked(true)
    const { error: e } = await supabase.rpc('join_typing_room', {
      p_room_code: code,
      p_player_id: guestId,
      p_nickname: nickname.trim(),
      p_user_id: userId,
    })
    setBusy(false)
    if (e) {
      setError(
        e.message.includes('room_not_found')
          ? 'No waiting room with that code'
          : e.message.includes('room_full')
            ? 'That room is full'
            : e.message.includes('nickname_taken')
              ? 'That nickname is taken in this room'
              : 'Could not join — check the code'
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
    await supabase.rpc('toggle_typing_ready', { p_room_id: room.id, p_player_id: guestId })
  }

  const startMatch = async () => {
    if (!room) return
    setBusy(true)
    const { data, error: e } = await supabase.rpc('start_typing_match', {
      p_room_id: room.id,
      p_player_id: guestId,
    })
    setBusy(false)
    if (e || !data) {
      setError(e?.message.includes('not_all_ready') ? 'Both players must be ready' : 'Could not start')
      return
    }
    const r = data as { starts_at: string }
    setStartsAt(new Date(r.starts_at).getTime())
    setPhase('countdown')
  }

  // Progress heartbeat — one UPDATE per completed word (spec §11).
  const handleWordCompleted = useCallback(
    ({ completed, total }: { completed: number; correct: number; total: number }) => {
      if (!room?.id) return
      setProgress((p) => ({
        ...p,
        [myPlayerId]: { player_id: myPlayerId, completed, total, finished: false },
      }))
      // typing_progress stores character counts (correct vs. typed), not the
      // accuracy percentage — send the tracker's honest running totals.
      const stats = arenaTrackerRef.current?.stats
      void supabase.rpc('update_typing_progress', {
        p_room_id: room.id,
        p_player_id: guestId,
        p_completed: completed,
        p_correct: stats?.correctChars ?? 0,
        p_total_typed: stats?.totalTyped ?? 0,
      })
    },
    [room?.id, supabase, guestId, myPlayerId]
  )

  // Finish — the server decides everything (spec §10/§18). The typed words
  // come from the arena's tracker; the server re-validates every one of them
  // against the stored sequence, recomputes WPM/accuracy from the server
  // clock, and alone decides the winner.
  const handleFinished = useCallback(
    async ({
      words,
      durationMs,
      correctChars,
      totalTyped,
    }: {
      words: string[]
      durationMs: number
      correctChars: number
      totalTyped: number
    }) => {
      if (!room?.id) return
      if (!isPossibleDuration(durationMs)) {
        setError('That finish looked impossible — match abandoned')
        setPhase('entry')
        return
      }
      const { data, error: e } = await supabase.rpc('complete_typing_match', {
        p_room_id: room.id,
        p_player_id: guestId,
        p_words: words,
        // Real character counts; the server clamps them to what it verified.
        p_correct_chars: correctChars,
        p_total_chars: totalTyped,
      })
      if (e) {
        setError(
          e.message.includes('impossible_time') ? 'Finish rejected by the server' : 'Could not submit the result'
        )
        return
      }
      const v = data as TypingVerdict
      setVerdict({
        won: v.status === 'won',
        wpm: Number(v.wpm) || 0,
        accuracy: Number(v.accuracy) || 0,
        durationMs: Number(v.duration_ms) || durationMs,
        opponentLeft: false,
      })
      setPhase('finished')
    },
    [room?.id, supabase, guestId]
  )

  const leaveRoom = useCallback(async () => {
    if (room) {
      await supabase.rpc('leave_room', { p_room_id: room.id, p_player_id: guestId })
      if (phase === 'finding') await supabase.rpc('leave_matchmaking', { p_player_id: guestId })
    }
    setRoom(null)
    setSeats([])
    setWords([])
    setProgress({})
    setVerdict(null)
    setStartsAt(null)
    setPhase('entry')
    setMode('menu')
  }, [room, supabase, guestId, phase])

  // Rematch: same opponent, brand-new word sequence. A finished room is
  // terminal, so recreate — the CTA stays one tap (spec §14 MVP).
  const rematch = async () => {
    const wasPrivate = !!room && seats.length >= 2
    await leaveRoom()
    if (wasPrivate) {
      await createRoom()
    } else {
      setPhase('entry')
      setMode('quick')
      void enterQueue()
    }
  }

  // ── Daily challenge (single player, deterministic words) ───────────────────
  const startDaily = () => {
    setDailyStartedAt(Date.now())
    setDailyResult(null)
    setWords(dailyPool)
    setPhase('playing')
    setMode('daily')
  }

  const handleDailyFinished = useCallback(
    async ({
      words,
      durationMs,
      correctChars,
      totalTyped,
    }: {
      words: string[]
      durationMs: number
      correctChars: number
      totalTyped: number
    }) => {
      if (!isPossibleDuration(durationMs)) {
        setError('That finish looked impossible')
        setPhase('entry')
        return
      }
      const { data, error: e } = await supabase.rpc('typing_daily_attempt', {
        p_player_id: guestId,
        p_nickname: nickname.trim() || 'student',
        p_words: words,
        p_duration_ms: durationMs,
        p_correct_chars: correctChars,
        p_total_chars: totalTyped,
      })
      if (e) {
        setError(e.message.includes('impossible_time') ? 'Finish rejected by the server' : 'Could not submit')
        return
      }
      const r = data as { wpm: number; accuracy: number; rank: number }
      setDailyResult({ wpm: Number(r.wpm), accuracy: Number(r.accuracy), rank: Number(r.rank) })
      setPhase('finished')
    },
    [supabase, guestId, nickname]
  )

  // ═══ Render ═════════════════════════════════════════════════════════════════

  const nicknameField = !nicknameLocked && (
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {phase === 'entry' && mode === 'menu' && <TypingBoards myPlayerId={guestId} />}

      {phase === 'entry' && mode === 'menu' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            ⌨️ Best experienced with a physical keyboard.
          </p>
          {nicknameField}
          <button
            onClick={enterQueue}
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
            ⚡ QUICK MATCH
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={createRoom}
              disabled={busy || !nickname.trim()}
              style={{
                flex: 1,
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 13,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: busy || !nickname.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              CREATE ROOM
            </button>
            <button
              onClick={() => setMode('private')}
              style={{
                flex: 1,
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 13,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              JOIN ROOM
            </button>
          </div>
          <button
            onClick={startDaily}
            style={{
              background: 'var(--bg-secondary, var(--bg))',
              color: 'var(--text-primary)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: 13,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            📅 DAILY CHALLENGE — same words for everyone today
          </button>
          {error && (
            <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'entry' && mode === 'private' && (
        <>
          {nicknameField}
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
          <button
            onClick={() => setMode('menu')}
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
            ← Back
          </button>
          {error && (
            <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'finding' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Finding opponent...
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 18px' }}>
            You will be matched with the next student who hits Quick Match.
          </p>
          <button
            onClick={leaveRoom}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {phase === 'lobby' && room && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  {s.player_id === myPlayerId ? ' (you)' : ''}
                </span>
                <span style={{ color: s.is_ready ? 'var(--success-text)' : 'var(--text-muted)' }}>
                  {s.is_ready ? 'READY ✓' : 'not ready'}
                </span>
              </div>
            ))}
            {seats.length < 2 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                Waiting for the second player…
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
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                START (3-2-1-GO)
              </button>
            )}
          </div>
          <button
            onClick={leaveRoom}
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
        </div>
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
            {opponent ? `${opponent.nickname} is ready` : 'Get ready…'}
          </p>
        </div>
      )}

      {phase === 'playing' && words.length > 0 && (
        <TypingArena
          key={words.join('-')}
          words={words}
          startedAtMs={mode === 'daily' ? (dailyStartedAt ?? Date.now()) : (startsAt ?? Date.now())}
          trackerRef={arenaTrackerRef}
          opponent={
            opponent
              ? {
                  nickname: opponent.nickname,
                  completed: progress[opponent.player_id]?.completed ?? 0,
                  total: progress[opponent.player_id]?.total ?? words.length,
                }
              : null
          }
          onWordCompleted={mode === 'daily' ? () => {} : handleWordCompleted}
          onFinished={mode === 'daily' ? handleDailyFinished : handleFinished}
        />
      )}

      {phase === 'finished' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 0' }}>
          {mode === 'daily' ? (
            <>
              <p style={{ fontSize: 26, margin: 0 }}>📅 Daily challenge done</p>
              {dailyResult ? (
                <>
                  <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--accent)', margin: 0 }}>
                    {dailyResult.wpm} WPM
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                    {dailyResult.accuracy}% accuracy · Rank #{dailyResult.rank} today
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Submitting…</p>
              )}
            </>
          ) : verdict ? (
            <>
              <p
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  margin: 0,
                  color: verdict.won ? 'var(--success-text)' : 'var(--danger)',
                }}
              >
                {verdict.won ? '🏆 YOU WIN' : 'YOU LOST'}
              </p>
              <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--accent)', margin: 0 }}>{verdict.wpm} WPM</p>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>
                {verdict.accuracy}% accuracy · {(verdict.durationMs / 1000).toFixed(2)}s
              </p>
              {verdict.opponentLeft && (
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange-text, var(--text-muted))', margin: 0 }}>
                  Opponent disconnected
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Opponent disconnected</p>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            {mode !== 'daily' && (
              <button
                onClick={rematch}
                style={{
                  flex: 1,
                  maxWidth: 200,
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
                REMATCH
              </button>
            )}
            <button
              onClick={leaveRoom}
              style={{
                flex: 1,
                maxWidth: 140,
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 13,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              EXIT
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
