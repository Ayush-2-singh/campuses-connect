'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ChallengeTab — the solve workspace: statement + examples on the left,
// editor + verdict panel on the right, with a draggable divider on desktop
// and a single stacked column on phones.
//
// Run executes against the PUBLIC examples and shows input/expected/actual.
// Submit is the only path that touches hidden cases and awards karma.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CSSProperties } from 'react'
import type { Problem, RunResult, Submission } from './types'
import ResultPanel from './ResultPanel'
import SubmissionsTab from './SubmissionsTab'

const CodeEditor = dynamic(() => import('@/components/games/CodeEditor'), { ssr: false })
const TopAskedPanel = dynamic(() => import('./TopAskedPanel'))

const LANGUAGES = [
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'cpp', label: 'C++' },
  { key: 'java', label: 'Java' },
]

const DIFFICULTY_FILTERS = ['all', 'easy', 'medium', 'hard'] as const

const diffColor: Record<string, string> = {
  easy: 'var(--success-text)',
  medium: 'var(--warning-text)',
  hard: 'var(--danger)',
}

/** Difficulty dot — a small SVG circle, consistent in dark + light mode. */
const DiffDot = ({ d }: { d: string }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: diffColor[d] || 'var(--text-muted)',
      flexShrink: 0,
    }}
  />
)

/**
 * Statement text: newlines preserved, `backticked` spans rendered as inline
 * code — the way LeetCode statements name their parameters.
 */
function StatementText({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code
            key={i}
            style={{
              fontFamily: mono,
              fontSize: '0.9em',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  )
}

/** Small SVG checkmark used in the accepted-verdict line (replaces ✅ emoji). */
const CheckGlyph = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ verticalAlign: '-2px' }}
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Example with copyable input, like the statement blocks people know. */
function ExampleBlock({
  n,
  example,
}: {
  n: number
  example: { input: string; output: string; input_display?: string; explanation?: string }
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example.input)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked — the input is still selectable */
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Example {n}</p>
        <button
          type="button"
          onClick={copy}
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {copied ? 'Copied' : 'Copy input'}
        </button>
      </div>

      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '8px 0 4px',
        }}
      >
        Input
      </p>
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          fontSize: 11.5,
          lineHeight: 1.55,
          fontFamily: mono,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {example.input_display ?? example.input}
      </pre>

      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '8px 0 4px',
        }}
      >
        Output
      </p>
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          fontSize: 11.5,
          lineHeight: 1.55,
          fontFamily: mono,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {example.output}
      </pre>

      {example.explanation && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 0' }}>
          {example.explanation}
        </p>
      )}
    </div>
  )
}

