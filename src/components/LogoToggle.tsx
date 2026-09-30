'use client'

import React from 'react'

const THEME_CHANGE_EVENT = 'cc-theme-change'

// Legacy theme-aware logo paths (kept for backward compatibility; the UI now
// renders the inline SVG BrandMark instead of PNG assets).
function getLogoForTheme(): string {
  if (typeof window === 'undefined') return '/connect-to-campus-logo-dark.png'
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light') {
    return '/connect-to-campus-logo-light.png'
  }
  return '/connect-to-campus-logo-dark.png'
}

export function getLogoSrc(): string {
  return getLogoForTheme()
}

/**
 * BrandMark — the ConnectToCampus mark as inline SVG.
 * Zero network requests, crisp at any size, theme-aware via CSS vars
 * (replaces the 90-135KB PNG logos that shipped in the header before).
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="ConnectToCampus"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id="ctc-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent-gold)" />
          <stop offset="100%" stopColor="var(--accent-cyan)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#ctc-mark)" />
      {/* Interlocked C-C — students connecting across campuses */}
      <path
        d="M29.5 17.5a9 9 0 1 0 0 13"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <path
        d="M18.5 21.5a6.5 6.5 0 1 1 0 5"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  )
}

export default function LogoToggle({ size = 36 }: { size?: number }) {
  const [mounted, setMounted] = React.useState(false)
  const [flash, setFlash] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const sync = () => {
      setFlash(true)
      setTimeout(() => setFlash(false), 300)
    }
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  if (!mounted) return <BrandMark size={size} />

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        border: flash ? '2px solid var(--accent)' : '1px solid var(--border)',
        transition: 'border 0.2s ease',
        background: 'var(--bg)',
      }}
    >
      <span
        style={{
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          transform: flash ? 'scale(1.15)' : 'scale(1)',
          opacity: flash ? 0.8 : 1,
          display: 'inline-flex',
        }}
      >
        <BrandMark size={size - 6} />
      </span>
    </div>
  )
}
