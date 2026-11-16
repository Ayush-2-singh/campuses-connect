'use client'

/**
 * SprintText — the shared word stream for Code Sprint.
 *
 * Both the solo run and the room race render the same window of words: enough
 * context ahead to read, only a slice of the stream in the DOM (a forty-word
 * sprint window instead of every word of a 130-word passage), with per-character
 * feedback on the active word.
 */

export function SprintActiveWord({ target, typed }: { target: string; typed: string }) {
  const caretAt = Math.min(typed.length, target.length)
  const total = Math.max(target.length, typed.length)
  const parts: React.ReactNode[] = []

  for (let i = 0; i <= total; i++) {
    if (i === caretAt) {
      parts.push(
        <span
          key="caret"
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 2,
            height: '1em',
            background: 'var(--accent)',
            marginLeft: 1,
            verticalAlign: 'text-bottom',
          }}
        />
      )
    }
    if (i === total) break
    const expected = target[i]
    const actual = typed[i]
    const isTyped = i < typed.length
    const ok = isTyped && actual === expected
    parts.push(
      <span
        key={i}
        style={{
          color: isTyped ? (ok ? 'var(--success-text)' : 'var(--danger)') : 'var(--text-muted)',
          background: isTyped && !ok ? 'var(--danger-light, transparent)' : 'transparent',
          borderRadius: 3,
        }}
      >
        {isTyped ? actual : expected}
      </span>
    )
  }
  return <>{parts}</>
}

export default function SprintText({
  words,
  completed,
  current,
  windowBefore = 2,
  windowAfter = 34,
}: {
  words: string[]
  completed: number
  current: string
  windowBefore?: number
  windowAfter?: number
}) {
  const start = Math.max(0, completed - windowBefore)
  const slice = words.slice(start, start + windowBefore + windowAfter)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 14px',
        fontSize: 19,
        fontWeight: 600,
        lineHeight: 1.5,
        padding: '16px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
      }}
    >
      {slice.map((w, i) => {
        const idx = start + i
        const done = idx < completed
        const active = idx === completed
        return (
          <span
            key={`${w}-${idx}`}
            style={{
              color: done ? 'var(--success-text)' : active ? 'var(--text-primary)' : 'var(--text-muted)',
              background: active ? 'var(--accent-light)' : 'transparent',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: 4,
              padding: '0 2px',
              whiteSpace: 'nowrap',
            }}
          >
            {active ? <SprintActiveWord target={w} typed={current} /> : w}
          </span>
        )
      })}
    </div>
  )
}
