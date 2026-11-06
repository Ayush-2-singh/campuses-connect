'use client'

/**
 * AI drafting wizard. Two strictly separate steps:
 *   1. draft   — the server generates and validates candidates
 *   2. review  — a human ticks the questions worth keeping
 *
 * Step 2 is the only way generated text reaches the question bank
 * (`quiz_ai_job_accept`), and it lands in a DRAFT quiz. Nothing published,
 * nothing applied automatically.
 */

import { useState } from 'react'
import { acceptAiDraft, discardAiDraft } from '@/lib/quizzes/client'
import type { RejectedQuestion, DraftQuestion } from '@/lib/quizzes/validation'

type DraftState = {
  jobId: string
  questions: DraftQuestion[]
  rejected: RejectedQuestion[]
  duplicates: number
  status: string
}

const card: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface, #fff)',
  display: 'grid',
  gap: 12,
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

export default function AiQuizWizard({ onDone }: { onDone: (quizId: string) => void }) {
  const [sourceKind, setSourceKind] = useState<'topic' | 'text' | 'pdf' | 'image'>('topic')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [subject, setSubject] = useState('General')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed')
  const [instructions, setInstructions] = useState('')
  const [title, setTitle] = useState('')

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const generate = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      form.set('sourceKind', sourceKind)
      form.set('subject', subject)
      form.set('topic', topic)
      form.set('text', text)
      form.set('count', String(count))
      form.set('difficulty', difficulty)
      form.set('instructions', instructions)
      if (file) form.set('file', file)

      const response = await fetch('/api/quizzes/ai/generate', { method: 'POST', body: form })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        jobId?: string | null
        status?: string
        questions?: DraftQuestion[]
        rejected?: RejectedQuestion[]
        duplicates?: number
        reused?: boolean
        truncated?: boolean
      }

      if (!response.ok) {
        setError(payload.error || 'Generation failed. Please try again.')
        return
      }

      const questions = payload.questions ?? []
      if (!payload.jobId || questions.length === 0) {
        setError('The model did not return a usable question. Try rephrasing the topic.')
        return
      }

      setDraft({
        jobId: payload.jobId,
        questions,
        rejected: payload.rejected ?? [],
        duplicates: payload.duplicates ?? 0,
        status: payload.status ?? 'review_ready',
      })
      setSelected(questions.map((_, index) => index))
      setNotice(
        [
          payload.reused ? 'Reused your previous draft for the same input.' : '',
          payload.truncated ? 'Source was long, so the first 20,000 characters were used.' : '',
          payload.rejected?.length
            ? `${payload.rejected.length} candidate${payload.rejected.length === 1 ? '' : 's'} failed validation and were dropped.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      )
    } catch {
      setError('Generation failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const accept = async () => {
    if (!draft) return
    if (selected.length === 0) {
      setError('Select at least one question to keep.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await acceptAiDraft({
        jobId: draft.jobId,
        indices: selected,
        title: title.trim() || topic || 'AI generated quiz',
      })
      if (!result.ok || !result.quiz_id) {
        setError(
          result.error === 'nothing_valid_selected'
            ? 'None of the selected questions passed validation.'
            : 'Could not save those questions.'
        )
        return
      }
      onDone(result.quiz_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those questions.')
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!draft) return
    await discardAiDraft(draft.jobId).catch(() => null)
    setDraft(null)
    setSelected([])
    setNotice('Draft discarded. Nothing was added to your bank.')
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Draft questions with AI</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        Generated questions are only suggestions. Nothing is saved to your bank until you review and accept it below,
        and it lands in a draft quiz.
      </p>

      {!draft && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div>
              <label style={label} htmlFor="ai-source">
                Source
              </label>
              <select
                id="ai-source"
                style={input}
                value={sourceKind}
                onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}
              >
                <option value="topic">Just a topic</option>
                <option value="text">Pasted notes</option>
                <option value="pdf">PDF</option>
                <option value="image">Photo of notes</option>
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ai-subject">
                Subject
              </label>
              <input
                id="ai-subject"
                style={input}
                value={subject}
                maxLength={60}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div>
              <label style={label} htmlFor="ai-count">
                Questions
              </label>
              <input
                id="ai-count"
                style={input}
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </div>
            <div>
              <label style={label} htmlFor="ai-difficulty">
                Difficulty
              </label>
              <select
                id="ai-difficulty"
                style={input}
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label style={label} htmlFor="ai-topic">
              Topic
            </label>
            <input
              id="ai-topic"
              style={input}
              value={topic}
              maxLength={300}
              placeholder="Dijkstra's algorithm and shortest paths"
              onChange={(event) => setTopic(event.target.value)}
            />
          </div>

          {(sourceKind === 'text' || sourceKind === 'topic') && (
            <div>
              <label style={label} htmlFor="ai-text">
                Source material (optional)
              </label>
              <textarea
                id="ai-text"
                style={{ ...input, minHeight: 120, resize: 'vertical' }}
                value={text}
                maxLength={20000}
                placeholder="Paste lecture notes, a chapter summary, or leave empty to generate from the topic alone."
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}

          {(sourceKind === 'pdf' || sourceKind === 'image') && (
            <div>
              <label style={label} htmlFor="ai-file">
                {sourceKind === 'pdf' ? 'PDF file' : 'Image of your notes'}
              </label>
              <input
                id="ai-file"
                style={input}
                type="file"
                accept={sourceKind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg'}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div>
            <label style={label} htmlFor="ai-instructions">
              Extra requirements (optional)
            </label>
            <input
              id="ai-instructions"
              style={input}
              value={instructions}
              maxLength={500}
              placeholder="Focus on time complexity, avoid definitions"
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primary} onClick={generate} disabled={busy}>
              {busy ? 'Generating…' : 'Generate draft'}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          {notice}
        </p>
      )}

      {draft && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>
              Review {draft.questions.length} generated question
              {draft.questions.length === 1 ? '' : 's'}
            </strong>
            <button style={{ ...ghost, padding: '5px 10px', fontSize: 12 }} onClick={discard}>
              Discard all
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
            {draft.questions.map((question, index) => {
              const checked = selected.includes(index)
              return (
                <article
                  key={`${draft.jobId}-${index}`}
                  style={{
                    border: `1px solid ${checked ? 'var(--brand, #2563eb)' : 'var(--border, #e5e7eb)'}`,
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelected((prev) =>
                          event.target.checked ? [...prev, index] : prev.filter((i) => i !== index)
                        )
                      }
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{question.question}</span>
                  </label>

                  <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 3 }}>
                    {question.options.map((option) => (
                      <li
                        key={option.text}
                        style={{
                          fontSize: 13,
                          color: option.is_correct ? '#047857' : 'inherit',
                          fontWeight: option.is_correct ? 650 : 400,
                        }}
                      >
                        {option.text}
                        {option.is_correct ? ' ✓' : ''}
                      </li>
                    ))}
                  </ol>

                  {question.explanation && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{question.explanation}</p>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {question.type.replace('_', ' ')} · {question.difficulty} · {question.marks} pts ·{' '}
                    {question.time_limit_seconds}s
                  </span>
                </article>
              )
            })}
          </div>

          {draft.rejected.length > 0 && (
            <details style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <summary>{draft.rejected.length} candidates were dropped by validation</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {draft.rejected.slice(0, 20).map((row) => (
                  <li key={`${row.index}-${row.reason}`}>
                    #{row.index + 1}: {row.reason.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div>
            <label style={label} htmlFor="ai-title">
              Quiz title
            </label>
            <input
              id="ai-title"
              style={input}
              value={title}
              maxLength={140}
              placeholder={topic || 'AI generated quiz'}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={primary} onClick={accept} disabled={busy || selected.length === 0}>
              {busy ? 'Saving…' : `Keep ${selected.length} and create quiz`}
            </button>
            <button
              style={ghost}
              onClick={() => {
                setDraft(null)
                setSelected([])
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        </>
      )}
    </section>
  )
}
