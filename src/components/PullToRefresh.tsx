'use client'

import { useCallback, useRef, useState } from 'react'

interface Props {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  threshold?: number
}

/**
 * Pull-to-refresh wrapper for mobile. Renders a subtle refresh indicator
 * when the user pulls down past the threshold. Works alongside normal scroll.
 */
export default function PullToRefresh({ onRefresh, children, threshold = 80 }: Props) {
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only activate when scrolled to top
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) {
      // Apply resistance — diminish the pull as it goes further
      const distance = Math.min(diff * 0.5, threshold * 1.5)
      setPullDistance(distance)
    }
  }, [pulling, refreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true)
      setPullDistance(40) // Lock at indicator height
      try {
        await onRefresh()
      } catch { /* ignore */ }
      setRefreshing(false)
    }
    setPulling(false)
    setPullDistance(0)
  }, [pulling, pullDistance, threshold, refreshing, onRefresh])

  const progress = Math.min(pullDistance / threshold, 1)

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative', minHeight: '100%' }}
    >
      {/* Pull indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: pullDistance,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: pullDistance === 0 ? 'height 0.2s ease' : 'none',
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${progress * 360}deg)`,
            transition: refreshing ? 'transform 0.8s linear' : 'none',
            animation: refreshing ? 'ptr-spin 0.8s linear infinite' : 'none',
            opacity: progress,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>
            {progress >= 1 ? '↑' : '↓'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 0.2s ease' : 'none' }}>
        {children}
      </div>

      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
