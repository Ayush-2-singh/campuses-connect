'use client'

/**
 * HOST CONTROL PANEL — the only screen that drives the room.
 *
 * Every control is `live_quiz_advance`; the room state, the current question and
 * the board are re-read from the server after each press, so the panel never
 * drifts from what participants see. `start` locks the question snapshot and
 * opens question 1, `next` closes the current window and opens the next (or
 * finalises), `pause`/`resume` stop and restart the clock, `end` finalises now
 * and `cancel` abandons the room.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import { playLiveSfx, startLobbyMusic, stopLobbyMusic, unlockLiveAudio, useLiveAudio } from '@/lib/liveQuizAudio'
import AudioToggle from './AudioToggle'

type Room = {
  ok: boolean
  id: string
  room_code: string
  title: string
  category: string
  status: string
  question_count: number
  position: number
  participants: number
  is_host: boolean
  join_locked?: boolean
  error?: string
}

type QuestionPayload = {
  ok: boolean
  status: string
  position: number
  total: number
  question: { text: string; type: string; marks: number; time_limit_seconds: number } | null
  options: { position: number; text: string }[]
  deadline: string | null
  answered: boolean
  error?: string
}

type BoardEntry = {
  participant_id?: string | null
  rank: number
  prev_rank?: number | null
  streak?: number
  display_name: string
  score: number
  correct_count: number
  answered_count: number
}

type RosterEntry = {
  participant_id: string
  display_name: string
  score: number
  correct_count: number
  answered_count: number
  is_kicked: boolean
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D']

/** Second, first, third — podium layout, not ranking order. */
const FINAL_PODIUM = [
  { place: 2, height: 64, background: 'linear-gradient(180deg,#9aa4b2,#6b7280)', medal: '🥈', label: 'Second place' },
  { place: 1, height: 90, background: 'linear-gradient(180deg,#f5c542,#d99a06)', medal: '🥇', label: 'First place' },
  { place: 3, height: 48, background: 'linear-gradient(180deg,#c98b5e,#9a5b2f)', medal: '🥉', label: 'Third place' },
]
type Action = 'start' | 'next' | 'pause' | 'resume' | 'end' | 'cancel'

