'use client'

/**
 * Quiz library — the reusable, browsable collection of quizzes.
 *
 * Reads go straight through RLS (`quizzes_public_read` / `quizzes_campus_read`),
 * creation goes through `quiz_create`. Nothing here decides visibility or
 * ownership; it only renders what the database allows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createQuiz } from '@/lib/quizzes/client'
import type { QuizSummary, QuizVisibility } from '@/lib/quizzes/types'
import AiQuizWizard from './AiQuizWizard'

type BankRow = { id: string; question_text: string; difficulty: string; subject: string }

const card: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface, #fff)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 4,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 14,
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

export default function QuizLibrary({ user }: { user: { id: string; email?: string | null } | null }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'mine' | 'discover'>('mine')

  const [creating, setCreating] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('General')
  const [visibility, setVisibility] = useState<QuizVisibility>('private')
  const [bank, setBank] = useState<BankRow[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('quizzes')
      .select(
        'id, title, description, cover_url, subject, visibility, status, source, fork_of, question_count, play_count, campus_id, owner_id'
      )
      .order('updated_at', { ascending: false })
      .limit(60)

    if (loadError) setError('Could not load quizzes.')
    setQuizzes(
      (data ?? []).map((row) => ({
        ...row,
        is_owner: user?.id === row.owner_id,
      })) as QuizSummary[]
    )
    setLoading(false)
  }, [supabase, user?.id])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = async () => {
    setCreating(true)
    setError('')
    if (bank.length > 0 || !user) return
    const { data } = await supabase
      .from('question_bank')
      .select('id, question_text, difficulty, subject')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(200)
    setBank((data ?? []) as BankRow[])
  }

  const submitCreate = async () => {
    if (!title.trim()) {
      setError('Give the quiz a title first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await createQuiz({
        title,
        subject,
        visibility,
        questionIds: picked,
        source: 'manual',
      })
      if (!result.ok || !result.quiz_id) {
        setError('Could not create that quiz.')
        return
      }
      router.push(`/quizzes/${result.quiz_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that quiz.')
    } finally {
      setSaving(false)
    }
  }

  const mine = quizzes.filter((quiz) => quiz.is_owner)
  const discover = quizzes.filter((quiz) => !quiz.is_owner)
  const shown = tab === 'mine' ? mine : discover

  return (
    <div style={{ display: 'grid', gap: 18, padding: '0 16px 40px', maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>Quizzes</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          Build a quiz once, then run it live or practise it solo. Every playing method uses the same question bank.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tab === 'mine' ? primary : ghost} onClick={() => setTab('mine')}>
          My quizzes ({mine.length})
        </button>
        <button style={tab === 'discover' ? primary : ghost} onClick={() => setTab('discover')}>
          Discover ({discover.length})
        </button>
        <span style={{ flex: 1 }} />
        {user && (
          <>
            <button style={ghost} onClick={() => setAiOpen((v) => !v)}>
              {aiOpen ? 'Close AI drafting' : 'Draft with AI'}
            </button>
            <button style={primary} onClick={openCreate}>
              New quiz
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {!user && (
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          <Link href="/auth/login?redirect=/quizzes">Sign in</Link> to create quizzes and track your attempts.
        </p>
      )}

      {aiOpen && user && <AiQuizWizard onDone={(quizId) => router.push(`/quizzes/${quizId}`)} />}

      {creating && user && (
        <section style={{ ...card, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>New quiz</h2>
          <div>
            <label style={label} htmlFor="quiz-title">
              Title
            </label>
            <input
              id="quiz-title"
              style={input}
              value={title}
              maxLength={140}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Graphs and shortest paths"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label} htmlFor="quiz-subject">
                Subject
              </label>
              <input
                id="quiz-subject"
                style={input}
                value={subject}
                maxLength={60}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div>
              <label style={label} htmlFor="quiz-visibility">
                Who can find it
              </label>
              <select
                id="quiz-visibility"
                style={input}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as QuizVisibility)}
              >
                {(Object.keys(VISIBILITY_LABEL) as QuizVisibility[]).map((key) => (
                  <option key={key} value={key}>
                    {VISIBILITY_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span style={label}>Questions from your bank ({picked.length} selected)</span>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {bank.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  No questions yet — add some in the question bank, or draft them with AI.
                </p>
              )}
              {bank.map((row) => (
                <label
                  key={row.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #e5e7eb)',
                  }}
                >
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
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primary} onClick={submitCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create quiz'}
            </button>
            <button style={ghost} onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading quizzes…</p>
      ) : shown.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
            {tab === 'mine' ? 'You have not created a quiz yet.' : 'No published quizzes are visible to you yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {shown.map((quiz) => (
            <Link
              key={quiz.id}
              href={`/quizzes/${quiz.id}`}
              style={{ ...card, textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`hc-tag ${quiz.status === 'published' ? 'hc-tag--success' : 'hc-tag--ghost'}`}>
                  {quiz.status}
                </span>
                <span className="hc-tag hc-tag--ghost">{quiz.subject}</span>
                {quiz.source === 'ai' && <span className="hc-tag hc-tag--warn">AI</span>}
              </div>
              <strong style={{ fontSize: 15, lineHeight: 1.3 }}>{quiz.title}</strong>
              {quiz.description && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{quiz.description.slice(0, 120)}</span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {quiz.question_count} question{quiz.question_count === 1 ? '' : 's'} ·{' '}
                {VISIBILITY_LABEL[quiz.visibility]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
