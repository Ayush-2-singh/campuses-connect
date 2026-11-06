'use client'

import AddToQuizButton from '@/components/quizzes/AddToQuizButton'

/**
 * QUESTION BANK — the authoring surface behind every Live Battle.
 *
 * Two ways in, both ending in the same `question_bank` rows:
 *   • the manual editor (create / edit / delete, single / multiple / true-false);
 *   • a CSV or JSON file that is parsed, validated and PREVIEWED before a single
 *     row is written — nothing is auto-published, and a bad row is shown with
 *     the spreadsheet line that caused it.
 *
 * Writes go through the browser client on purpose: the RLS policies on
 * `question_bank` / `question_bank_options` already limit every row to its
 * creator (or a platform admin), so the database is the gate, not this form.
 * Files never leave the page — parsing is local, so no upload bucket, no
 * cleanup job and no storage cost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import {
  CSV_TEMPLATE,
  DIFFICULTIES,
  JSON_TEMPLATE,
  QUESTION_TYPES,
  parseImportFile,
  toBankRows,
  validRows,
  validateDraft,
  type Difficulty,
  type DraftOption,
  type DraftQuestion,
  type ImportPreview,
  type QuestionType,
} from '@/lib/liveBattle/questionImport'

type BankOption = { id: string; position: number; option_text: string; is_correct: boolean }
type BankQuestion = {
  id: string
  subject: string
  topic: string | null
  difficulty: string
  question_type: string
  question_text: string
  explanation: string | null
  image_url: string | null
  tags: string[] | null
  marks: number
  time_limit_seconds: number
  created_at: string
  question_bank_options: BankOption[] | null
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single answer',
  multiple: 'Multiple answers',
  true_false: 'True / False',
}

const DIFF_TONE: Record<string, string> = {
  easy: 'hc-tag--success',
  medium: 'hc-tag--warn',
  hard: 'hc-tag--danger',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 4,
}

const emptyOption = (text = '', correct = false): DraftOption => ({ text, correct })

function blankDraft(): DraftQuestion {
  return {
    question: '',
    options: [emptyOption('', true), emptyOption(''), emptyOption(''), emptyOption('')],
    explanation: '',
    difficulty: 'medium',
    subject: 'General',
    topic: null,
    tags: [],
    marks: 100,
    timeLimit: 20,
    type: 'single',
    imageUrl: null,
  }
}

function toDraft(q: BankQuestion): DraftQuestion {
  const options = [...(q.question_bank_options ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ text: o.option_text, correct: o.is_correct }))
  return {
    question: q.question_text,
    options: options.length ? options : blankDraft().options,
    explanation: q.explanation ?? '',
    difficulty: (DIFFICULTIES as string[]).includes(q.difficulty) ? (q.difficulty as Difficulty) : 'medium',
    subject: q.subject || 'General',
    topic: q.topic,
    tags: q.tags ?? [],
    marks: q.marks,
    timeLimit: q.time_limit_seconds,
    type: (QUESTION_TYPES as string[]).includes(q.question_type) ? (q.question_type as QuestionType) : 'single',
    imageUrl: q.image_url,
  }
}

function download(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function QuestionBank({ user }: { user: any; profile?: any }) {
  const supabase = createClient()
  const router = useRouter()

  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DraftQuestion>(blankDraft)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('question_bank')
      .select(
        'id, subject, topic, difficulty, question_type, question_text, explanation, image_url, tags, marks, time_limit_seconds, created_at, question_bank_options(id, position, option_text, is_correct)'
      )
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) setError('Could not load your question bank.')
    setQuestions(
      ((data ?? []) as BankQuestion[]).map((q) => ({ ...q, question_bank_options: q.question_bank_options ?? [] }))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject).filter(Boolean))].sort(), [questions])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return questions.filter((q) => {
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false
      if (!term) return true
      const haystack = [q.question_text, q.subject, q.topic ?? '', ...(q.tags ?? [])].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [questions, search, difficulty])

  const counts = useMemo(
    () => ({
      total: questions.length,
      easy: questions.filter((q) => q.difficulty === 'easy').length,
      medium: questions.filter((q) => q.difficulty === 'medium').length,
      hard: questions.filter((q) => q.difficulty === 'hard').length,
    }),
    [questions]
  )

  // ── manual editor ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    setForm(blankDraft())
    setFormError('')
    setEditorOpen(true)
  }

  const openEdit = (q: BankQuestion) => {
    setEditingId(q.id)
    setForm(toDraft(q))
    setFormError('')
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingId(null)
    setFormError('')
  }

  const changeType = (type: QuestionType) => {
    setForm((f) => {
      if (type === 'true_false') {
        return { ...f, type, options: [emptyOption('True', true), emptyOption('False', false)] }
      }
      if (f.type === 'true_false') {
        return { ...f, type, options: [emptyOption('', true), emptyOption(''), emptyOption(''), emptyOption('')] }
      }
      if (type === 'single') {
        // Exactly one answer survives the switch.
        const firstCorrect = Math.max(
          0,
          f.options.findIndex((o) => o.correct)
        )
        return { ...f, type, options: f.options.map((o, i) => ({ ...o, correct: i === firstCorrect })) }
      }
      return { ...f, type }
    })
  }

  const toggleCorrect = (index: number) => {
    setForm((f) => {
      const single = f.type === 'single' || f.type === 'true_false'
      return {
        ...f,
        options: f.options.map((o, i) =>
          i === index ? { ...o, correct: single ? true : !o.correct } : { ...o, correct: single ? false : o.correct }
        ),
      }
    })
  }

  const setOptionText = (index: number, text: string) => {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, text } : o)) }))
  }

  const addOption = () => {
    setForm((f) => (f.options.length >= 4 ? f : { ...f, options: [...f.options, emptyOption('')] }))
  }

  const removeOption = (index: number) => {
    setForm((f) => (f.options.length <= 2 ? f : { ...f, options: f.options.filter((_, i) => i !== index) }))
  }

  const save = async () => {
    const cleaned: DraftQuestion = {
      ...form,
      question: form.question.trim(),
      options: form.options.filter((o) => o.text.trim().length > 0).map((o) => ({ ...o, text: o.text.trim() })),
      subject: form.subject.trim() || 'General',
    }
    const problems = validateDraft(cleaned)
    if (problems.length) {
      setFormError(problems.join(' · '))
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const payload = toBankRows(cleaned, user.id)

      if (editingId) {
        const { error: updErr } = await supabase.from('question_bank').update(payload.question).eq('id', editingId)
        if (updErr) throw updErr
        const { error: delErr } = await supabase.from('question_bank_options').delete().eq('question_id', editingId)
        if (delErr) throw delErr
        const { error: insErr } = await supabase
          .from('question_bank_options')
          .insert(payload.options.map((o) => ({ ...o, question_id: editingId })))
        if (insErr) throw insErr
        setNotice('Question updated.')
      } else {
        const { data, error: insErr } = await supabase
          .from('question_bank')
          .insert(payload.question)
          .select('id')
          .single()
        if (insErr) throw insErr
        const { error: optErr } = await supabase
          .from('question_bank_options')
          .insert(payload.options.map((o) => ({ ...o, question_id: data.id })))
        if (optErr) throw optErr
        setNotice('Question added to your bank.')
      }

      closeEditor()
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Could not save this question.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (q: BankQuestion) => {
    if (!window.confirm('Delete this question? Competitions already created keep their own copy.')) return
    const { error: err } = await supabase.from('question_bank').delete().eq('id', q.id)
    if (err) {
      setError('Could not delete that question.')
      return
    }
    setNotice('Question deleted.')
    setQuestions((prev) => prev.filter((x) => x.id !== q.id))
  }

  // ── import ──────────────────────────────────────────────────────────────
  const onFile = async (file: File | null) => {
    if (!file) return
    setError('')
    setNotice('')
    setFileName(file.name)
    if (file.size > 2 * 1024 * 1024) {
      setPreview({ rows: [], fileError: 'That file is larger than 2 MB. Split it into smaller files.' })
      return
    }
    const text = await file.text()
    setPreview(parseImportFile(file.name, text))
  }

  const runImport = async () => {
    if (!preview) return
    const rows = validRows(preview)
    if (rows.length === 0) return
    setImporting(true)
    setError('')
    try {
      const CHUNK = 20
      let saved = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const payloads = chunk.map((r) => toBankRows(r.draft, user.id))
        const { data, error: insErr } = await supabase
          .from('question_bank')
          .insert(payloads.map((p) => p.question))
          .select('id')
        if (insErr) throw insErr
        const ids = (data ?? []).map((d: { id: string }) => d.id)
        if (ids.length !== chunk.length) {
          throw new Error('The import stopped early — check your bank before running it again.')
        }
        const optionRows = payloads.flatMap((p, idx) => p.options.map((o) => ({ ...o, question_id: ids[idx] })))
        const { error: optErr } = await supabase.from('question_bank_options').insert(optionRows)
        if (optErr) throw optErr
        saved += ids.length
      }
      setNotice(`${saved} question${saved === 1 ? '' : 's'} imported.`)
      setPreview(null)
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err: any) {
      setError(err?.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const previewValid = preview ? validRows(preview).length : 0
  const previewInvalid = preview ? preview.rows.length - previewValid : 0

  return (
    <div className="hc-page">
      <div className="hc-page-head hc-reveal">
        <button className="hc-back" onClick={() => router.push('/compete')} aria-label="Back to Compete">
          <Icon name="chevron" size={16} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span className="hc-eyebrow">Compete · Live Battle</span>
        <h1 className="hc-h1">
          Your question bank, <em className="hc-em">ready to fire.</em>
        </h1>
        <p className="hc-lede">
          Write questions once, reuse them in any live room. A competition keeps its own copy, so editing the bank never
          changes a result that has already been declared.
        </p>
      </div>

      {/* Actions */}
      <div className="hc-reveal" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="hc-btn hc-btn--primary" type="button" onClick={openCreate}>
          <Icon name="plus" size={14} /> New question
        </button>
        <button className="hc-btn" type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="notebook" size={14} /> Import CSV / JSON
        </button>
        <button
          className="hc-btn"
          type="button"
          onClick={() => download('live-battle-questions.csv', CSV_TEMPLATE, 'text/csv')}
        >
          <Icon name="copy" size={14} /> CSV template
        </button>
        <button
          className="hc-btn"
          type="button"
          onClick={() => download('live-battle-questions.json', JSON_TEMPLATE, 'application/json')}
        >
          <Icon name="copy" size={14} /> JSON template
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
      </div>

      {notice && (
        <p className="hc-note hc-reveal" style={{ marginBottom: 14 }} role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="hc-alert" role="alert">
          {error}
        </div>
      )}

      {/* Import preview */}
      {preview && (
        <section className="hc-card hc-reveal" style={{ marginBottom: 16 }} aria-label="Import preview">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="notebook" size={16} />
            <strong style={{ fontSize: 14 }}>{fileName}</strong>
            <span className="hc-spacer" />
            <span className="hc-tag hc-tag--success">{previewValid} ready</span>
            {previewInvalid > 0 && <span className="hc-tag hc-tag--danger">{previewInvalid} need fixing</span>}
          </div>

          {preview.fileError ? (
            <p className="hc-alert" style={{ margin: '10px 0 0' }}>
              {preview.fileError}
            </p>
          ) : (
            <>
              <div className="hc-grid hc-grid--list" style={{ gap: 6, marginTop: 10 }}>
                {preview.rows.slice(0, 50).map((row) => (
                  <div
                    key={row.row}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '8px 10px',
                      background: row.errors.length ? 'var(--danger-light)' : 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)' }}>#{row.row}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>
                        {row.draft.question || '(no question text)'}
                      </span>
                      <Icon name={row.errors.length ? 'alert' : 'check'} size={13} />
                    </div>
                    {row.errors.length > 0 && (
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--danger-text)' }}>
                        {row.errors.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {preview.rows.length > 50 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                  Showing the first 50 of {preview.rows.length} rows — all valid rows are imported.
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  className="hc-btn hc-btn--primary"
                  type="button"
                  onClick={runImport}
                  disabled={importing || previewValid === 0}
                >
                  <Icon name="check" size={14} />
                  {importing ? 'Importing…' : `Import ${previewValid} valid question${previewValid === 1 ? '' : 's'}`}
                </button>
                <button
                  className="hc-btn"
                  type="button"
                  onClick={() => {
                    setPreview(null)
                    setFileName('')
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                >
                  Cancel
                </button>
              </div>
              {previewInvalid > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                  Rows with errors are skipped — fix them in your file and import again.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Manual editor */}
      {editorOpen && (
        <section className="hc-form hc-reveal" aria-label={editingId ? 'Edit question' : 'New question'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="hc-form-title" style={{ margin: 0 }}>
              {editingId ? 'Edit question' : 'New question'}
            </h2>
            <span className="hc-spacer" />
            <button className="hc-btn" type="button" onClick={closeEditor}>
              <Icon name="x" size={13} /> Close
            </button>
          </div>

          {formError && (
            <p className="hc-alert" style={{ margin: 0 }} role="alert">
              {formError}
            </p>
          )}

          <label>
            <span style={labelStyle}>Question</span>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              placeholder="What does this question ask?"
              rows={3}
            />
          </label>

          <div className="hc-form-row">
            <label>
              <span style={labelStyle}>Type</span>
              <select value={form.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Difficulty</span>
              <select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span style={labelStyle}>
              Options · tap the circle to mark the correct {form.type === 'multiple' ? 'answers' : 'answer'}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.options.map((option, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="hc-chip"
                    role={form.type === 'multiple' ? 'checkbox' : 'radio'}
                    aria-checked={option.correct}
                    aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`}
                    onClick={() => toggleCorrect(index)}
                    style={{
                      minWidth: 38,
                      justifyContent: 'center',
                      background: option.correct ? 'var(--accent)' : 'var(--bg)',
                      color: option.correct ? 'var(--on-accent)' : 'var(--text-muted)',
                      borderColor: option.correct ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <Icon name={option.correct ? 'check' : 'circle'} size={13} />
                  </button>
                  <input
                    value={option.text}
                    onChange={(e) => setOptionText(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  />
                  {form.options.length > 2 && (
                    <button
                      type="button"
                      className="hc-chip"
                      onClick={() => removeOption(index)}
                      aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.options.length < 4 && (
              <button className="hc-chip" type="button" onClick={addOption} style={{ marginTop: 8 }}>
                <Icon name="plus" size={12} /> Add option
              </button>
            )}
          </div>

          <label>
            <span style={labelStyle}>Explanation (shown after the answer window)</span>
            <textarea
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              rows={2}
              placeholder="Why is this the answer?"
            />
          </label>

          <div className="hc-form-row">
            <label>
              <span style={labelStyle}>Subject</span>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="DSA"
                list="live-battle-subjects"
              />
              <datalist id="live-battle-subjects">
                {subjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              <span style={labelStyle}>Topic</span>
              <input
                value={form.topic ?? ''}
                onChange={(e) => setForm({ ...form, topic: e.target.value || null })}
                placeholder="Graphs"
              />
            </label>
          </div>

          <div className="hc-form-row">
            <label>
              <span style={labelStyle}>Marks</span>
              <input
                type="number"
                value={form.marks}
                min={1}
                max={1000}
                onChange={(e) => setForm({ ...form, marks: Number(e.target.value) })}
              />
            </label>
            <label>
              <span style={labelStyle}>Time limit (seconds)</span>
              <input
                type="number"
                value={form.timeLimit}
                min={5}
                max={300}
                onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="hc-form-row">
            <label>
              <span style={labelStyle}>Tags (comma separated)</span>
              <input
                value={form.tags.join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="graphs, bfs"
              />
            </label>
            <label>
              <span style={labelStyle}>Image URL (optional)</span>
              <input
                value={form.imageUrl ?? ''}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })}
                placeholder="https://…"
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="hc-btn hc-btn--primary" type="button" onClick={save} disabled={saving}>
              <Icon name="check" size={14} /> {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add question'}
            </button>
            <button className="hc-btn" type="button" onClick={closeEditor}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Bank */}
      <div
        className="hc-reveal"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '18px 0 10px' }}
      >
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} aria-hidden="true">
            <Icon name="search" size={14} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, subjects, tags…"
            aria-label="Search the question bank"
            style={{
              width: '100%',
              padding: '9px 12px 9px 32px',
              fontSize: 13,
              fontFamily: 'inherit',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        {(['all', ...DIFFICULTIES] as const).map((d) => (
          <button
            key={d}
            type="button"
            className="hc-chip"
            aria-pressed={difficulty === d}
            onClick={() => setDifficulty(d as 'all' | Difficulty)}
            style={{
              background: difficulty === d ? 'var(--accent)' : 'var(--bg)',
              color: difficulty === d ? 'var(--on-accent)' : 'var(--text-secondary)',
              borderColor: difficulty === d ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {d === 'all' ? 'All' : d}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        {counts.total} in the bank · easy {counts.easy} · medium {counts.medium} · hard {counts.hard}
      </p>

      {loading ? (
        <div className="hc-grid hc-grid--list" style={{ gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 84, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="hc-empty">
          <div className="hc-empty-ic">
            <Icon name={questions.length ? 'search' : 'notebook'} size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">{questions.length ? 'No question matches that filter' : 'Your bank is empty'}</p>
          <p className="hc-empty-s">
            {questions.length
              ? 'Try a different search term or difficulty.'
              : 'Add one by hand, or import a CSV/JSON file to get a whole set in at once.'}
          </p>
          {!questions.length && (
            <button className="hc-btn hc-btn--primary" type="button" onClick={openCreate}>
              <Icon name="plus" size={13} /> New question
            </button>
          )}
        </div>
      ) : (
        <div className="hc-grid hc-grid--list" style={{ gap: 8 }}>
          {filtered.map((q) => {
            const options = [...(q.question_bank_options ?? [])].sort((a, b) => a.position - b.position)
            return (
              <article key={q.id} className="hc-card">
                <div className="hc-card-head-row">
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      fontWeight: 650,
                      color: 'var(--text-primary)',
                      flex: '1 1 220px',
                      minWidth: 0,
                    }}
                  >
                    {q.question_text}
                  </p>
                  <div className="hc-tags">
                    <span className={`hc-tag ${DIFF_TONE[q.difficulty] ?? ''}`}>{q.difficulty}</span>
                    <span className="hc-tag hc-tag--ghost">
                      {TYPE_LABEL[(q.question_type as QuestionType) ?? 'single']}
                    </span>
                    <span className="hc-tag">
                      <Icon name="star" size={10} /> {q.marks}
                    </span>
                    <span className="hc-tag">
                      <Icon name="clock" size={10} /> {q.time_limit_seconds}s
                    </span>
                  </div>
                </div>

                <ul
                  style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  {options.map((o, i) => (
                    <li
                      key={o.id}
                      style={{
                        display: 'flex',
                        gap: 7,
                        alignItems: 'baseline',
                        fontSize: 12.5,
                        color: o.is_correct ? 'var(--success-text)' : 'var(--text-secondary)',
                        fontWeight: o.is_correct ? 650 : 400,
                      }}
                    >
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', minWidth: 12 }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{o.option_text}</span>
                      {o.is_correct && <Icon name="check" size={11} />}
                    </li>
                  ))}
                </ul>

                <div className="hc-foot">
                  <span className="hc-meta">{q.subject}</span>
                  {q.topic && <span className="hc-meta">· {q.topic}</span>}
                  {(q.tags ?? []).slice(0, 3).map((t) => (
                    <span key={t} className="hc-tag hc-tag--ghost">
                      #{t}
                    </span>
                  ))}
                  <span className="hc-spacer" />
                  <AddToQuizButton questionId={q.id} />
                  <button className="hc-chip" type="button" onClick={() => openEdit(q)} aria-label="Edit question">
                    <Icon name="pencil" size={12} /> Edit
                  </button>
                  <button className="hc-chip" type="button" onClick={() => remove(q)} aria-label="Delete question">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16, textAlign: 'center' }}>
        Showing the latest {Math.min(questions.length, 200)} questions. A live room copies the ones you pick, so later
        edits never rewrite a finished competition.
      </p>
    </div>
  )
}
