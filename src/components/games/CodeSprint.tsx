'use client'

/**
 * CodeSprint — Code Sprint 60: solo or a live room race.
 *
 * Both paths type the same server-seeded code over the same 60-second clock and
 * are scored the same way (verified characters → net WPM); they differ only in
 * who is on the other side of the clock.
 */

import { useState } from 'react'
import CodeSprintSolo from './CodeSprintSolo'
import CodeSprintRoom from './CodeSprintRoom'

type Mode = 'solo' | 'room'

const MODES: { key: Mode; label: string }[] = [
  { key: 'solo', label: 'Solo sprint' },
  { key: 'room', label: 'Race a room' },
]

export default function CodeSprint() {
  const [mode, setMode] = useState<Mode>('solo')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6 }} role="tablist" aria-label="Code sprint mode">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              border: mode === m.key ? 'none' : '1px solid var(--border)',
              background: mode === m.key ? 'var(--accent)' : 'var(--bg)',
              color: mode === m.key ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'solo' ? <CodeSprintSolo /> : <CodeSprintRoom />}
    </div>
  )
}
