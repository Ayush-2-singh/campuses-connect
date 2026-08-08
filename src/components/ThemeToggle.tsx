'use client'

import React from 'react'

const THEME_KEY = 'cc-theme'
const THEME_CHANGE_EVENT = 'cc-theme-change'

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  )
}

export default function ThemeToggle({ inline = false }: { inline?: boolean }) {
  const [isDark, setIsDark] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const sync = () => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    }
    sync()
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  const toggle = () => {
    const next = !isDark
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    setIsDark(next)
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
    } catch {}
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle${inline ? ' theme-toggle--inline' : ' theme-toggle--floating'}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {mounted && (isDark ? <SunIcon /> : <MoonIcon />)}
    </button>
  )
}
