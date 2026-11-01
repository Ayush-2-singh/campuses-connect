'use client'

/**
 * ROOM PLAYER — what a student sees at /live/<code>.
 *
 * The screen is a view over server state, never the source of it:
 *   • joining is `live_quiz_join` (idempotent — a reload rejoins the same row);
 *   • the question, its options and its DEADLINE come from `live_quiz_question`,
 *     which never includes the answer key while the window is open;
 *   • submitting is `live_quiz_answer`, scored on the server;
 *   • rank comes from `live_quiz_leaderboard`;
 *   • the key only appears through `live_quiz_reveal`, which refuses early.
 *
 * State refreshes on every `competition_events` insert for this room (host
 * pressed start/next/end) with a slow poll as the fallback when Realtime is
 * unavailable, which is the same pattern the DM thread uses.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

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
  joined: boolean
  my_score: number
  error?: string
}

type QuestionPayload = {
  ok: boolean
  status: string
  position: number
  total: number
  question: { text: string; type: string; image_url: string | null; marks: number; time_limit_seconds: number } | null
  options: { position: number; text: string }[]
  deadline: string | null
  answered: boolean
  error?: string
}

type BoardEntry = {
  rank: number
  display_name: string
  score: number
  correct_count: number
  answered_count: number
  accuracy: number
  total_response_ms?: number
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D']

export default function RoomPlayer({ code }: { code: string }) {
  const supabase = createClient()

  const [room, setRoom] = useState<Room | null>(null)
  const [question, setQuestion] = useState<QuestionPayload | null>(null)
  const [board, setBoard] = useState<{ top: BoardEntry[]; me: BoardEntry | null } | null>(null)
  const [reveal, setReveal] = useState<{ correct_positions: number[]; explanation: string | null } | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [answerResult, setAnswerResult] = useState<'accepted' | 'duplicate' | 'closed' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const revealedFor = useRef<string>('')
  // Joining is idempotent server-side, but there is no reason to repeat it on
  // every poll — the room id is stable for the life of the page.
  const competitionIdRef = useRef<string>('')

  /** Re-read room + question + board + (when allowed) the answer key. */
  const loadState = useCallback(
    async (competitionId: string) => {
      const [roomRes, questionRes] = await Promise.all([
        supabase.rpc('live_quiz_room', { p_competition_id: competitionId }),
        supabase.rpc('live_quiz_question', { p_competition_id: competitionId }),
      ])

      const roomData = roomRes.data as Room | null
      const questionData = questionRes.data as QuestionPayload | null
      if (roomData?.ok) setRoom(roomData)
      setQuestion(questionData)

      if (roomData?.status === 'live' || roomData?.status === 'paused' || roomData?.status === 'completed') {
        const boardRes = await supabase.rpc('live_quiz_leaderboard', {
          p_competition_id: competitionId,
          p_limit: 10,
        })
        const boardData = boardRes.data as { ok: boolean; top: BoardEntry[]; me: BoardEntry | null } | null
        if (boardData?.ok) setBoard({ top: boardData.top ?? [], me: boardData.me ?? null })
      }

      // The key is only fetchable once the window for this question has closed;
      // the RPC refuses while it is open, so this is a request, not a claim.
      const questionKey = `${questionData?.position ?? -1}:${roomData?.status ?? ''}`
      if (questionData?.question && questionData.status !== 'live' && revealedFor.current !== questionKey) {
        const revealRes = await supabase.rpc('live_quiz_reveal', { p_competition_id: competitionId })
        const revealData = revealRes.data as { ok: boolean; correct_positions?: number[]; explanation?: string | null }
        if (revealData?.ok) {
          revealedFor.current = questionKey
          setReveal({
            correct_positions: revealData.correct_positions ?? [],
            explanation: revealData.explanation ?? null,
          })
        }
      }

      setLoading(false)
    },
    [supabase]
  )

  const refresh = useCallback(async () => {
    if (competitionIdRef.current) {
      await loadState(competitionIdRef.current)
      return
    }

    const { data: joined, error: joinError } = await supabase.rpc('live_quiz_join', { p_room_code: code })
    if (joinError) {
      setError('Could not reach the room. Check your connection.')
      setLoading(false)
      return
    }
    const joinResult = joined as { ok: boolean; competition_id?: string; error?: string }
    if (!joinResult?.ok || !joinResult.competition_id) {
      const reason = joinResult?.error
      setError(
        reason === 'room_not_found'
          ? 'No room with that code. Check the six digits with your host.'
          : reason === 'room_closed' || reason === 'room_finished'
            ? 'This room has closed.'
            : reason === 'late_join_disabled'
              ? 'This room is already running and late joining is off.'
              : reason === 'room_full'
                ? 'This room is full.'
                : 'Could not join this room.'
      )
      setLoading(false)
      return
    }

    competitionIdRef.current = joinResult.competition_id
    await loadState(joinResult.competition_id)
  }, [code, loadState, supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime: any event in this room means "re-read the state".
  useEffect(() => {
    if (!room?.id) return
    const channel = supabase
      .channel(`lb-room-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'competition_events', filter: `competition_id=eq.${room.id}` },
        () => {
          refresh()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [room?.id, refresh, supabase])

  // Poll fallback (and a clock for the countdown).
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    const poll = setInterval(() => {
      if (room?.status === 'waiting' || room?.status === 'live' || room?.status === 'paused') refresh()
    }, 5000)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [refresh, room?.status])

  // A new question arrives → clear the previous answer state.
  useEffect(() => {
    setSelected([])
    setAnswerResult(null)
    setReveal(null)
    revealedFor.current = ''
  }, [question?.position])

  const submit = async () => {
    if (!room || !question || selected.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('live_quiz_answer', {
        p_competition_id: room.id,
        p_positions: selected,
      })
      if (rpcError) throw rpcError
      const result = data as { ok: boolean; error?: string }
      if (result?.ok) setAnswerResult('accepted')
      else if (result?.error === 'already_answered') setAnswerResult('duplicate')
      else if (result?.error === 'window_closed') setAnswerResult('closed')
      else setError('Your answer was not accepted. Try again.')
      refresh()
    } catch {
      setError('Could not submit — check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const pick = (position: number) => {
    if (!question || question.answered || answerResult === 'accepted' || reveal) return
    const multiple = question.question?.type === 'multiple'
    setSelected((prev) =>
      multiple ? (prev.includes(position) ? prev.filter((p) => p !== position) : [...prev, position]) : [position]
    )
  }

  const deadlineMs = question?.deadline ? new Date(question.deadline).getTime() : 0
  const remaining = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : 0
  const windowOpen = Boolean(deadlineMs) && remaining > 0 && room?.status === 'live'

  if (loading) {
    return (
      <div className="hc-page">
        <div className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />
      </div>
    )
  }

  if (error || !room) {
    return (
      <div className="hc-page">
        <div className="hc-empty">
          <div className="hc-empty-ic">
            <Icon name="alert" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">Room not available</p>
          <p className="hc-empty-s">{error || 'That room could not be loaded.'}</p>
          <Link className="hc-btn hc-btn--primary" href="/compete/live" style={{ textDecoration: 'none' }}>
            Back to Live Battle
          </Link>
        </div>
      </div>
    )
  }

  const myRank = board?.me

  return (
    <div className="hc-page" style={{ paddingBottom: 96 }}>
      {/* Room header */}
      <div className="hc-page-head hc-reveal">
        <span className="hc-eyebrow">
          {room.category} · Room {room.room_code}
        </span>
        <h1 className="hc-h1">{room.title}</h1>
        <p className="hc-lede">
          {room.participants} {room.participants === 1 ? 'player' : 'players'}
          {room.question_count ? ` · ${room.question_count} questions` : ''}
          {myRank ? ` · you are #${myRank.rank}` : ''}
        </p>
      </div>

      {/* Waiting room */}
      {(room.status === 'waiting' || room.status === 'draft') && (
        <section className="hc-card hc-reveal" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', color: 'var(--accent)' }}>
              <Icon name="clock" size={18} />
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>You&apos;re in. Waiting for the host…</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                Keep this tab open — the first question appears the moment the host starts.
              </p>
            </div>
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>The question shows up here with a countdown.</li>
            <li>Tap the answer within the time limit — faster correct answers score more.</li>
            <li>Your rank updates after every question.</li>
          </ol>
        </section>
      )}

      {/* Live question */}
      {(room.status === 'live' || room.status === 'paused') && question?.question && (
        <section className="hc-reveal" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="hc-tag hc-tag--accent">
              Question {question.position + 1} / {question.total}
            </span>
            <span className="hc-spacer" />
            {room.status === 'paused' ? (
              <span className="hc-tag hc-tag--warn">Host paused</span>
            ) : (
              <span
                className="hc-tag"
                style={{
                  background: remaining <= 5 ? 'var(--danger-light)' : 'var(--bg-secondary)',
                  color: remaining <= 5 ? 'var(--danger-text)' : 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                <Icon name="clock" size={12} /> {remaining}s
              </span>
            )}
          </div>

          <div className="hc-card" style={{ gap: 14 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{question.question.text}</p>
            {question.question.image_url && (
              <img
                src={question.question.image_url}
                alt=""
                style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {question.options.map((option, index) => {
                const chosen = selected.includes(option.position)
                const isCorrect = reveal?.correct_positions?.includes(option.position)
                const showCorrect = Boolean(reveal) && isCorrect
                const showWrong = Boolean(reveal) && chosen && !isCorrect
                return (
                  <button
                    key={option.position}
                    type="button"
                    onClick={() => pick(option.position)}
                    disabled={!windowOpen || Boolean(question.answered) || Boolean(reveal)}
                    aria-pressed={chosen}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      minHeight: 56,
                      padding: '13px 15px',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      fontSize: 14.5,
                      fontWeight: 600,
                      borderRadius: 14,
                      cursor: windowOpen && !question.answered ? 'pointer' : 'default',
                      border: `1.5px solid ${
                        showCorrect
                          ? 'var(--success-text)'
                          : showWrong
                            ? 'var(--danger-text)'
                            : chosen
                              ? 'var(--accent)'
                              : 'var(--border)'
                      }`,
                      background: showCorrect
                        ? 'var(--success-light)'
                        : showWrong
                          ? 'var(--danger-light)'
                          : chosen
                            ? 'var(--accent-light)'
                            : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 8,
                        background: chosen || showCorrect ? 'var(--accent)' : 'var(--bg)',
                        color: chosen || showCorrect ? 'var(--on-accent)' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: 800,
                        border: '1px solid var(--border)',
                      }}
                    >
                      {OPTION_LETTERS[index] ?? index + 1}
                    </span>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{option.text}</span>
                  </button>
                )
              })}
            </div>

            {!question.answered && !reveal && (
              <button
                className="hc-btn hc-btn--primary hc-btn--block"
                type="button"
                onClick={submit}
                disabled={selected.length === 0 || submitting || !windowOpen}
              >
                <Icon name="send" size={14} />
                {windowOpen ? (submitting ? 'Submitting…' : 'Lock answer') : 'Time is up'}
              </button>
            )}

            {(question.answered || answerResult) && !reveal && (
              <p className="hc-note" style={{ margin: 0 }} role="status">
                <Icon name="lock" size={12} /> Answer locked. Correctness is revealed when the host moves on.
              </p>
            )}

            {reveal && (
              <div className="hc-note" role="status">
                <strong>Answer:</strong> {reveal.correct_positions.map((p) => OPTION_LETTERS[p] ?? p + 1).join(', ')}
                {reveal.explanation ? ` — ${reveal.explanation}` : ''}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Completed */}
      {room.status === 'completed' && (
        <section className="hc-reveal" aria-live="polite">
          <div className="hc-card" style={{ textAlign: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex', justifyContent: 'center', color: 'var(--yellow-text)' }}>
              <Icon name="trophy" size={30} />
            </span>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              {myRank
                ? myRank.rank === 1
                  ? 'You won the room!'
                  : `You finished #${myRank.rank}`
                : 'Competition finished'}
            </p>
            {myRank && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                {myRank.score} points · {myRank.correct_count}/{myRank.answered_count} correct · {myRank.accuracy}%
                accuracy
              </p>
            )}
          </div>
        </section>
      )}

      {/* Leaderboard */}
      {board && board.top.length > 0 && (
        <section className="hc-reveal" style={{ marginTop: 16 }} aria-label="Leaderboard">
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
            Top players
          </h2>
          <div className="hc-grid hc-grid--list" style={{ gap: 6 }}>
            {board.top.map((entry) => (
              <div
                key={`${entry.rank}-${entry.display_name}`}
                className="hc-card"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 13px',
                  background:
                    entry.rank === myRank?.rank && entry.display_name === myRank?.display_name
                      ? 'var(--accent-light)'
                      : 'var(--bg)',
                }}
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
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-text)' }}>{entry.score}</span>
              </div>
            ))}
          </div>
          {myRank && !board.top.some((e) => e.display_name === myRank.display_name) && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              You: #{myRank.rank} · {myRank.score} points
            </p>
          )}
        </section>
      )}

      {room.is_host && (
        <p style={{ textAlign: 'center', marginTop: 18 }}>
          <Link className="hc-btn" href={`/compete/live/host/${room.id}`} style={{ textDecoration: 'none' }}>
            <Icon name="gamepad" size={13} /> Open host controls
          </Link>
        </p>
      )}
    </div>
  )
}
