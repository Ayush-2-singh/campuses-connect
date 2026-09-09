// ═══════════════════════════════════════════════════════════════════════════
// Game Utilities — guest identity, formatting, helpers
// ═══════════════════════════════════════════════════════════════════════════

import { GAME_CONFIG } from './config'

/**
 * Get or create a persistent guest player ID.
 * Stored in localStorage — survives page refresh but not incognito/clear-data.
 */
export function getGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(GAME_CONFIG.GUEST_ID_KEY)
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(GAME_CONFIG.GUEST_ID_KEY, id)
  }
  return id
}

/**
 * Get saved nickname from localStorage.
 */
export function getSavedNickname(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(GAME_CONFIG.GUEST_NICKNAME_KEY) || ''
}

/**
 * Save nickname to localStorage.
 */
export function saveNickname(nickname: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GAME_CONFIG.GUEST_NICKNAME_KEY, nickname.trim())
}

/**
 * Format milliseconds to a human-readable countdown string.
 * e.g. 12345 → "12.3s" or "0:12"
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0.0s'
  const seconds = Math.ceil(ms / 1000)
  if (seconds <= 30) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Format milliseconds to a compact time string for answer display.
 * e.g. 2340 → "2.3s"
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Format room code with spacing for readability: "482 913"
 */
export function formatRoomCode(code: string): string {
  if (!code || code.length !== 6) return code
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback for older browsers
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

/**
 * Build a shareable join URL for a room.
 */
export function buildShareUrl(roomCode: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.connecttocampus.com'
  return `${base}/games/room/${roomCode}`
}

/**
 * Share via Web Share API if available, else copy to clipboard.
 */
export async function shareRoom(roomCode: string): Promise<boolean> {
  const url = buildShareUrl(roomCode)
  const text = `Join my Quick Math game! Room code: ${roomCode}\n${url}`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Quick Math — ConnectToCampus', text, url })
      return true
    } catch {
      // User cancelled or share failed — fall back to copy
    }
  }
  return copyToClipboard(text)
}

/**
 * Validate a room code (exactly 6 digits).
 */
export function isValidRoomCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

/**
 * Calculate time remaining for a round based on server timestamps.
 */
export function timeRemaining(startedAt: string, durationMs: number): number {
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const elapsed = now - start
  return Math.max(0, durationMs - elapsed)
}

/**
 * Score color based on position.
 */
export function rankColor(rank: number): string {
  if (rank === 0) return '#f59e0b' // gold
  if (rank === 1) return '#9ca3af' // silver
  if (rank === 2) return '#ea580c' // bronze
  return 'var(--text-muted)'
}

/**
 * Medal emoji for top 3 positions.
 */
export function medal(rank: number): string {
  if (rank === 0) return '🥇'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return ''
}
