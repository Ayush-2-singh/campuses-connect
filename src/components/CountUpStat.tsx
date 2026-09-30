'use client'

/**
 * COUNT-UP STAT — one animated number tile, shared by both profile pages.
 *
 * A profile that lands with moving numbers reads alive; the same motion is
 * deliberately quiet: 0.9s cubic ease-out, skipped entirely when the user
 * prefers reduced motion. The zero state renders a dash so a fresh student
 * sees the four dials of progression, not an empty row.
 */

import { useEffect, useState } from 'react'

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}

export function CountUpStat({
  label,
  sub,
  value,
  color,
  bg,
  border,
}: {
  label: string
  sub?: string
  value: number
  color: string
  bg: string
  border: string
}) {
  const animated = useCountUp(value)
  return (
    <div
      className="profile-stat"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '10px 6px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 17, fontWeight: 800, color, margin: 0, letterSpacing: '-0.02em' }}>
        {value > 0 ? animated : '—'}
      </p>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          margin: '2px 0 0',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </p>
      {sub && <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>{sub}</p>}
    </div>
  )
}
