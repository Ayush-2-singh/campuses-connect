'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * YouTube-style loading progress bar at the top of the page.
 * Only shows after 200ms — fast navigations stay invisible.
 */
export default function LoadingBar() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const delayRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // Don't show the bar immediately — skip for fast navigations
    setLoading(false)
    setProgress(0)

    delayRef.current = setTimeout(() => {
      setLoading(true)
      setProgress(30)
      const t1 = setTimeout(() => setProgress(60), 80)
      const t2 = setTimeout(() => setProgress(85), 160)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }, 200)

    return () => {
      clearTimeout(delayRef.current)
    }
  }, [pathname])

  useEffect(() => {
    if (loading && progress >= 85) {
      setProgress(100)
      const t = setTimeout(() => {
        setLoading(false)
        setProgress(0)
      }, 150)
      return () => clearTimeout(t)
    }
  }, [loading, progress])

  // Auto-hide after 3s regardless (safety net)
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      setLoading(false)
      setProgress(0)
    }, 3000)
    return () => clearTimeout(t)
  }, [loading])

  if (!loading) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent)',
          borderRadius: '0 2px 2px 0',
          transition: progress < 95 ? 'width 0.2s ease' : 'width 0.1s ease',
          boxShadow: '0 0 8px var(--accent-glow)',
        }}
      />
    </div>
  )
}
