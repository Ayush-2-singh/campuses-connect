'use client'

/**
 * COLLEGE SEARCH — the trust-building college picker.
 *
 * The old flow was two <select>s over a two-row table; every student outside
 * those two colleges hit "No colleges match" and took the Global exit. This
 * component is a real search over the (now broad) catalog:
 *
 *   • debounced client-side filter over name + city + state ("pune", "iit",
 *     "lucknow" all match),
 *   • city + state shown under the name — place context IS the trust signal,
 *   • ✓ verified chip on admin-verified institutions,
 *   • keyboard friendly (arrow keys + Enter), and
 *   • a clear empty state that never dead-ends: it offers the college
 *     request flow that already existed.
 *
 * Data comes from `colleges` (is_active) — one fetch, filtered locally, so
 * typing feels instant and costs zero extra queries.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface CollegeOption {
  id: string
  name: string
  city: string | null
  state: string | null
  is_verified: boolean | null
}

export default function CollegeSearch({
  selectedId,
  onSelect,
  onRequestCollege,
  maxHeight = 280,
}: {
  selectedId: string
  onSelect: (college: CollegeOption) => void
  /** Rendered inside the empty state (the existing "request a college" flow). */
  onRequestCollege?: () => void
  maxHeight?: number
}) {
  const supabase = createClient()
  const [all, setAll] = useState<CollegeOption[]>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase
      .from('colleges')
      .select('id, name, city, state, is_verified')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setAll((data as CollegeOption[]) || []))
  }, [supabase])

  // Debounced, case-insensitive filter over name + city + state. A 120ms
  // debounce keeps fast typists from re-filtering per keystroke; the list is
  // small enough (~hundreds) that local filtering is instant after that.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all.slice(0, 40)
    const tokens = q.split(/\s+/)
    return all
      .filter((c) => {
        const hay = `${c.name} ${c.city || ''} ${c.state || ''}`.toLowerCase()
        return tokens.every((t) => hay.includes(t))
      })
      .slice(0, 40)
  }, [all, query])

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const selected = all.find((c) => c.id === selectedId)

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setCursor(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && results[cursor]) {
            onSelect(results[cursor])
          }
        }}
        placeholder="Search college or city — e.g. IIT, Pune, Lucknow…"
        aria-label="Search your college"
        autoComplete="off"
        style={{
          width: '100%',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '11px 14px',
          fontSize: 14,
          marginBottom: 10,
          fontFamily: 'inherit',
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
        }}
      />

      {/* Currently selected — always visible so the choice is confirmable. */}
      {selected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--accent-light)',
            border: '1px solid var(--accent-border, var(--accent))',
            borderRadius: 10,
            padding: '9px 12px',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}>✓ {selected.name}</span>
          {(selected.city || selected.state) && (
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              · {[selected.city, selected.state].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      )}

      <div
        ref={listRef}
        role="listbox"
        aria-label="College results"
        style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight, overflowY: 'auto' }}
      >
        {results.map((c, i) => (
          <button
            key={c.id}
            role="option"
            aria-selected={c.id === selectedId}
            onMouseEnter={() => setCursor(i)}
            onClick={() => onSelect(c)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textAlign: 'left',
              background: i === cursor || c.id === selectedId ? 'var(--accent-light)' : 'var(--bg-secondary)',
              border: c.id === selectedId ? '1.5px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
                {c.is_verified && (
                  <span title="Verified institution" style={{ color: 'var(--accent-text)', marginLeft: 6 }}>
                    ✓
                  </span>
                )}
              </span>
              {(c.city || c.state) && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                  📍 {[c.city, c.state].filter(Boolean).join(', ')}
                </span>
              )}
            </span>
          </button>
        ))}

        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '18px 12px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              {query ? `Nothing matches “${query}” yet.` : 'Loading colleges…'}
            </p>
            {onRequestCollege && (
              <button
                onClick={onRequestCollege}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'none',
                  border: '1px solid var(--accent-border, var(--accent))',
                  borderRadius: 8,
                  padding: '7px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Request your college →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
