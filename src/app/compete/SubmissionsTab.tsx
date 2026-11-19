'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SubmissionsTab — the user's own attempts for the selected problem.
//
// Runs are not recorded (they never touch the judge's hidden cases), so this
// list only contains Submit attempts. RLS on dsa_submissions already limits
// reads to the signed-in user; the explicit user_id filter keeps the query
// honest even if a policy is ever widened.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Row = {
  id: string
  verdict: string
  language: string
  passed: number
  total: number
  runtime_ms: number | null
  created_at: string
  code: string | null
}

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  accepted: { label: 'Accepted', color: 'var(--success-text)', bg: 'var(--success-light)' },
  wrong_answer: { label: 'Wrong Answer', color: 'var(--danger)', bg: 'var(--danger-light)' },
  time_limit: { label: 'Time Limit', color: 'var(--warning-text)', bg: 'var(--bg-tertiary)' },
  runtime_error: { label: 'Runtime Error', color: 'var(--danger)', bg: 'var(--danger-light)' },
  compile_error: { label: 'Compile Error', color: 'var(--danger)', bg: 'var(--danger-light)' },
}

const LANG_LABEL: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  cpp: 'C++',
  java: 'Java',
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export default function SubmissionsTab({
  problemId,
  userId,
  refreshKey,
  onLoad,
}: {
  problemId: string
  userId: string | null
  refreshKey: number
  onLoad: (code: string, language: string) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!userId) {
        setRows([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from('dsa_submissions')
        .select('id, verdict, language, passed, total, runtime_ms, created_at, code')
        .eq('problem_id', problemId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (cancelled) return
      if (queryError) setError('Could not load your submissions right now.')
      else setRows((data as Row[]) || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [problemId, userId, refreshKey])

  if (loading) {
    return <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Loading your submissions…</p>
  }

  if (error) {
    return <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: 0 }}>{error}</p>
  }

  if (!userId) {
    return (
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--bg-secondary, var(--bg-tertiary))',
          padding: '12px 14px',
        }}
      >
        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Sign in to see your attempts
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '5px 0 10px', lineHeight: 1.6 }}>
          Submissions are saved to your account, so you can come back to an attempt and load its code into the editor.
        </p>
        <Link
          href="/auth/login?redirect=%2Fcompete"
          style={{
            display: 'inline-block',
            fontSize: 11.5,
            fontWeight: 700,
            padding: '5px 12px',
            borderRadius: 8,
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: '18px 0' }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
          No submissions for this problem yet.
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.6 }}>
          Run only checks the public examples and is not recorded. Hit Submit to appear here.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '0 0 2px',
        }}
      >
        Last {rows.length} attempt{rows.length === 1 ? '' : 's'}
      </p>

      {rows.map((row) => {
        const meta = VERDICT[row.verdict] || VERDICT.runtime_error
        const expanded = expandedId === row.id
        const loaded = loadedId === row.id

        return (
          <div
            key={row.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--bg)',
              padding: '9px 11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: meta.color,
                  background: meta.bg,
                  borderRadius: 12,
                  padding: '2px 8px',
                }}
              >
                {meta.label}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                {LANG_LABEL[row.language] || row.language}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title="Hidden test cases passed">
                {row.passed}/{row.total} hidden case{row.total === 1 ? '' : 's'} passed
                {row.runtime_ms ? ` · ${row.runtime_ms} ms` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {new Date(row.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : row.id)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {expanded ? 'Hide code' : 'View code'}
              </button>
              <button
                type="button"
                disabled={!row.code}
                onClick={() => {
                  if (!row.code) return
                  onLoad(row.code, row.language)
                  setLoadedId(row.id)
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 7,
                  border: '1px solid var(--accent-border)',
                  background: loaded ? 'var(--success-light)' : 'var(--accent-light)',
                  color: loaded ? 'var(--success-text)' : 'var(--accent-text)',
                  cursor: row.code ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  opacity: row.code ? 1 : 0.55,
                }}
              >
                {loaded ? 'Loaded' : 'Load code'}
              </button>
              {!row.code && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>code expired</span>}
            </div>

            {expanded && row.code && (
              <pre
                style={{
                  margin: '8px 0 0',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                  lineHeight: 1.55,
                  fontFamily: mono,
                  color: 'var(--text-secondary)',
                  maxHeight: 220,
                  overflow: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {row.code}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
