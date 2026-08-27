'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Offline Detection ────────────────────────────────────────────────────────
/**
 * Returns true when the browser is online, false when offline.
 * Automatically updates when connection status changes.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}

// ─── Haptic Feedback ──────────────────────────────────────────────────────────
/**
 * Triggers subtle haptic vibration on supported devices.
 * Safe to call on desktop — just does nothing.
 */
export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern)
      }
    } catch { /* ignore */ }
  }, [])

  return {
    /** Light tap — for button presses, toggles */
    tap: () => vibrate(10),
    /** Medium feedback — for likes, saves, votes */
    medium: () => vibrate(20),
    /** Success — for completed actions */
    success: () => vibrate([10, 30, 10]),
    /** Error — for failures */
    error: () => vibrate([30, 50, 30]),
  }
}

// ─── Swipe to Go Back ─────────────────────────────────────────────────────────
/**
 * Detects a right-swipe gesture from the left edge of the screen.
 * Calls `onSwipeBack` when the gesture completes (past threshold).
 * Returns refs and handlers to attach to the swipeable container.
 */
export function useSwipeBack(onSwipeBack?: () => void) {
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)
  const router = useRouter()

  const goBack = onSwipeBack || (() => router.back())

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].clientX
    // Only activate from left 30px edge (iOS-style back gesture)
    if (x < 30) {
      startX.current = x
      startY.current = e.touches[0].clientY
      swiping.current = true
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return
    const diffX = e.touches[0].clientX - startX.current
    const diffY = Math.abs(e.touches[0].clientY - startY.current)
    // Cancel if vertical scroll is dominant
    if (diffY > Math.abs(diffX)) {
      swiping.current = false
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return
    const diffX = e.changedTouches[0].clientX - startX.current
    swiping.current = false
    // Trigger if swiped right more than 80px
    if (diffX > 80) {
      goBack()
    }
  }, [goBack])

  return { onTouchStart, onTouchMove, onTouchEnd }
}

// ─── Viewport Height Fix ──────────────────────────────────────────────────────
/**
 * Fixes the 100vh issue on mobile browsers where the address bar
 * causes 100vh to be taller than the visible area.
 * Returns the actual viewport height as a CSS variable.
 */
export function useViewportHeight() {
  useEffect(() => {
    const update = () => {
      const vh = window.visualViewport?.height || window.innerHeight
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [])
}

// ─── Prevent Double-Tap Zoom ──────────────────────────────────────────────────
/**
 * Prevents the 300ms double-tap zoom delay on mobile.
 * Applied globally via CSS, but this hook handles edge cases.
 */
export function usePreventZoom() {
  useEffect(() => {
    // The CSS already handles this with touch-action: manipulation
    // and -webkit-tap-highlight-color: transparent
    // This hook is here for any additional JS-level prevention
  }, [])
}
