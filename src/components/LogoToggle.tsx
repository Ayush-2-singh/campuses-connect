'use client'

import React from 'react'

const LOGO_KEY = 'cc-logo-variant'
const LOGO_CHANGE_EVENT = 'cc-logo-change'

export type LogoVariant = 'default' | 'mono' | 'minimal'

const VARIANTS: LogoVariant[] = ['default', 'mono', 'minimal']

const VARIANT_LABELS: Record<LogoVariant, string> = {
  default: 'Color',
  mono: 'Mono',
  minimal: 'Minimal',
}

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

function getNextVariant(current: LogoVariant): LogoVariant {
  const idx = VARIANTS.indexOf(current)
  return VARIANTS[(idx + 1) % VARIANTS.length]
}

export default function LogoToggle({ size = 36 }: { size?: number }) {
  const [current, setCurrent] = React.useState<LogoVariant>('default')
  const [mounted, setMounted] = React.useState(false)
  const [flash, setFlash] = React.useState(false)

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

  const cycle = () => {
    const next = getNextVariant(current)
    setCurrent(next)
    try {
      localStorage.setItem(LOGO_KEY, next)
    } catch {}
    window.dispatchEvent(new Event(LOGO_CHANGE_EVENT))
    // Flash effect on switch
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }

  if (!mounted) return null

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Logo style: ${VARIANT_LABELS[current]}. Click to switch to ${VARIANT_LABELS[getNextVariant(current)]}`}
      title={`Logo: ${VARIANT_LABELS[current]} — click to cycle`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: flash ? '2px solid var(--accent)' : '1px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        transition: 'border 0.2s ease',
        flexShrink: 0,
      }}
    >
      <img
        src={getLogoSrc()}
        alt="CTC"
        width={size - 6}
        height={size - 6}
        style={{
          borderRadius: '50%',
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          transform: flash ? 'scale(1.15)' : 'scale(1)',
          opacity: flash ? 0.8 : 1,
        }}
      />
    </button>
  )
}