export default function ChallengeTab({
  daily,
  problems,
  solved,
  lang,
  setLang,
  code,
  setCode,
  running,
  result,
  error,
  onSubmit,
  onSelectProblem,
  runResult,
  runError,
  runningRun,
  onRun,
  lastAction,
  userId,
  onLoadSubmission,
  submissionNonce,
  submissionCount,
  onClearDraft,
}: {
  daily: Problem | null
  problems: Problem[]
  solved: Record<string, boolean>
  lang: string
  setLang: (l: string) => void
  code: string
  setCode: (c: string) => void
  running: boolean
  result: Submission | null
  error: string | null
  onSubmit: () => void
  onSelectProblem: (p: Problem) => void
  runResult: RunResult | null
  runError: string | null
  runningRun: boolean
  onRun: () => void
  lastAction: 'run' | 'submit' | null
  userId: string | null
  onLoadSubmission: (code: string, language: string) => void
  submissionNonce: number
  submissionCount: number
  onClearDraft: () => void
}) {
  const [diffFilter, setDiffFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')
  const [leftTab, setLeftTab] = useState<'description' | 'submissions'>('description')
  const [judgeOk, setJudgeOk] = useState<boolean | null>(null)
  const [leftPct, setLeftPct] = useState(46)
  const dragging = useRef(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const saved = Number(window.localStorage.getItem('cc.solve.split'))
    if (saved >= 30 && saved <= 65) setLeftPct(saved)
  }, [])

  // A dead runner must not look like a wrong answer. Probe on mount and keep
  // re-checking every 20s while it is down, so Run and Submit re-enable on
  // their own once the judge recovers instead of staying dead until reload.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const probe = async () => {
      try {
        const res = await fetch('/api/compete/judge/health', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        const up = Boolean(data?.ok)
        setJudgeOk(up)
        if (!up) timer = setTimeout(probe, 20000)
      } catch {
        if (cancelled) return
        setJudgeOk(false)
        timer = setTimeout(probe, 20000)
      }
    }

    probe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const commitSplit = (pct: number) => {
    const clamped = Math.min(65, Math.max(30, pct))
    setLeftPct(clamped)
    try {
      window.localStorage.setItem('cc.solve.split', String(Math.round(clamped)))
    } catch {}
  }

  const filteredProblems = diffFilter === 'all' ? problems : problems.filter((p) => p.difficulty === diffFilter)
  const solvedCount = problems.filter((p) => solved[p.id]).length

  // page.tsx owns the code: switching language loads that language's draft.
  const changeLang = (l: string) => {
    setLang(l)
  }

  // A dead runner must not look like a disabled feature with no explanation;
  // `busy` greys both actions and blocks the keyboard shortcut while the
  // health banner is up.
  const judgeDown = judgeOk === false
  const busy = running || runningRun || judgeDown

  if (!daily) {
    return (
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            marginBottom: 10,
          }}
          aria-hidden="true"
        >
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          </svg>
        </span>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          No challenge scheduled for today yet — check back soon.
        </p>
      </div>
    )
  }

  const shownVerdict = lastAction === 'run' ? runResult?.verdict : result?.verdict
  const panel =
    lastAction === 'run' && runResult ? (
      <ResultPanel
        kind="run"
        verdict={runResult.verdict}
        passed={runResult.passed}
        total={runResult.total}
        runtimeMs={runResult.runtime_ms}
        cases={runResult.cases}
      />
    ) : lastAction === 'submit' && result ? (
      <ResultPanel
        kind="submit"
        verdict={result.verdict}
        passed={result.passed}
        total={result.total}
        runtimeMs={result.runtime_ms}
        cases={result.cases}
        compileOutput={result.compile_output}
        stderr={result.stderr}
      />
    ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {judgeOk === false && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--warning-border)',
            background: 'var(--warning-light)',
            color: 'var(--warning-text)',
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 2 }} aria-hidden="true">
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 2 20h20L12 3Z" />
              <path d="M12 9v5M12 17h.01" />
            </svg>
          </span>
          <span>
            The code runner is unreachable right now. Run and Submit will fail until it is back — your draft is safe in
            the editor.
          </span>
        </div>
      )}

      {/* ── Split solve workspace ───────────────────────────────────────── */}
      <div ref={wrapRef} className="cc-solve" style={{ '--cc-left': `${leftPct}%` } as CSSProperties}>
        {/* Statement + examples */}
        <section
          className="cc-solve__statement"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            minWidth: 0,
          }}
        >
          <div
            role="tablist"
            aria-label="Problem panels"
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 14,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 8,
            }}
          >
            {(
              [
                ['description', 'Description'],
                ['submissions', 'Submissions'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={leftTab === key}
                aria-label={
                  key === 'submissions' && submissionCount > 0
                    ? `Submissions, ${submissionCount} attempt${submissionCount === 1 ? '' : 's'}`
                    : undefined
                }
                onClick={() => setLeftTab(key)}
                style={{
                  padding: '4px 11px',
                  borderRadius: 7,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: leftTab === key ? '1px solid var(--accent-border)' : '1px solid transparent',
                  background: leftTab === key ? 'var(--accent-light)' : 'transparent',
                  color: leftTab === key ? 'var(--accent-text)' : 'var(--text-muted)',
                }}
              >
                {label}
                {key === 'submissions' && submissionCount > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 800,
                      lineHeight: 1.5,
                      background: leftTab === key ? 'var(--bg)' : 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {submissionCount > 99 ? '99+' : submissionCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {leftTab === 'description' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {daily.title}
                </h3>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 20,
                    background: 'var(--bg-tertiary)',
                    color: diffColor[daily.difficulty],
                    textTransform: 'capitalize',
                  }}
                >
                  <DiffDot d={daily.difficulty} />
                  {daily.difficulty}
                </span>
                {solved[daily.id] && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: 'var(--success-light)',
                      color: 'var(--success-text)',
                    }}
                  >
                    <CheckGlyph size={11} /> Solved
                  </span>
                )}
              </div>

              <StatementText text={daily.description} />

              {(daily.examples || []).map((ex, i) => (
                <ExampleBlock key={i} n={i + 1} example={ex} />
              ))}

              {daily.constraints && (
                <>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '.04em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      margin: '16px 0 4px',
                    }}
                  >
                    Constraints
                  </p>
                  <pre
                    style={{
                      margin: 0,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      fontSize: 11.5,
                      lineHeight: 1.6,
                      fontFamily: mono,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {daily.constraints}
                  </pre>
                </>
              )}

              {(daily.topics || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                  {daily.topics.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-tertiary)',
                        padding: '3px 9px',
                        borderRadius: 20,
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <SubmissionsTab
              problemId={daily.id}
              userId={userId}
              refreshKey={submissionNonce}
              onLoad={onLoadSubmission}
            />
          )}
        </section>

        {/* Draggable divider (desktop only, hidden by CSS on phones) */}
        <div
          className="cc-solve__divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize statement and editor"
          aria-valuenow={Math.round(leftPct)}
          aria-valuemin={30}
          aria-valuemax={65}
          tabIndex={0}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !wrapRef.current) return
            const rect = wrapRef.current.getBoundingClientRect()
            commitSplit(((e.clientX - rect.left) / rect.width) * 100)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              commitSplit(leftPct - 3)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              commitSplit(leftPct + 3)
            }
          }}
        />

        {/* Editor + verdict */}
        <section
          className="cc-solve__work"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
          onKeyDownCapture={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.stopPropagation()
              if (busy) return
              if (e.shiftKey) onSubmit()
              else onRun()
            }
          }}
        >
          {/* Language tabs + actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                onClick={() => changeLang(l.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: lang === l.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  background: lang === l.key ? 'var(--accent-light)' : 'var(--bg)',
                  color: lang === l.key ? 'var(--accent-text)' : 'var(--text-secondary)',
                }}
              >
                {l.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={onClearDraft}
              title="Reset this language to the starter code"
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              Clear draft
            </button>
            <button
              onClick={onRun}
              disabled={busy || !code.trim()}
              title={judgeDown ? 'The code runner is unreachable right now' : undefined}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: busy || !code.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: busy || !code.trim() ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              {runningRun ? 'Running…' : 'Run'}
            </button>
            <button
              onClick={onSubmit}
              disabled={busy || !code.trim()}
              title={judgeDown ? 'The code runner is unreachable right now' : undefined}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: busy || !code.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                border: 'none',
                background: busy || !code.trim() ? 'var(--disabled)' : 'var(--accent)',
                color: busy || !code.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
              }}
            >
              {running ? 'Judging…' : 'Submit'}
            </button>
          </div>

          {/* Editor */}
          <CodeEditor
            value={code}
            onChange={(v) => {
              setCode(v)
            }}
            language={lang}
          />

          <p
            style={{
              margin: 0,
              padding: '6px 14px',
              fontSize: 10.5,
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border)',
            }}
          >
            Complete the function — the driver that reads the tests is hidden. ⌘/Ctrl + Enter to run · add Shift to
            submit
          </p>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 12.5,
                color: 'var(--danger)',
                background: 'var(--danger-light)',
                borderTop: '1px solid var(--danger-border)',
              }}
            >
              {error}
            </div>
          )}

          {runError && (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                borderTop: '1px solid var(--border)',
              }}
            >
              {runError}
            </div>
          )}

          {panel}

          {lastAction === 'run' && shownVerdict === 'passed' && runResult && runResult.passed === runResult.total && (
            <p
              style={{
                margin: 0,
                padding: '0 14px 12px',
                fontSize: 11.5,
                color: 'var(--text-muted)',
              }}
            >
              Examples are not graded — hit Submit to run the hidden cases.
            </p>
          )}
        </section>
      </div>

      {/* Problem list with difficulty filter */}
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            All problems ({solvedCount}/{problems.length} solved)
          </p>
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Difficulty filter">
            {DIFFICULTY_FILTERS.map((d) => (
              <button
                key={d}
                onClick={() => setDiffFilter(d)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 16,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: `1px solid ${diffFilter === d ? 'var(--accent)' : 'var(--border)'}`,
                  background: diffFilter === d ? 'var(--accent)' : 'var(--bg)',
                  color: diffFilter === d ? 'var(--on-accent)' : 'var(--text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredProblems.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectProblem(p)}
              className="cc-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span
                style={{ width: 20, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}
                aria-hidden="true"
              >
                {solved[p.id] ? (
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--success-text)"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <DiffDot d={p.difficulty} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{p.title}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>
                  {p.difficulty}
                </p>
              </div>
              <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 600, flexShrink: 0 }}>
                {solved[p.id] ? 'Solved' : 'Solve →'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Interview-frequency catalogue: in-house problems open here, the rest
          open on LeetCode. It sits below the list, so it is mounted only when
          the reader scrolls near it — the data is ~75 kB on its own. */}
      <LazyTopAsked problems={problems} onSelectProblem={onSelectProblem} />
    </div>
  )
}

function LazyTopAsked({ problems, onSelectProblem }: { problems: Problem[]; onSelectProblem: (p: Problem) => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = holder.current
    if (!el || show) return
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true)
          observer.disconnect()
        }
      },
      // Start downloading a screen before the reader gets there.
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [show])

  return (
    <div ref={holder}>
      {show ? (
        <TopAskedPanel problems={problems} onSelectProblem={onSelectProblem} />
      ) : (
        <p style={{ marginTop: 18, fontSize: 11.5, color: 'var(--text-muted)' }} aria-hidden="true">
          Loading the most-asked catalogue…
        </p>
      )}
    </div>
  )
}
