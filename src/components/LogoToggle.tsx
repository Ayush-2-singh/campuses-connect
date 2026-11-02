'use client'

import React from 'react'

const THEME_CHANGE_EVENT = 'cc-theme-change'

// Dark mode → dark variant logo (bright art for dark backgrounds),
// Light mode → light variant logo (deep art for white backgrounds).
// Default is the DARK variant: the app is dark-first, so the very first
// paint (before the theme attribute is read) must stay visible.
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

export default function LogoToggle({ size = 36 }: { size?: number }) {
  const [logoSrc, setLogoSrc] = React.useState('/connect-to-campus-logo-dark.png')
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
    // No plate behind the mark: the PNG is transparent, so a background (or a
    // border) here reads as a black/white square on the other theme.
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'box-shadow 0.2s ease',
        boxShadow: flash ? '0 0 0 2px var(--accent)' : 'none',
      }}
    >
      <img
        src={logoSrc}
        alt="CTC"
        width={size}
        height={size}
        style={{
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          transform: flash ? 'scale(1.15)' : 'scale(1)',
          opacity: flash ? 0.8 : 1,
        }}
      />
    </div>
  )
}
