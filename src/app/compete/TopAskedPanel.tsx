'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TopAskedPanel — the "most asked at FAANG" catalogue from the community
// sheet. Each row shows the interview frequency per company; problems that
// exist in-house open straight in the workspace, the rest open on LeetCode.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { TOP_ASKED, TOP_ASKED_SOURCE } from './topAsked'
import type { Problem } from './types'

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const DIFF_COLOR: Record<string, string> = {
  Easy: 'var(--success-text)',
  Medium: 'var(--warning-text)',
  Hard: 'var(--danger)',
}

const PAGE = 25

export default function TopAskedPanel({
  problems,
  onSelectProblem,
}: {
  problems: Problem[]
  onSelectProblem: (p: Problem) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const bySlug = useMemo(() => new Map(problems.map((p) => [p.slug, p])), [problems])
  const visible = showAll ? TOP_ASKED : TOP_ASKED.slice(0, PAGE)

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Most asked at FAANG</p>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {TOP_ASKED.length} questions · interview counts per company
        </span>
        <span style={{ flex: 1 }} />
        <a
          href={TOP_ASKED_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 600, textDecoration: 'none' }}
        >
          Source sheet ↗
        </a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((item) => {
          const inHouse = item.problemSlug ? bySlug.get(item.problemSlug) : undefined
          const top = item.companies.slice(0, 3)
          return (
            <div
              key={`${item.rank}-${item.title}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 14px',
                boxShadow: 'var(--shadow-sm)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  width: 26,
                  flexShrink: 0,
                }}
              >
                {item.rank}
              </span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {item.title}
                  {item.premium && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9.5,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: 'var(--bg-tertiary)',
                        color: 'var(--warning-text)',
                        verticalAlign: 'middle',
                      }}
                    >
                      PREMIUM
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  <span style={{ color: DIFF_COLOR[item.difficulty], fontWeight: 700 }}>{item.difficulty}</span>
                  {' · '}
                  {item.topic}
                  {' · asked '}
                  <strong style={{ color: 'var(--text-secondary)' }}>{item.total}×</strong>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: '0 1 auto' }}>
                {top.map((c) => (
                  <span
                    key={c.name}
                    style={{
                      fontSize: 10.5,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.name} {c.count}
                  </span>
                ))}
                {item.companies.length > top.length && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    +{item.companies.length - top.length}
                  </span>
                )}
              </div>

              {inHouse ? (
                <button
                  type="button"
                  onClick={() => onSelectProblem(inHouse)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--accent-border)',
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Solve here →
                </button>
              ) : (
                <a
                  href={item.leetcodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Solve on LeetCode ↗
                </a>
              )}
            </div>
          )
        })}
      </div>

      {TOP_ASKED.length > PAGE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: 10,
            fontSize: 11.5,
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {showAll ? 'Show top 25' : `Show all ${TOP_ASKED.length}`}
        </button>
      )}
    </section>
  )
}
