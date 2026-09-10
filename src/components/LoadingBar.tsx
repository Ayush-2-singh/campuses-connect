'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * YouTube-style loading progress bar at the top of the page.
 * Shows a thin animated line during route transitions.
 * Color matches the current section's accent via CSS variables.
 */
export default function LoadingBar() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Start loading animation
    setLoading(true)
    setProgress(0)

    // Simulate progress — fast start, slow finish (like YouTube)
    const t1 = setTimeout(() => setProgress(30), 50)
    const t2 = setTimeout(() => setProgress(60), 150)
    const t3 = setTimeout(() => setProgress(80), 300)
    const t4 = setTimeout(() => setProgress(95), 500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [pathname])

  useEffect(() => {
    if (loading && progress >= 95) {
      // Complete the bar
      setProgress(100)
      const t = setTimeout(() => {
        setLoading(false)
        setProgress(0)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [loading, progress])

  if (!loading) return null

  return (
    <>
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
            transition: progress < 95 ? 'width 0.3s ease' : 'width 0.15s ease',
            boxShadow: '0 0 8px var(--accent-glow)',
          }}
        />
      </div>
      {/* Shimmer effect during load */}
      <style>{`
        @keyframes loadingBarShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </>
  )
}
