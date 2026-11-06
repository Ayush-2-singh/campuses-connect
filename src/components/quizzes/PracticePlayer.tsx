'use client'

/**
 * Self-paced practice.
 *
 * The attempt is opened and scored entirely by the database:
 * `quiz_attempt_start` returns the questions WITHOUT answer keys, and
 * `quiz_attempt_answer` grades one question and only then reveals that
 * question's correct positions. There is no timer, no participation record,
 * and no realtime traffic — practice never touches the live engine.
 */

import { useCallback, useEffect, useState } from 'react'
import { answerPracticeQuestion, finishPracticeAttempt, startPracticeAttempt } from '@/lib/quizzes/client'
import type { PracticeAnswerResult, PracticeAttempt, PracticeSummary } from '@/lib/quizzes/types'

const card: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface, #fff)',
  display: 'grid',
  gap: 12,
}

const primary: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--brand, #2563eb)',
  color: '#fff',
  fontWeight: 650,
  fontSize: 14,
  cursor: 'pointer',
}

const ghost: React.CSSProperties = {
  ...primary,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid var(--border, #e5e7eb)',
}

export default function PracticePlayer({
  quizId,
  title,
  onExit,
}: {
  quizId: string
  title?: string
  onExit: () => void
}) {
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [result, setResult] = useState<PracticeAnswerResult | null>(null)
  const [summary, setSummary] = useState<PracticeSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    startPracticeAttempt(quizId)
      .then((data) => {
        if (cancelled) return
        if (!data?.ok) {
          setError('This quiz cannot be practised right now.')
          return
        }
        setAttempt(data)
        // resume where the learner stopped
        const nextUnanswered = data.questions.findIndex((question) => !question.answered)
        setIndex(nextUnanswered === -1 ? 0 : nextUnanswered)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start practice.')
      })
    return () => {
      cancelled = true
    }
  }, [quizId])

  const question = attempt?.questions[index]

  const toggle = useCallback(
    (position: number) => {
      if (result) return
      setSelected((prev) => {
        if (question?.type === 'multiple') {
          return prev.includes(position) ? prev.filter((p) => p !== position) : [...prev, position]
        }
        return [position]
      })
    },
    [question?.type, result]
  )

  const submit = async () => {
    if (!attempt || !question || selected.length === 0) return
    setBusy(true)
    setError('')
    try {
      const answer = await answerPracticeQuestion(attempt.attempt_id, question.question_id, selected)
      if (!answer?.ok) {
        setError('That answer could not be saved.')
        return
      }
      setResult(answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That answer could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const advance = async () => {
    if (!attempt) return
    const isLast = index >= attempt.questions.length - 1
    setResult(null)
    setSelected([])

    if (!isLast) {
      setIndex(index + 1)
      return
    }

    setBusy(true)
    try {
      const finished = await finishPracticeAttempt(attempt.attempt_id)
      setSummary(finished)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish that attempt.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !attempt) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 700, margin: '0 auto' }}>
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
        <button style={ghost} onClick={onExit}>
          Back to quiz
        </button>
      </div>
    )
  }

  if (summary) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 620, margin: '0 auto', display: 'grid', gap: 14 }}>
        <section style={card}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Practice complete</h1>
          <p style={{ margin: 0, fontSize: 15 }}>
            <strong>{summary.score}</strong> / {summary.max_score} points ({summary.percent}%)
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {summary.correct_count} of {summary.question_total} correct · {summary.answered_count} answered
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primary} onClick={onExit}>
              Done
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!attempt || !question) {
    return <p style={{ padding: '24px 16px', color: 'var(--text-muted)' }}>Preparing practice…</p>
  }

  return (
    <div style={{ padding: '0 16px 40px', maxWidth: 700, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button style={ghost} onClick={onExit}>
          ← Exit practice
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {index + 1} / {attempt.questions.length}
          {title ? ` · ${title}` : ''}
        </span>
      </div>

      <section style={card}>
        <strong style={{ fontSize: 17, lineHeight: 1.4 }}>{question.question}</strong>
        {question.image_url && <img src={question.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 10 }} />}

        <div style={{ display: 'grid', gap: 8 }}>
          {question.options.map((option) => {
            const picked = selected.includes(option.position)
            const correct = result?.correct_positions.includes(option.position)
            const tone = result ? (correct ? '#065f46' : picked ? '#991b1b' : 'inherit') : 'inherit'
            return (
              <button
                key={option.position}
                onClick={() => toggle(option.position)}
                disabled={Boolean(result)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: 14,
                  cursor: result ? 'default' : 'pointer',
                  border: `1px solid ${picked || correct ? 'var(--brand, #2563eb)' : 'var(--border, #e5e7eb)'}`,
                  background: picked ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  color: tone,
                  fontWeight: correct ? 650 : 400,
                }}
              >
                {option.text}
                {result && correct ? ' ✓' : ''}
              </button>
            )
          })}
        </div>

        {question.type === 'multiple' && !result && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Select every correct option, then check.
          </p>
        )}

        {result && (
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 14, color: result.correct ? '#047857' : '#b91c1c' }}>
              {result.correct ? 'Correct' : 'Not quite'}
              {result.already_answered ? ' (already answered earlier)' : ''}
            </strong>
            {result.explanation && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{result.explanation}</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {result ? (
            <button style={primary} onClick={advance} disabled={busy}>
              {index >= attempt.questions.length - 1 ? 'Finish' : 'Next question'}
            </button>
          ) : (
            <button style={primary} onClick={submit} disabled={busy || selected.length === 0}>
              {busy ? 'Checking…' : 'Check answer'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
