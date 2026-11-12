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
  is_kicked: boolean
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

type JoinResult = {
  ok: boolean
  competition_id?: string
  status?: string
  error?: string
  throttled?: boolean
  retry_after_s?: number
  is_host?: boolean
  participant_id?: string | null
  rejoined?: boolean
}

/** Precise copy for the per-reason codes older server builds still return. */
const JOIN_ERROR_MESSAGES: Record<string, string> = {
  room_not_found: 'No room with that code. Check the six digits with your host.',
  room_closed: 'This room has closed.',
  room_finished: 'This room has already finished.',
  late_join_disabled: 'This room is already running and late joining is off.',
  room_full: 'This room is full.',
}

/** The hardened join uses one generic code for every room-state failure. */
const GENERIC_JOIN_ERRORS = new Set(['invalid_or_unavailable'])

export default function RoomPlayer({ code }: { code: string }) {
  const supabase = createClient()

  const [room, setRoom] = useState<Room | null>(null)
  const [question, setQuestion] = useState<QuestionPayload | null>(null)
  const [board, setBoard] = useState<{ top: BoardEntry[]; me: BoardEntry | null } | null>(null)
  const [reveal, setReveal] = useState<{ correct_positions: number[]; explanation: string | null } | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [answerResult, setAnswerResult] = useState<'accepted' | 'duplicate' | 'closed' | null>(null)
  const [joinError, setJoinError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryingIn, setRetryingIn] = useState(0)
  const [awaitingRole, setAwaitingRole] = useState(false)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const revealedFor = useRef<string>('')
  // Joining is idempotent server-side, but there is no reason to repeat it on
  // every poll — the room id is stable for the life of the page.
  const competitionIdRef = useRef<string>('')
  // One pending retry/reload at a time, plus caps so a dead room cannot spin.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRetries = useRef(0)
  const networkRetries = useRef(0)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  // Which question's time-up transition already refreshed the board.
  const boardFor = useRef('')

  const deadlineMs = question?.deadline ? new Date(question.deadline).getTime() : 0
  const remaining = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : 0

  /** One pending timed retry, clamped so the countdown stays readable. */
  const scheduleRetry = useCallback((seconds: number) => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    const wait = Math.max(1, Math.min(Math.round(Number(seconds)) || 1, 30))
    setRetryingIn(wait)
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null
      setRetryingIn(0)
      void refreshRef.current()
    }, wait * 1000)
  }, [])

  /** Coalesce a burst of room events into a single reload. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      void refreshRef.current()
    }, 400)
  }, [])

  /**
   * Fetch the answer key for the question on screen. The server refuses while
   * the window is still open, so a refusal just means "not yet".
   */
  const loadReveal = useCallback(async () => {
    const competitionId = competitionIdRef.current
    if (!competitionId) return
    const key = `${question?.position ?? -1}:${question?.deadline ?? ''}`
    if (revealedFor.current === key) return
    const { data } = await supabase.rpc('live_quiz_reveal', { p_competition_id: competitionId })
    const payload = data as { ok: boolean; correct_positions?: number[]; explanation?: string | null } | null
    if (!payload?.ok) return
    revealedFor.current = key
    setReveal({
      correct_positions: payload.correct_positions ?? [],
      explanation: payload.explanation ?? null,
    })
  }, [question?.deadline, question?.position, supabase])

  /** Leaderboard fetch that the time-up transition can call on its own. */
  const loadBoard = useCallback(async () => {
    const competitionId = competitionIdRef.current
    if (!competitionId) return
    const { data } = await supabase.rpc('live_quiz_leaderboard', {
      p_competition_id: competitionId,
      p_limit: 10,
    })
    const payload = data as { ok: boolean; top: BoardEntry[]; me: BoardEntry | null } | null
    if (payload?.ok) setBoard({ top: payload.top ?? [], me: payload.me ?? null })
  }, [supabase])

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
      // A paused room is still inside its window (the clock is frozen), so the
      // request is skipped rather than being refused.
      const questionKey = `${questionData?.position ?? -1}:${questionData?.deadline ?? ''}`
      if (
        questionData?.question &&
        questionData.status !== 'live' &&
        questionData.status !== 'paused' &&
        revealedFor.current !== questionKey
      ) {
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

    const { data: joined, error: rpcError } = await supabase.rpc('live_quiz_join', { p_room_code: code })

    // A dropped request says nothing about the room, so retry it on a timer
    // before telling the player anything is wrong.
    if (rpcError) {
      setLoading(false)
      setJoinError('Could not reach the room — retrying…')
      const attempt = (networkRetries.current += 1)
      if (attempt <= 4) scheduleRetry(attempt * 2)
      else setJoinError('Could not reach the room. Check your connection, then reload this page.')
      return
    }

    const result = joined as JoinResult | null

    if (!result?.ok || !result.competition_id) {
      setLoading(false)

      // The server reports its own rate limit (and how long it lasts), which
      // is a fact about this browser, not about the room — so a timed retry is
      // safe and needs nothing from the player.
      if (result?.throttled) {
        if (autoRetries.current < 20) {
          autoRetries.current += 1
          setJoinError('Too many room-code attempts on this network — retrying automatically…')
          scheduleRetry(Number(result.retry_after_s ?? 0))
        } else {
          setJoinError('Too many attempts on this network. Wait a few minutes, then reload to join.')
        }
        return
      }

      if (result?.error === 'kicked') {
        setJoinError('The host removed you from this room.')
        return
      }

      const reason = result?.error
      setJoinError(
        reason && !GENERIC_JOIN_ERRORS.has(reason) && JOIN_ERROR_MESSAGES[reason]
          ? JOIN_ERROR_MESSAGES[reason]
          : 'This code is not joinable right now. Check the six digits with your host — the room may have closed, started without late joining, or be full.'
      )
      return
    }

    autoRetries.current = 0
    networkRetries.current = 0
    setJoinError('')
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    setRetryingIn(0)

    // The room's creator decides here, once, whether this visit is hosting or
    // playing. Nobody else is ever offered the host side, and `host_id` itself
    // never changes — this only decides whether a participant row is created.
    if (result.is_host && !result.participant_id) {
      const { data: roomData } = await supabase.rpc('live_quiz_room', { p_competition_id: result.competition_id })
      const preview = roomData as Room | null
      if (preview?.ok) setRoom(preview)
      setAwaitingRole(true)
      setLoading(false)
      return
    }

    competitionIdRef.current = result.competition_id
    await loadState(result.competition_id)
  }, [code, loadState, scheduleRetry, supabase])

  /** Creator chose the player side: create the participant row explicitly. */
  const joinAsParticipant = useCallback(async () => {
    const competitionId = room?.id ?? competitionIdRef.current
    if (!competitionId) return
    setAwaitingRole(false)
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('live_quiz_join', {
      p_room_code: code,
      p_as_participant: true,
    })
    const result = data as JoinResult | null
    if (rpcError || !result?.ok || !result.competition_id) {
      setJoinError(rpcError ? 'Could not reach the room — try again.' : 'Could not join as a player.')
      setLoading(false)
      return
    }
    competitionIdRef.current = result.competition_id
    await loadState(result.competition_id)
  }, [code, loadState, room?.id, supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  // The retry/reload timers call the latest refresh without re-running effects.
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    []
  )

  const retrying = retryingIn > 0
  useEffect(() => {
    if (!retrying) return
    const timer = setInterval(() => setRetryingIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [retrying])

  /**
   * Realtime — the room's event log is the push channel.
   *
   * `participant_joined` only changes the head count, so it is applied from the
   * event payload with NO refetch: otherwise every join makes every connected
   * player reload the room, which is quadratic and is exactly what an
   * audience-sized join rush trips over. Everything else is coalesced into one
   * debounced reload, so a burst of events costs a single round trip.
   */
  useEffect(() => {
    if (!room?.id) return
    const channel = supabase
      .channel(`lb-room-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'competition_events', filter: `competition_id=eq.${room.id}` },
        (event) => {
          const row = event.new as { event_type?: string; payload?: { participants?: number } } | undefined
          const count = row?.payload?.participants
          if (row?.event_type === 'participant_joined') {
            if (typeof count === 'number') {
              setRoom((prev) => (prev ? { ...prev, participants: count } : prev))
            }
            return
          }
          if (row?.event_type === 'participant_kicked') {
            // The removed player has to re-read the room to find out; it is one
            // event per kick, so this stays cheap.
            if (typeof count === 'number') {
              setRoom((prev) => (prev ? { ...prev, participants: count } : prev))
            }
            scheduleRefresh()
            return
          }
          scheduleRefresh()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [room?.id, scheduleRefresh, supabase])

  // Poll fallback (and a clock for the countdown). Jitter spreads a waiting
  // room's clients instead of having them refresh in lockstep, and a hidden tab
  // does not poll at all.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    const period = 5000 + Math.floor(Math.random() * 2000)
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (room?.status === 'waiting' || room?.status === 'live' || room?.status === 'paused') {
        void refreshRef.current()
      }
    }, period)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [room?.status])

  // The countdown reaching zero closes the window even though the room is still
  // "live". That gap — before the host opens the next question — is when the
  // correct option and the refreshed board appear, so both are fetched here
  // instead of waiting for a status change that never happens.
  useEffect(() => {
    if (!deadlineMs || room?.status !== 'live' || !question?.question) return
    if (remaining > 0) return
    void loadReveal()
    const key = `${question.position}:${question.deadline ?? ''}`
    if (boardFor.current === key) return
    boardFor.current = key
    void loadBoard()
  }, [
    deadlineMs,
    loadBoard,
    loadReveal,
    question?.deadline,
    question?.position,
    question?.question,
    remaining,
    room?.status,
  ])

  // A new question arrives → clear the previous answer state.
  useEffect(() => {
    setSelected([])
    setAnswerResult(null)
    setReveal(null)
    setNotice('')
    revealedFor.current = ''
    boardFor.current = ''
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
      else if (result?.error === 'not_live') setNotice('The host paused or ended this question.')
      else if (result?.error === 'not_in_room') setNotice('You are no longer in this room.')
      else setNotice('Your answer was not accepted. Try again.')
      refresh()
    } catch {
      // A failed submit is a message, never a reason to throw away the room.
      setNotice('Could not submit — check your connection and try again.')
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

  const windowOpen = Boolean(deadlineMs) && remaining > 0 && room?.status === 'live'

  if (loading) {
    return (
      <div className="hc-page">
        <div className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />
      </div>
    )
  }

  if (!room) {
    return (
      <div className="hc-page">
        <div className="hc-empty">
          <div className="hc-empty-ic">
            <Icon name="alert" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">Room not available</p>
          <p className="hc-empty-s" role="status">
            {joinError || 'That room could not be loaded.'}
          </p>
          {retryingIn > 0 ? (
            <p className="hc-note" style={{ margin: 0 }} role="status">
              Retrying in {retryingIn}s…
            </p>
          ) : (
            <button
              className="hc-btn hc-btn--primary"
              type="button"
              onClick={() => {
                setJoinError('')
                setLoading(true)
                void refresh()
              }}
            >
              <Icon name="chevron" size={14} /> Try again
            </button>
          )}
          <Link className="hc-btn" href="/compete/live" style={{ textDecoration: 'none' }}>
            Back to Live Battle
          </Link>
        </div>
      </div>
    )
  }

  if (awaitingRole) {
    return (
      <div className="hc-page">
        <div className="hc-page-head hc-reveal">
          <span className="hc-eyebrow">Room {room.room_code}</span>
          <h1 className="hc-h1">{room.title}</h1>
        </div>
        <section className="hc-card hc-reveal" style={{ gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>You created this room.</p>
          <p className="hc-note" style={{ margin: 0 }}>
            Only you are its host, and that does not change. Choose how you want to enter.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              className="hc-btn hc-btn--primary"
              href={`/compete/live/host/${room.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Icon name="gamepad" size={14} /> Host this room
            </Link>
            <button className="hc-btn" type="button" onClick={() => void joinAsParticipant()}>
              <Icon name="users" size={14} /> Join as a player
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (room.is_kicked) {
    return (
      <div className="hc-page">
        <div className="hc-empty">
          <div className="hc-empty-ic">
            <Icon name="lock" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">Removed from this room</p>
          <p className="hc-empty-s">The host removed you from this competition, so you can no longer answer.</p>
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

      {notice && (
        <div className="hc-alert" role="status" style={{ marginBottom: 12 }}>
          {notice}
        </div>
      )}

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

            {reveal && room.status === 'live' && remaining === 0 && (
              <p className="hc-note" style={{ margin: 0 }} role="status">
                <Icon name="clock" size={12} /> Waiting for the host to open the next question…
              </p>
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
