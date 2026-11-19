'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ResultPanel — the verdict surface shared by Run (public examples) and
// Submit (hidden cases). Modelled on the judge panels people expect:
//   • one headline verdict + count + runtime
//   • compiler output when compilation failed
//   • a row per test case
//   • input / your output / expected blocks, only for Run, where those
//     cases are public by definition
// Hidden cases deliberately render as pass/fail rows with no expected value.
// ═══════════════════════════════════════════════════════════════════════════

import type { CaseResult } from './types'

const VERDICT_META: Record<string, { label: string; color: string; bg: string }> = {
  accepted: { label: 'Accepted', color: 'var(--success-text)', bg: 'var(--success-light)' },
  passed: { label: 'All examples passed', color: 'var(--success-text)', bg: 'var(--success-light)' },
  wrong_answer: { label: 'Wrong Answer', color: 'var(--danger)', bg: 'var(--danger-light)' },
  time_limit: {
    label: 'Time Limit Exceeded',
    color: 'var(--warning-text)',
    bg: 'var(--warning-light, var(--bg-tertiary))',
  },
  runtime_error: { label: 'Runtime Error', color: 'var(--danger)', bg: 'var(--danger-light)' },
  compile_error: { label: 'Compile Error', color: 'var(--danger)', bg: 'var(--danger-light)' },
  internal_error: { label: 'Judge Unavailable', color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' },
}

const STATUS_LABEL: Record<string, string> = {
  passed: 'Passed',
  accepted: 'Passed',
  wrong_answer: 'Wrong',
  time_limit: 'Timeout',
  runtime_error: 'Runtime',
  compile_error: 'Compile',
  internal_error: 'Judge',
}

function Block({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '0 0 4px',
        }}
      >
        {label}
      </p>
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          color: tone || 'var(--text-primary)',
          fontSize: 11.5,
          lineHeight: 1.55,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          maxHeight: 170,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value || '(empty)'}
      </pre>
    </div>
  )
}

export default function ResultPanel({
  kind,
  verdict,
  passed,
  total,
  runtimeMs,
  cases,
  compileOutput,
  stderr,
}: {
  kind: 'run' | 'submit'
  verdict: string
  passed: number
  total: number
  runtimeMs?: number | null
  cases?: CaseResult[]
  compileOutput?: string | null
  stderr?: string | null
}) {
  const meta = VERDICT_META[verdict] || VERDICT_META.internal_error
  const rows = cases || []
  const showDetails = kind === 'run'

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        padding: '12px 14px 14px',
      }}
      aria-live="polite"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: meta.color,
            background: meta.bg,
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '3px 10px',
          }}
        >
          {meta.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {passed}/{total} {kind === 'run' ? 'example' : 'hidden'} case{total === 1 ? '' : 's'} passed
        </span>
        {typeof runtimeMs === 'number' && runtimeMs > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {runtimeMs} ms</span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{ fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
        >
          {kind === 'run' ? 'Run · public examples' : 'Submit · hidden cases'}
        </span>
      </div>

      {compileOutput && <Block label="Compiler output" value={compileOutput} tone="var(--danger)" />}
      {stderr && <Block label="Runtime output (stderr)" value={stderr} tone="var(--danger)" />}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {rows.map((c) => {
            const rowMeta = VERDICT_META[c.status] || VERDICT_META.internal_error
            const failed = !c.passed
            return (
              <div
                key={`${c.index}-${c.status}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: failed ? 'var(--bg-secondary, var(--bg-tertiary))' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Case {c.index}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: rowMeta.color,
                      background: rowMeta.bg,
                      borderRadius: 12,
                      padding: '2px 8px',
                    }}
                  >
                    {STATUS_LABEL[c.status] || c.status}
                  </span>
                  <span style={{ flex: 1 }} />
                  {c.time_ms > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.time_ms} ms</span>}
                </div>

                {failed && showDetails && c.input !== undefined && (
                  <>
                    <Block label="Input" value={c.input} />
                    <Block label="Your output" value={c.actual ?? ''} tone={rowMeta.color} />
                    <Block label="Expected" value={c.expected ?? ''} />
                    {c.stderr && <Block label="stderr" value={c.stderr} tone="var(--danger)" />}
                    {c.compile_output && (
                      <Block label="Compiler output" value={c.compile_output} tone="var(--danger)" />
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