export default function HostPanel({ competitionId }: { competitionId: string }) {
  const supabase = createClient()

  const [room, setRoom] = useState<Room | null>(null)
  const [question, setQuestion] = useState<QuestionPayload | null>(null)
  const [key, setKey] = useState<number[] | null>(null)
  const [board, setBoard] = useState<BoardEntry[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [kicking, setKicking] = useState<string | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const { muted } = useLiveAudio()
  const [distribution, setDistribution] = useState<{ position: number; count: number }[]>([])
  const [answeredCount, setAnsweredCount] = useState(0)
  const [lockBusy, setLockBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [roomRes, questionRes, boardRes, rosterRes] = await Promise.all([
      supabase.rpc('live_quiz_room', { p_competition_id: competitionId }),
      supabase.rpc('live_quiz_question', { p_competition_id: competitionId }),
      supabase.rpc('live_quiz_leaderboard', { p_competition_id: competitionId, p_limit: 50 }),
      supabase.rpc('live_quiz_roster', { p_competition_id: competitionId }),
    ])

    const roomData = roomRes.data as Room | null
    if (!roomData?.ok) {
      setError(roomData?.error === 'not_in_room' ? "You don't have access to this room." : 'Room not found.')
      setLoading(false)
      return
    }
    if (!roomData.is_host) {
      setError('Only the host can control this room.')
      setLoading(false)
      return
    }
    setRoom(roomData)
    setQuestion(questionRes.data as QuestionPayload | null)

    const boardData = boardRes.data as { ok: boolean; top: BoardEntry[] } | null
    setBoard(boardData?.ok ? (boardData.top ?? []) : [])

    const rosterData = rosterRes.data as { ok: boolean; rows: RosterEntry[] } | null
    setRoster(rosterData?.ok ? (rosterData.rows ?? []) : [])

    // The host may read the key once the window is closed — never before.
    if (roomData.status !== 'live') {
      const revealRes = await supabase.rpc('live_quiz_reveal', { p_competition_id: competitionId })
      const revealData = revealRes.data as {
        ok: boolean
        correct_positions?: number[]
        distribution?: { position: number; count: number }[]
        answered_count?: number
      } | null
      setKey(revealData?.ok ? (revealData.correct_positions ?? []) : null)
      setDistribution(revealData?.ok ? (revealData.distribution ?? []) : [])
      setAnsweredCount(revealData?.ok ? (revealData.answered_count ?? 0) : 0)
    } else {
      setKey(null)
      setDistribution([])
      setAnsweredCount(0)
    }

    setLoading(false)
  }, [competitionId, supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    const poll = setInterval(refresh, 4000)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [refresh])

  // Lobby bed while people join; silence the moment the room goes live.
  useEffect(() => {
    if ((room?.status === 'draft' || room?.status === 'waiting') && !muted) startLobbyMusic()
    else stopLobbyMusic()
    return () => stopLobbyMusic()
  }, [muted, room?.status])

  // A context can only resume inside a gesture, and the host's first click is
  // usually "Start" — so unlock on any interaction.
  useEffect(() => {
    const unlock = () => unlockLiveAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const podiumPlayed = useRef(false)
  useEffect(() => {
    if (room?.status !== 'completed' || podiumPlayed.current) return
    podiumPlayed.current = true
    stopLobbyMusic()
    playLiveSfx('podium')
  }, [room?.status])

  const act = async (action: Action) => {
    if (busy) return
    if (action === 'end' && !window.confirm('End the competition now and publish the final ranking?')) return
    if (action === 'cancel' && !window.confirm('Cancel this room? Participants will be disconnected.')) return
    setBusy(action)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('live_quiz_advance', {
        p_competition_id: competitionId,
        p_action: action,
      })
      if (rpcError) throw rpcError
      const result = data as { ok: boolean; error?: string }
      if (!result?.ok) setError(result?.error ? `Host action failed: ${result.error}` : 'Host action failed.')
      else if (action === 'start' || action === 'next') playLiveSfx('start')
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Host action failed.')
    } finally {
      setBusy(null)
    }
  }

  const kick = async (entry: RosterEntry) => {
    if (kicking) return
    if (!window.confirm(`Remove ${entry.display_name} from the room? They will not be able to rejoin.`)) return
    setKicking(entry.participant_id)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('live_quiz_kick', {
        p_competition_id: competitionId,
        p_participant_id: entry.participant_id,
      })
      if (rpcError) throw rpcError
      const result = data as { ok: boolean; error?: string }
      if (!result?.ok) {
        setError(
          result?.error === 'not_found'
            ? 'That participant is no longer in the room.'
            : 'Could not remove that participant.'
        )
      }
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Could not remove that participant.')
    } finally {
      setKicking(null)
    }
  }

  const toggleLock = async () => {
    if (!room || lockBusy) return
    setLockBusy(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('live_quiz_set_join_lock', {
        p_competition_id: competitionId,
        p_locked: !room.join_locked,
      })
      if (rpcError) throw rpcError
      const result = data as { ok: boolean; error?: string } | null
      if (!result?.ok) {
        setError(result?.error === 'room_over' ? 'This room is already over.' : 'Could not change joining.')
      }
      await refresh()
    } catch {
      setError('Could not change joining — this server build may not have the control yet.')
    } finally {
      setLockBusy(false)
    }
  }

  const copyLink = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/live/${room.room_code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Copy failed — copy the code manually.')
    }
  }

  const remaining =
    question?.deadline && room?.status === 'live'
      ? Math.max(0, Math.ceil((new Date(question.deadline).getTime() - now) / 1000))
      : 0

  if (loading) {
    return (
      <div className="hc-page">
        <div className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
      </div>
    )
  }

  if (error && !room) {
    return (
      <div className="hc-page">
        <div className="hc-empty">
          <div className="hc-empty-ic">
            <Icon name="alert" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">Cannot open this room</p>
          <p className="hc-empty-s">{error}</p>
          <Link className="hc-btn hc-btn--primary" href="/compete/live" style={{ textDecoration: 'none' }}>
            Back to Live Battle
          </Link>
        </div>
      </div>
    )
  }

  if (!room) return null

  const isLive = room.status === 'live'
  const isPaused = room.status === 'paused'
  const isOver = room.status === 'completed' || room.status === 'cancelled'
  const canStart = room.status === 'draft' || room.status === 'waiting'

  return (
    <div className="hc-page" style={{ paddingBottom: 90 }}>
      <div className="hc-page-head hc-reveal">
        <span className="hc-eyebrow">Host controls · {room.category}</span>
        <h1 className="hc-h1">{room.title}</h1>
        <div className="hc-tags">
          <span className={`hc-tag ${isLive ? 'hc-tag--success' : isPaused ? 'hc-tag--warn' : 'hc-tag--ghost'}`}>
            {room.status}
          </span>
          <span className="hc-tag">{room.participants} joined</span>
          {room.join_locked && <span className="hc-tag hc-tag--warn">joining locked</span>}
          <span className="hc-tag">
            {room.question_count
              ? `${Math.min(room.position + 1, room.question_count)} / ${room.question_count}`
              : '0 questions'}
          </span>
        </div>
      </div>

      {error && (
        <div className="hc-alert" role="alert">
          {error}
        </div>
      )}

      {/* Share */}
      <section className="hc-card hc-reveal" aria-label="Share the room" style={{ marginBottom: 14 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Room code
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: 'var(--accent-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {room.room_code}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="hc-btn" type="button" onClick={copyLink}>
            <Icon name="copy" size={13} /> {copied ? 'Copied' : 'Copy join link'}
          </button>
          <Link className="hc-btn" href={`/live/${room.room_code}`} target="_blank" style={{ textDecoration: 'none' }}>
            <Icon name="eye" size={13} /> Preview as player
          </Link>
        </div>
        <p className="hc-note" style={{ margin: 0 }}>
          Announce the code on your stream — students open connecttocampus.com/live/{room.room_code}.
        </p>
      </section>

      {/* Current question */}
      {question?.question ? (
        <section className="hc-card hc-reveal" aria-label="Current question" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="hc-tag hc-tag--accent">
              Question {question.position + 1} / {question.total}
            </span>
            <span className="hc-spacer" />
            {isLive && (
              <span className="hc-tag" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                <Icon name="clock" size={12} /> {remaining}s
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>{question.question.text}</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            {question.options.map((option, index) => {
              const correct = key?.includes(option.position)
              return (
                <li
                  key={option.position}
                  style={{ color: correct ? 'var(--success-text)' : undefined, fontWeight: correct ? 700 : 400 }}
                >
                  {OPTION_LETTERS[index] ?? index + 1}. {option.text} {correct ? '✓' : ''}
                </li>
              )
            })}
          </ol>
          {key && distribution.length > 0 && (
            <div aria-label="How the room answered" style={{ display: 'grid', gap: 5 }}>
              <p className="hc-note" style={{ margin: 0 }}>
                {answeredCount} of {room.participants} answered
              </p>
              {distribution.map((bar) => {
                const max = Math.max(1, ...distribution.map((d) => d.count))
                const correct = key.includes(bar.position)
                return (
                  <div key={bar.position} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 14, fontWeight: 800, color: 'var(--text-muted)' }}>
                      {OPTION_LETTERS[bar.position] ?? bar.position + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 999,
                        background: 'var(--bg-secondary)',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          width: `${Math.round((bar.count / max) * 100)}%`,
                          background: correct ? 'var(--success-text)' : 'var(--accent)',
                        }}
                      />
                    </span>
                    <span style={{ width: 22, textAlign: 'right', fontWeight: 700 }}>{bar.count}</span>
                  </div>
                )
              })}
            </div>
          )}
          {!key && (
            <p className="hc-note" style={{ margin: 0 }}>
              The answer key stays hidden while answers are open.
            </p>
          )}
        </section>
      ) : (
        <section className="hc-card hc-reveal" style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            {isOver ? 'Competition finished.' : canStart ? 'Ready when you are.' : 'Waiting for the next question…'}
          </p>
          <p className="hc-note" style={{ margin: 0 }}>
            {canStart
              ? 'Students in the waiting room see the first question the moment you press start.'
              : 'The room has no open question right now.'}
          </p>
        </section>
      )}

      {/* Controls */}
      <section className="hc-card hc-reveal" aria-label="Controls" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canStart && (
            <button
              className="hc-btn hc-btn--primary"
              type="button"
              onClick={() => act('start')}
              disabled={Boolean(busy)}
            >
              <Icon name="zap" size={14} /> {busy === 'start' ? 'Starting…' : 'Start competition'}
            </button>
          )}
          {(isLive || isPaused) && (
            <button
              className="hc-btn hc-btn--primary"
              type="button"
              onClick={() => act('next')}
              disabled={Boolean(busy)}
            >
              <Icon name="chevron" size={14} /> {busy === 'next' ? 'Moving…' : 'Next question'}
            </button>
          )}
          {isLive && (
            <button className="hc-btn" type="button" onClick={() => act('pause')} disabled={Boolean(busy)}>
              <Icon name="clock" size={13} /> Pause
            </button>
          )}
          {isPaused && (
            <button className="hc-btn" type="button" onClick={() => act('resume')} disabled={Boolean(busy)}>
              <Icon name="zap" size={13} /> Resume
            </button>
          )}
          {!isOver && (
            <button className="hc-btn" type="button" onClick={() => act('end')} disabled={Boolean(busy)}>
              <Icon name="trophy" size={13} /> End & publish ranking
            </button>
          )}
          {!isOver && (
            <button className="hc-btn" type="button" onClick={() => act('cancel')} disabled={Boolean(busy)}>
              <Icon name="x" size={13} /> Cancel room
            </button>
          )}
          {isOver && (
            <Link
              className="hc-btn hc-btn--primary"
              href={`/live/${room.room_code}`}
              style={{ textDecoration: 'none' }}
            >
              <Icon name="trophy" size={14} /> View final board
            </Link>
          )}
          {!isOver && typeof room.join_locked === 'boolean' && (
            <button className="hc-btn" type="button" onClick={() => void toggleLock()} disabled={lockBusy}>
              <Icon name="lock" size={13} />
              {lockBusy ? 'Saving…' : room.join_locked ? 'Unlock joining' : 'Lock joining'}
            </button>
          )}
          <AudioToggle />
        </div>
        {room.join_locked && (
          <p className="hc-note" style={{ margin: 0 }}>
            New players are turned away with the same message as a closed room. People already in keep their seats.
          </p>
        )}
      </section>

      {/* Final leaderboard — the host's own copy of the finished room: the
          podium and then EVERY ranked row, not just the top three, so the host
          never has to open the player page to read the result. */}
      {room.status === 'completed' && (
        <section className="hc-card hc-reveal" aria-label="Final leaderboard" style={{ marginBottom: 14, gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Final leaderboard
          </span>
          {board.length === 0 ? (
            <p className="hc-note" style={{ margin: 0 }}>
              Nobody answered before the room ended, so there is no ranking to show.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="trophy" size={19} /> {board[0].display_name} wins
              </p>
              <p className="hc-note" style={{ margin: 0 }}>
                {board[0].score.toLocaleString()} points · {board[0].correct_count ?? 0}/{board[0].answered_count ?? 0}{' '}
                correct · {board.length} ranked · {room.participants} {room.participants === 1 ? 'player' : 'players'}{' '}
                in the room
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 8,
                  margin: '2px 0 4px',
                }}
              >
                {FINAL_PODIUM.map((slot) => {
                  const entry = board[slot.place - 1]
                  if (!entry) return null
                  return (
                    <div key={entry.participant_id ?? `podium-${entry.rank}`} style={{ flex: '0 1 31%', minWidth: 0 }}>
                      <div style={{ display: 'grid', gap: 2, marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.display_name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{entry.score.toLocaleString()}</span>
                      </div>
                      <div
                        style={{
                          height: slot.height,
                          borderRadius: '10px 10px 0 0',
                          background: slot.background,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 21,
                        }}
                        aria-label={slot.label}
                      >
                        <span aria-hidden="true">{slot.medal}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 0 }}>
                {board.map((entry) => (
                  <li
                    key={entry.participant_id ?? `final-${entry.rank}-${entry.display_name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      padding: '6px 0',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        textAlign: 'center',
                        fontWeight: 800,
                        color: 'var(--text-muted)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {entry.rank}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 650,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.display_name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {entry.correct_count ?? 0}/{entry.answered_count ?? 0}
                    </span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {entry.score.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {/* Participants — the roster is host-only, and removal is the only
          moderation control. A kicked row cannot rejoin (the join RPC refuses
          it), so this sticks even if the player reloads. */}
      <section className="hc-reveal" aria-label="Participants" style={{ marginBottom: 14 }}>
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 8px',
          }}
        >
          Participants · {room.participants}
        </h2>
        {roster.length === 0 ? (
          <p className="hc-empty-s" style={{ margin: 0 }}>
            Nobody has joined yet — share the code.
          </p>
        ) : (
          <div className="hc-grid hc-grid--list" style={{ gap: 6 }}>
            {roster.map((entry) => (
              <div
                key={entry.participant_id}
                className="hc-card"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '9px 13px' }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 650,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.display_name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {entry.score} pts · {entry.correct_count}/{entry.answered_count}
                </span>
                {entry.is_kicked ? (
                  <span className="hc-tag hc-tag--ghost">removed</span>
                ) : (
                  <button
                    className="hc-chip"
                    type="button"
                    onClick={() => kick(entry)}
                    disabled={Boolean(kicking)}
                    aria-label={`Remove ${entry.display_name}`}
                  >
                    <Icon name="x" size={12} /> {kicking === entry.participant_id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live board — during play only. Once the room completes, the final
          leaderboard above is the single authoritative list. */}
      {room.status !== 'completed' && (
        <section className="hc-reveal" aria-label="Live board">
          <h2
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              margin: '0 0 8px',
            }}
          >
            Live standings
          </h2>
          {board.length === 0 ? (
            <p className="hc-empty-s" style={{ margin: 0 }}>
              No answers yet.
            </p>
          ) : (
            <div className="hc-grid hc-grid--list" style={{ gap: 6 }}>
              {board.map((entry) => (
                <div
                  key={entry.participant_id ?? `${entry.rank}-${entry.display_name}`}
                  className="hc-card"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '9px 13px' }}
                >
                  <span
                    style={{
                      width: 24,
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {entry.rank}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      fontWeight: 650,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.display_name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {entry.correct_count ?? 0}/{entry.answered_count ?? 0}
                  </span>
                  {(entry.prev_rank ?? entry.rank) - entry.rank !== 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color:
                          (entry.prev_rank ?? entry.rank) - entry.rank > 0
                            ? 'var(--success-text)'
                            : 'var(--danger-text)',
                      }}
                    >
                      {(entry.prev_rank ?? entry.rank) - entry.rank > 0
                        ? `▲${(entry.prev_rank ?? entry.rank) - entry.rank}`
                        : `▼${Math.abs((entry.prev_rank ?? entry.rank) - entry.rank)}`}
                    </span>
                  )}
                  {(entry.streak ?? 0) >= 2 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>
                      <Icon name="flame" size={11} /> {entry.streak}
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-text)' }}>{entry.score}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
