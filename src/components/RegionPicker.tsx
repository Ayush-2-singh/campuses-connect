'use client'

/**
 * RegionPicker — leaderboard-only regional scope selection (spec §14/§21).
 * Region never appears as a content filter anywhere else; this component is
 * the single place College/City/State can be chosen, and only to answer
 * "Where do I rank?".
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Scope = 'global' | 'college' | 'city' | 'state'

interface RegionOption {
  id: string
  label: string
  meta?: string
}

export default function RegionPicker({
  scope,
  onPick,
}: {
  scope: Exclude<Scope, 'global'>
  onPick: (id: string, label: string) => void
}) {
  const supabase = createClient()
  const [options, setOptions] = useState<RegionOption[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (scope === 'college') {
        const { data } = await supabase
          .from('colleges')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
          .limit(100)
        if (!cancelled) setOptions((data || []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })))
      } else {
        // City/State options come from the campuses table's own geography.
        const { data } = await supabase
          .from('campuses')
          .select('id, name, city, state')
          .eq('is_active', true)
          .limit(200)
        if (!cancelled) {
          const rows = (data || []) as { id: string; name: string; city: string | null; state: string | null }[]
          if (scope === 'city') {
            const seen = new Map<string, string>()
            for (const r of rows) if (r.city) seen.set(r.city, r.id)
            setOptions([...seen.entries()].map(([label, id]) => ({ id, label })))
          } else {
            const seen = new Map<string, string>()
            for (const r of rows) if (r.state) seen.set(r.state, r.id)
            setOptions([...seen.entries()].map(([label, id]) => ({ id, label })))
          }
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [scope, supabase])

  if (options === null) {
    return <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>Loading regions…</p>
  }

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
      }}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${scope}…`}
        style={{
          width: '100%',
          minHeight: 38,
          border: '1px solid var(--border)',
          borderRadius: 9,
          padding: '8px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
        {filtered.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id, o.label)}
            style={{
              minHeight: 34,
              padding: '5px 12px',
              borderRadius: 17,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nothing found.</p>}
      </div>
    </div>
  )
}
