'use client'

// ═══════════════════════════════════════════════════════════════════════════
// QuickMath — main game orchestrator
// Manages: entry → lobby → countdown → playing → results
// Uses Supabase Realtime for live synchronization between players
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ClientGamePhase, GameRoom, GamePlayer, GameAnswer, RoomState, Difficulty } from '@/lib/games/types'
import { GAME_CONFIG, DIFFICULTY_CONFIG } from '@/lib/games/config'
import { getGuestId, getSavedNickname, saveNickname, isValidRoomCode } from '@/lib/games/utils'
import GameLobby from './GameLobby'
import GamePlay from './GamePlay'
import GameResults from './GameResults'

export default function QuickMath({ initialRoomCode }: { initialRoomCode?: string }) {
  const supabase = createClient()
  const guestId = useRef(getGuestId()).current

  // ── State ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ClientGamePhase>(initialRoomCode ? 'lobby' : 'entry')
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [answers, setAnswers] = useState<GameAnswer[]>([])
  const [myPlayerId, setMyPlayerId] = useState('')
  const [nickname, setNickname] = useState(getSavedNickname())
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode || '')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [totalRounds, setTotalRounds] = useState(10)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const ROUNDS_OPTIONS = [5, 10, 20, 30, 50]

  // Signed-in players carry their profile id so a win awards Aura to them.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null))
  }, [supabase])

  // ── Realtime subscription ──────────────────────────────────────────────
  const subscribeToRoom = useCallback(
    (roomId: string) => {
      const channel = supabase
        .channel(`game-room-${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            if (payload.eventType === 'UPDATE' && payload.new) {
              const r = payload.new as any
              setRoom((prev) => (prev ? { ...prev, ...r } : prev))
              if (r.status === 'starting') {
                setPhase('countdown')
              } else if (r.status === 'active') {
                setPhase('playing')
              } else if (r.status === 'finished') {
                setPhase('finished')
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `room_id=eq.${roomId}` },
          (payload) => {
            // Refresh full player list on any change
            loadRoomPlayers(roomId)
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_answers', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              setAnswers((prev) => [...prev, payload.new as GameAnswer])
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    },
    [supabase]
  )

  // ── Load room players ──────────────────────────────────────────────────
  const loadRoomPlayers = async (roomId: string) => {
    const { data } = await supabase
      .from('game_players')
      .select('*')
      .eq('room_id', roomId)
      .order('score', { ascending: false })
    if (data) setPlayers(data as GamePlayer[])
  }

  // ── Load room state (for reconnection / join) ──────────────────────────
  const loadRoomState = async (code: string) => {
    const { data, error: rpcError } = await supabase.rpc('get_room_state', {
      p_room_code: code,
    })
    if (rpcError || !data) {
      setError(rpcError?.message || 'Room not found')
      return false
    }
    const state = data as unknown as RoomState
    setRoom(state.room)
    setPlayers(state.players)
    setAnswers(state.answers || [])

    // Determine my player
    const me = state.players.find((p) => p.player_id === guestId)
    if (me) {
      setMyPlayerId(guestId)
      setPhase(state.room.status === 'active' ? 'playing' : 'lobby')
    }
    return true
  }

  // ── Join on mount if initialRoomCode provided ──────────────────────────
  useEffect(() => {
    if (initialRoomCode && isValidRoomCode(initialRoomCode)) {
      const nick = getSavedNickname()
      if (nick) {
        handleJoin(initialRoomCode, nick)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Subscribe when room changes ────────────────────────────────────────
  useEffect(() => {
    if (!room?.id) return
    const unsub = subscribeToRoom(room.id)
    return unsub
  }, [room?.id, subscribeToRoom])

  // ── Countdown timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown' || !room?.round_started_at) return

    const target = new Date(room.round_started_at).getTime()
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        setPhase('playing')
      }
    }
    tick()
    const interval = setInterval(tick, 100)
    return () => clearInterval(interval)
  }, [phase, room?.round_started_at])

  // ── Actions ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!nickname.trim()) {
      setError('Enter a nickname')
      return
    }
    setLoading(true)
    setError('')
    saveNickname(nickname)

    const { data, error: rpcError } = await supabase.rpc('create_game_room', {
      p_player_id: guestId,
      p_nickname: nickname.trim(),
      p_difficulty: difficulty,
      p_total_rounds: totalRounds,
      p_max_players: GAME_CONFIG.MAX_PLAYERS,
      p_user_id: authUserId,
    })

    setLoading(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    const result = data as unknown as { room_id: string; room_code: string; player_id: string }
    setMyPlayerId(result.player_id)
    setRoomCodeInput(result.room_code)

    // Load full state
    await loadRoomState(result.room_code)
  }

  const handleJoin = async (code?: string, nick?: string) => {
    const joinCode = code || roomCodeInput.trim()
    const joinNick = nick || nickname.trim()

    if (!isValidRoomCode(joinCode)) {
      setError('Room code must be exactly 6 digits')
      return
    }
    if (!joinNick) {
      setError('Enter a nickname')
      return
    }

    setLoading(true)
    setError('')
    saveNickname(joinNick)

    const { data, error: rpcError } = await supabase.rpc('join_game_room', {
      p_room_code: joinCode,
      p_player_id: guestId,
      p_nickname: joinNick,
      p_user_id: authUserId,
    })

    setLoading(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    const result = data as unknown as { room_id: string; room_code: string; player_id: string; reconnected: boolean }
    setMyPlayerId(result.player_id)
    await loadRoomState(result.room_code)
  }

  const handleReady = async () => {
    await supabase.rpc('toggle_ready', {
      p_room_id: room!.id,
      p_player_id: guestId,
    })
    // Realtime will update players
  }

  const handleStart = async () => {
    const { error: rpcError } = await supabase.rpc('start_game', {
      p_room_id: room!.id,
      p_player_id: guestId,
    })
    if (rpcError) {
      setError(rpcError.message)
    }
    // Realtime will trigger phase change to 'starting' then 'playing'
  }

  const handleSubmitAnswer = async (answer: string, timeMs: number) => {
    const { data, error: rpcError } = await supabase.rpc('submit_answer', {
      p_room_id: room!.id,
      p_player_id: guestId,
      p_answer: answer,
      p_answer_time_ms: timeMs,
    })
    if (rpcError) throw rpcError
    const result = data as unknown as { correct: boolean; points: number }

    // If correct answer, auto-advance immediately (host only)
    if (result.correct && myPlayerId === room?.host_id) {
      setTimeout(async () => {
        await supabase.rpc('advance_round', {
          p_room_id: room!.id,
          p_player_id: guestId,
        })
      }, 1200) // Brief delay so player sees "Correct!"
    }

    return result
  }

  const handleRoundComplete = async () => {
    // Only host advances the round (for timer expiry)
    if (myPlayerId !== room?.host_id) return

    const { data, error: rpcError } = await supabase.rpc('advance_round', {
      p_room_id: room!.id,
      p_player_id: guestId,
    })
    if (rpcError) return
    // Realtime will update room state
  }

  const handleLeave = async () => {
    if (room) {
      await supabase.rpc('leave_room', {
        p_room_id: room.id,
        p_player_id: guestId,
      })
    }
    setRoom(null)
    setPlayers([])
    setPhase('entry')
  }

  // No rematch — game ends with exit only

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ═══ ENTRY PHASE ═══ */}
      {phase === 'entry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400, margin: '0 auto' }}>
          {/* Nickname */}
          <div>
            <label
              htmlFor="game-nickname"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              Your Nickname
            </label>
            <input
              id="game-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter nickname"
              maxLength={20}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Difficulty */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              Difficulty
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => {
                const cfg = DIFFICULTY_CONFIG[d]
                return (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: 12,
                      border: difficulty === d ? `2px solid ${cfg.color}` : '1px solid var(--border)',
                      background: difficulty === d ? cfg.bg : 'var(--bg)',
                      color: difficulty === d ? cfg.color : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'center',
                    }}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rounds */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Rounds</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROUNDS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setTotalRounds(r)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 50,
                    padding: '10px 4px',
                    borderRadius: 12,
                    border: totalRounds === r ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: totalRounds === r ? 'var(--accent-light)' : 'var(--bg)',
                    color: totalRounds === r ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'center',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Create Game */}
          <button
            onClick={handleCreate}
            disabled={loading || !nickname.trim()}
            style={{
              width: '100%',
              background: loading || !nickname.trim() ? 'var(--disabled)' : 'var(--accent)',
              color: loading || !nickname.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
              border: 'none',
              borderRadius: 14,
              padding: '14px',
              fontSize: 16,
              fontWeight: 700,
              cursor: loading || !nickname.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Creating...' : '🎮 Create Game'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Join Game */}
          <div>
            <label
              htmlFor="room-code"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              Room Code
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="room-code"
                type="text"
                inputMode="numeric"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                maxLength={6}
                style={{
                  flex: 1,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: '"SF Mono", "JetBrains Mono", monospace',
                  letterSpacing: 3,
                  textAlign: 'center',
                }}
              />
              <button
                onClick={() => handleJoin()}
                disabled={loading || roomCodeInput.length !== 6 || !nickname.trim()}
                style={{
                  background:
                    loading || roomCodeInput.length !== 6 || !nickname.trim() ? 'var(--disabled)' : 'var(--accent)',
                  color:
                    loading || roomCodeInput.length !== 6 || !nickname.trim()
                      ? 'var(--text-muted)'
                      : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading || roomCodeInput.length !== 6 || !nickname.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? '...' : 'Join'}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'var(--danger-light)',
                border: '1px solid var(--danger-border)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--danger)',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {/* ═══ COUNTDOWN PHASE ═══ */}
      {phase === 'countdown' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 300,
          }}
        >
          <p
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: countdown > 0 ? 'var(--accent)' : 'var(--success)',
              margin: 0,
              animation: 'riseIn 0.3s ease',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countdown > 0 ? countdown : 'GO!'}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12 }}>Get ready...</p>
        </div>
      )}

      {/* ═══ LOBBY PHASE ═══ */}
      {phase === 'lobby' && room && (
        <GameLobby
          room={room}
          players={players}
          myPlayerId={myPlayerId}
          onReady={handleReady}
          onStart={handleStart}
          onLeave={handleLeave}
        />
      )}

      {/* ═══ PLAYING PHASE ═══ */}
      {phase === 'playing' && room && (
        <GamePlay
          room={room}
          players={players}
          myPlayerId={myPlayerId}
          onSubmitAnswer={handleSubmitAnswer}
          onRoundComplete={handleRoundComplete}
        />
      )}

      {/* ═══ RESULTS PHASE ═══ */}
      {phase === 'finished' && <GameResults players={players} myPlayerId={myPlayerId} onExit={handleLeave} />}
    </div>
  )
}
