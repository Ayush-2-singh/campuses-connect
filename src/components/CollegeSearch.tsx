'use client'

/**
 * COLLEGE SEARCH — secure, server-side, debounced autocomplete for college
 * selection. The dropdown no longer talks to the full `colleges` table:
 * it calls `GET /api/colleges/search?q=...` after a small debounce.
 *
 * Kept public API and UX exactly as before:
 *   <CollegeSearch selectedId onSelect onRequestCollege />
 *
 * Manual college entry is untouched: the "Can't find it? Request your college"
 * button still calls the existing `onRequestCollege` callback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface CollegeOption {
  id: string
  name: string
  city: string | null
  state: string | null
}

type SearchResult = CollegeOption[]

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
  const [results, setResults] = useState<SearchResult>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastRequestId = useRef(0)

  // Seed the dropdown with the currently selected college when it is not
  // already present, so the selected value remains confirmable before a query
  // finishes.
  const selected = useMemo(() => {
    return results.find((c) => c.id === selectedId) ?? null
  }, [results, selectedId])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    async (value: string) => {
      const q = value.trim()
      if (q.length < 2) {
        setResults([])
        return
      }

      // Guard against stale requests: give the current in-flight request a
      // monotonically increasing token. If the token changed before this
      // callback resolves, ignore the response.
      const requestId = ++lastRequestId.current
      setBusy(true)

      try {
        const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        })

        if (!res.ok) {
          if (res.status === 401) {
            setResults([])
            return
          }
          // Network/backend errors should not replace a valid result list.
          return
        }

        const data = (await res.json()) as { colleges?: CollegeOption[] }
        if (requestId !== lastRequestId.current) return
        setResults(data.colleges ?? [])
      } catch {
        // Network failure: leave the last valid result set (or empty) as is.
      } finally {
        if (requestId === lastRequestId.current) setBusy(false)
      }
    },
    [supabase]
  )

  // Debounced fetch: ~300ms after the last keystroke, call the server API.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim() || query.trim().length < 2) {
      setResults([])
      return
    }

    const id = setTimeout(() => {
      search(query)
    }, 300)

    debounceRef.current = id

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const selectedOption = results.find((c) => c.id === selectedId) ?? null

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
                {c.id && (
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

        {results.length === 0 && query.trim().length >= 2 && (
          <div style={{ textAlign: 'center', padding: '18px 12px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Nothing matches “{query.trim()}” yet.
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

        {query.trim().length < 2 && (
          <div style={{ textAlign: 'center', padding: '18px 12px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Type at least 2 characters to search.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
