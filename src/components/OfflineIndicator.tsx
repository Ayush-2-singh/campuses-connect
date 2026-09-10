'use client'

import { useEffect, useState } from 'react'

/**
 * Shows a subtle banner at the top of the page when the user is offline.
 * Automatically hides when connection is restored. Uses CSS transitions
 * for smooth appearance/disappearance.
 */
export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const update = () => {
      const isOffline = !navigator.onLine
      setOffline(isOffline)
      if (isOffline) {
        // Small delay to avoid flashing on brief disconnects
        setTimeout(() => setOffline(prev => { if (prev) setShow(true); return prev }), 500)
      } else {
        setShow(false)
      }
    }
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!show) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--warning)',
        color: '#000',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        animation: 'slideDown 0.2s ease',
      }}
    >
      <span style={{ fontSize: 14 }}>📡</span>
      You&apos;re offline — some features may be limited
    </div>
  )
}
