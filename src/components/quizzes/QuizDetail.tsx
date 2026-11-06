'use client'

/**
 * Quiz detail — one quiz, its questions, and the three things you can do with
 * it: practise solo, host it live, or (as the owner) edit and publish it.
 *
 * Hosting calls `quiz_start_competition`, which snapshots the quiz into the
 * EXISTING live engine. This screen never starts a second engine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  addQuestionsToQuiz,
  deleteQuiz,
  forkQuiz,
  listQuizDetail,
  removeQuestionFromQuiz,
  setQuizStatus,
  startCompetitionFromQuiz,
} from '@/lib/quizzes/client'
import type { QuizDetail as QuizDetailData, QuizVisibility } from '@/lib/quizzes/types'
import PracticePlayer from './PracticePlayer'

const card: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface, #fff)',
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

const VISIBILITY_LABEL: Record<QuizVisibility, string> = {
  private: 'Only me',
  campus: 'My campus',
  public: 'Everyone',
}

export default function QuizDetail({ quizId, user }: { quizId: string; user: { id: string } | null }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [detail, setDetail] = useState<QuizDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [practising, setPractising] = useState(false)

  const [adding, setAdding] = useState(false)
  const [bank, setBank] = useState<{ id: string; question_text: string }[]>([])
  const [picked, setPicked] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listQuizDetail(quizId)
      if (!result?.ok) {
        setError('That quiz is not available.')
        setDetail(null)
      } else {
        setDetail(result)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that quiz.')
    } finally {
      setLoading(false)
    }
  }, [quizId])

  useEffect(() => {
    load()
  }, [load])

  const quiz = detail?.quiz
  const isOwner = Boolean(user && quiz?.is_owner)

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy('')
    }
  }

  const publish = () =>
    run('publish', async () => {
      const result = await setQuizStatus(quizId, 'published')
      if (!result.ok) {
        setError(
          result.error === 'no_questions'
            ? 'Add at least one question before publishing.'
            : result.error === 'invalid_questions'
              ? 'Some questions are incomplete — each needs two options and a correct answer.'
              : 'Could not publish that quiz.'
        )
        return
      }
      await load()
      setNotice('Quiz published.')
    })

  const hostLive = () =>
    run('host', async () => {
      const competition = await startCompetitionFromQuiz({ quizId })
      router.push(`/compete/live/host/${competition.id}`)
    })

  const fork = () =>
    run('fork', async () => {
      const result = await forkQuiz(quizId)
      if (!result.ok || !result.quiz_id) {
        setError('Could not copy that quiz.')
        return
      }
      router.push(`/quizzes/${result.quiz_id}`)
    })

  const remove = () =>
    run('delete', async () => {
      const result = await deleteQuiz(quizId)
      if (result.archived) {
        await load()
        setNotice('This quiz has been played, so it was archived instead of deleted.')
        return
      }
      router.push('/quizzes')
    })

  const openAdd = async () => {
    setAdding(true)
    if (!user || bank.length > 0) return
    const { data } = await supabase
      .from('question_bank')
      .select('id, question_text')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(200)
    const existing = new Set(detail?.questions.map((question) => question.question_id) ?? [])
    setBank(((data ?? []) as { id: string; question_text: string }[]).filter((row) => !existing.has(row.id)))
  }

  const submitAdd = () =>
    run('add', async () => {
      if (picked.length === 0) {
        setAdding(false)
        return
      }
      const result = await addQuestionsToQuiz(quizId, picked)
      if (!result.ok) {
        setError('Could not add those questions.')
        return
      }
      setPicked([])
      setAdding(false)
      await load()
      setNotice(`Added ${result.added ?? 0} question${result.added === 1 ? '' : 's'}.`)
    })

  const removeQuestion = (questionId: string) =>
    run(`remove-${questionId}`, async () => {
      await removeQuestionFromQuiz(quizId, questionId)
      await load()
    })

  if (loading) {
    return <p style={{ padding: '24px 16px', color: 'var(--text-muted)' }}>Loading quiz…</p>
  }

  if (!detail || !quiz) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 700, margin: '0 auto' }}>
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error || 'That quiz is not available.'}
        </p>
        <Link href="/quizzes">← Back to quizzes</Link>
      </div>
    )
  }

  if (practising) {
    return <PracticePlayer quizId={quizId} title={quiz.title} onExit={() => setPractising(false)} />
  }

  return (
    <div style={{ display: 'grid', gap: 16, padding: '0 16px 40px', maxWidth: 900, margin: '0 auto' }}>
      <Link href="/quizzes" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
        ← All quizzes
      </Link>

      <section style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className={`hc-tag ${quiz.status === 'published' ? 'hc-tag--success' : 'hc-tag--ghost'}`}>
            {quiz.status}
          </span>
          <span className="hc-tag hc-tag--ghost">{quiz.subject}</span>
          <span className="hc-tag hc-tag--ghost">{VISIBILITY_LABEL[quiz.visibility]}</span>
          {quiz.source === 'ai' && <span className="hc-tag hc-tag--warn">AI assisted</span>}
        </div>

        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>{quiz.title}</h1>
        {quiz.description && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>{quiz.description}</p>}
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          {quiz.question_count} question{quiz.question_count === 1 ? '' : 's'} · played {quiz.play_count} time
          {quiz.play_count === 1 ? '' : 's'}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={primary} onClick={() => setPractising(true)}>
            Practise solo
          </button>
          {user && quiz.status === 'published' && (
            <button style={ghost} onClick={hostLive} disabled={busy === 'host'}>
              {busy === 'host' ? 'Opening room…' : 'Host live'}
            </button>
          )}
          {user && (
            <button style={ghost} onClick={fork} disabled={busy === 'fork'}>
              Copy to my quizzes
            </button>
          )}
          {isOwner && quiz.status !== 'published' && (
            <button style={ghost} onClick={publish} disabled={busy === 'publish'}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {isOwner && (
            <button style={ghost} onClick={openAdd}>
              Add questions
            </button>
          )}
          {isOwner && (
            <button style={{ ...ghost, color: '#b91c1c' }} onClick={remove} disabled={busy === 'delete'}>
              Delete
            </button>
          )}
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" style={{ margin: 0, fontSize: 13, color: '#047857' }}>
            {notice}
          </p>
        )}
        {isOwner && quiz.status === 'draft' && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Drafts are private. Publish to host it live or let others find it.
          </p>
        )}
      </section>

      {adding && (
        <section style={{ ...card, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Add questions from your bank</h2>
          {bank.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              No unused questions in your bank. <Link href="/compete/live/questions">Open the question bank</Link>.
            </p>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {bank.map((row) => (
                <label key={row.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(row.id)}
                    onChange={(event) =>
                      setPicked((prev) =>
                        event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                      )
                    }
                  />
                  <span>{row.question_text}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primary} onClick={submitAdd} disabled={busy === 'add'}>
              Add selected
            </button>
            <button style={ghost} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        {detail.questions.length === 0 && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>This quiz has no questions yet.</p>
        )}
        {detail.questions.map((question) => (
          <article key={question.question_id} style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 15, lineHeight: 1.4 }}>
                {question.position + 1}. {question.question}
              </strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {question.type.replace('_', ' ')} · {question.marks} pts
              </span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 4 }}>
              {question.options.map((option) => {
                const correct = question.is_correct_positions?.includes(option.position)
                return (
                  <li
                    key={option.position}
                    style={{
                      fontSize: 13,
                      color: correct ? '#047857' : 'inherit',
                      fontWeight: correct ? 650 : 400,
                    }}
                  >
                    {option.text}
                    {correct ? ' ✓' : ''}
                  </li>
                )
              })}
            </ol>
            {question.explanation && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{question.explanation}</p>
            )}
            {isOwner && (
              <button
                style={{ ...ghost, alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12 }}
                onClick={() => removeQuestion(question.question_id)}
                disabled={busy === `remove-${question.question_id}`}
              >
                Remove from quiz
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}
