'use client'

import React from 'react'

const LOGO_KEY = 'cc-logo-variant'
const LOGO_CHANGE_EVENT = 'cc-logo-change'

export type LogoVariant = 'default' | 'mono' | 'minimal'

const LOGO_OPTIONS: { id: LogoVariant; label: string; preview: string }[] = [
  { id: 'default', label: 'Color', preview: '🎨' },
  { id: 'mono', label: 'Mono', preview: '⬛' },
  { id: 'minimal', label: 'Minimal', preview: '✦' },
]

export function getLogoSrc(): string {
  if (typeof window === 'undefined') return '/ctc-logo.svg'
  const variant = localStorage.getItem(LOGO_KEY) as LogoVariant | null
  switch (variant) {
    case 'mono':
      return '/ctc-logo-mono.svg'
    case 'minimal':
      return '/ctc-logo-minimal.svg'
    default:
      return '/ctc-logo.svg'
  }
}

export default function LogoToggle({ size = 36 }: { size?: number }) {
  const [current, setCurrent] = React.useState<LogoVariant>('default')
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(LOGO_KEY) as LogoVariant | null
    if (saved) setCurrent(saved)

    const sync = () => {
      const v = localStorage.getItem(LOGO_KEY) as LogoVariant | null
      if (v) setCurrent(v)
    }
    window.addEventListener(LOGO_CHANGE_EVENT, sync)
    return () => window.removeEventListener(LOGO_CHANGE_EVENT, sync)
  }, [])

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (id: LogoVariant) => {
    setCurrent(id)
    try {
      localStorage.setItem(LOGO_KEY, id)
    } catch {}
    window.dispatchEvent(new Event(LOGO_CHANGE_EVENT))
    setOpen(false)
  }

  if (!mounted) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change logo style"
        title="Change logo style"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <img
          src={getLogoSrc()}
          alt="CTC"
          width={size - 6}
          height={size - 6}
          style={{ borderRadius: '50%' }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            zIndex: 100,
            minWidth: 140,
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', margin: 0, fontWeight: 600 }}>
            Logo Style
          </p>
          {LOGO_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => select(opt.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                background: current === opt.id ? 'var(--accent-light)' : 'transparent',
                color: current === opt.id ? 'var(--accent-text)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: current === opt.id ? 600 : 500,
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>{opt.preview}</span>
              <span>{opt.label}</span>
              {current === opt.id && <span style={{ marginLeft: 'auto', fontSize: 12 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
