'use client'

import React from 'react'

const THEME_CHANGE_EVENT = 'cc-theme-change'

// Dark mode → mono logo, Light mode → color logo
function getLogoForTheme(): string {
  if (typeof window === 'undefined') return '/ctc-logo.svg'
  const theme = document.documentElement.getAttribute('data-theme')
  return theme === 'dark' ? '/ctc-logo-mono.svg' : '/ctc-logo.svg'
}

export function getLogoSrc(): string {
  return getLogoForTheme()
}

export default function LogoToggle({ size = 36 }: { size?: number }) {
  const [logoSrc, setLogoSrc] = React.useState('/ctc-logo.svg')
  const [mounted, setMounted] = React.useState(false)
  const [flash, setFlash] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setLogoSrc(getLogoForTheme())

    const sync = () => {
      setLogoSrc(getLogoForTheme())
      setFlash(true)
      setTimeout(() => setFlash(false), 300)
    }
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  if (!mounted) return null

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
      <img
        src={logoSrc}
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
    </div>
  )
}
