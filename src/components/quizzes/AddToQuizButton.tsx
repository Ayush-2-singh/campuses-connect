'use client'

/**
 * "Add to quiz" for a question-bank row.
 *
 * A question bank is one source of truth; a quiz is a curated list pointing at
 * it. This picker is the bridge, and it only ever lists quizzes the caller
 * owns, so `quiz_add_questions` is a convenience rather than a permission
 * boundary — that check lives in the database.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addQuestionsToQuiz } from '@/lib/quizzes/client'

type QuizRow = { id: string; title: string; status: string; owner_id: string }

export default function AddToQuizButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false)
  const [quizzes, setQuizzes] = useState<QuizRow[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false

    const load = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('quizzes')
        .select('id, title, status, owner_id')
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })
        .limit(50)

      if (cancelled) return
      setQuizzes(((data ?? []) as QuizRow[]).filter((row) => row.owner_id === user?.id))
      setLoaded(true)
    }

    load().catch(() => setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [open, loaded])

  const add = async (quizId: string, quizTitle: string) => {
    setBusy(quizId)
    setMessage('')
    try {
      const result = await addQuestionsToQuiz(quizId, [questionId])
      if (!result.ok) {
        setMessage('Could not add that question.')
        return
      }
      setMessage(result.added === 0 ? `Already in “${quizTitle}”.` : `Added to “${quizTitle}”.`)
      setOpen(false)
    } catch {
      setMessage('Could not add that question.')
    } finally {
      setBusy('')
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="hc-chip"
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          setMessage('')
        }}
        aria-expanded={open}
        aria-label="Add question to a quiz"
      >
        + Quiz
      </button>

      {message && (
        <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--text-muted)' }} role="status">
          {message}
        </span>
      )}

      {open && (
        <span
          style={{
            position: 'absolute',
            right: 0,
            bottom: '130%',
            zIndex: 20,
            minWidth: 220,
            maxHeight: 220,
            overflowY: 'auto',
            display: 'grid',
            gap: 2,
            padding: 8,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary, #fff)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
          }}
        >
          {!loaded && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</span>}
          {loaded && quizzes.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No quizzes yet. Create one in Quizzes.</span>
          )}
          {quizzes.map((quiz) => (
            <button
              key={quiz.id}
              type="button"
              className="hc-chip"
              style={{ justifyContent: 'flex-start', width: '100%' }}
              disabled={busy === quiz.id}
              onClick={() => add(quiz.id, quiz.title)}
            >
              {busy === quiz.id ? 'Adding…' : quiz.title}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
