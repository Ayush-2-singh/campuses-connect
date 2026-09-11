'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ChallengeTab — Daily DSA challenge + code editor + problem list
// Extracted from compete/page.tsx for maintainability
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { Problem, Submission } from './types'

const CodeEditor = dynamic(() => import('@/components/games/CodeEditor'), { ssr: false })

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
}) {
  const [diffFilter, setDiffFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')

  const filteredProblems = diffFilter === 'all' ? problems : problems.filter(p => p.difficulty === diffFilter)
  const solvedCount = problems.filter(p => solved[p.id]).length

  const changeLang = (l: string) => {
    setLang(l)
    if (daily) setCode(daily.starter_code?.[l] || '')
  }

  if (!daily) {
    return (
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 28, margin: '0 0 8px' }}>🧩</p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          No challenge scheduled for today yet — check back soon.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Problem card */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '18px 20px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {daily.title}
          </h3>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'var(--accent-light)', color: diffColor[daily.difficulty],
          }}>
            {daily.difficulty}
          </span>
          {solved[daily.id] && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: 'var(--success-light)', color: 'var(--success-text)',
            }}>
              ✓ Solved
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
          {daily.description}
        </p>
        {(daily.topics || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {daily.topics.map((t) => (
              <span key={t} style={{
                fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-tertiary)',
                padding: '3px 9px', borderRadius: 20,
              }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Code Editor — CodeMirror with syntax highlighting */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Language tabs + Submit */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          {LANGUAGES.map((l) => (
            <button key={l.key} onClick={() => changeLang(l.key)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              border: lang === l.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
              background: lang === l.key ? 'var(--accent-light)' : 'var(--bg)',
              color: lang === l.key ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}>
              {l.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onSubmit} disabled={running || !code.trim()} style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', border: 'none',
            background: running || !code.trim() ? 'var(--disabled)' : 'var(--accent)',
            color: running || !code.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
          }}>
            {running ? 'Judging…' : '▶ Submit'}
          </button>
        </div>

        {/* CodeMirror Editor */}
        <CodeEditor value={code} onChange={(v) => { setCode(v) }} language={lang} />

        {error && (
          <div style={{
            padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)',
            background: 'var(--danger-light)', borderTop: '1px solid var(--danger-border)',
          }}>
            {error}
          </div>
        )}
        {result && (
          <div style={{
            padding: '12px 14px', borderTop: '1px solid var(--border)', fontSize: 13,
            background: result.verdict === 'accepted' ? 'var(--success-light)' : 'var(--bg-tertiary)',
          }}>
            {result.verdict === 'accepted' ? (
              <p style={{ margin: 0, color: 'var(--success-text)', fontWeight: 700 }}>
                ✅ Accepted — {result.passed}/{result.total} hidden cases passed
                {result.runtime_ms ? ` · ${result.runtime_ms}ms` : ''} · karma awarded
              </p>
            ) : (
              <p style={{ margin: 0, color: result.verdict === 'time_limit' ? 'var(--warning-text)' : 'var(--danger)' }}>
                {result.verdict === 'wrong_answer'
                  ? `❌ Wrong answer on a hidden case: ${result.first_fail_input || ''}`
                  : result.verdict === 'time_limit'
                    ? '⏱ Time limit exceeded'
                    : result.verdict === 'compile_error'
                      ? '⚠️ Compile error'
                      : '💥 Runtime error'}{' '}
                — {result.passed}/{result.total} passed
              </p>
            )}
          </div>
        )}
      </div>

      {/* Problem list with difficulty filter */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            All problems ({solvedCount}/{problems.length} solved)
          </p>
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Difficulty filter">
            {DIFFICULTY_FILTERS.map((d) => (
              <button key={d} onClick={() => setDiffFilter(d)} style={{
                padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                border: diffFilter === d ? 'none' : '1px solid var(--border)',
                background: diffFilter === d ? 'var(--accent)' : 'var(--bg)',
                color: diffFilter === d ? 'var(--on-accent)' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}>
                {d === 'all' ? '🌐 All' : d === 'easy' ? '🟢 Easy' : d === 'medium' ? '🟠 Medium' : '🔴 Hard'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredProblems.map((p) => (
            <button key={p.id} onClick={() => onSelectProblem(p)} style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {solved[p.id] ? '✅' : p.difficulty === 'easy' ? '🟢' : p.difficulty === 'medium' ? '🟠' : '🔴'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{p.title}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>{p.difficulty}</p>
              </div>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                {solved[p.id] ? 'Solved' : 'Solve →'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
