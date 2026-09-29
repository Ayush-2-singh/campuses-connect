/**
 * LIVE PULSE PREFERENCES — who is allowed to see the floating live-activity
 * card, and for how long it stays quiet.
 *
 * The card shows real platform activity on every page, so the user MUST be
 * able to make it stop: "hide for now" (this browsing session), "pause for
 * 24 hours", or "turn it off" for good. Every choice is reversible from the
 * More page, so nobody can lose the feature by tapping the wrong row.
 *
 * The visibility decision is a pure function so it can be unit-tested without
 * a DOM; the storage helpers are thin wrappers that never throw (Safari
 * private mode throws on localStorage access).
 */

export const PULSE_MUTED_KEY = 'cc-pulse-muted'
export const PULSE_PAUSED_KEY = 'cc-pulse-paused-until'

export interface PulsePrefs {
  /** The user switched the card off entirely. */
  muted: boolean
  /** Epoch ms until which the card stays hidden (0 = not paused). */
  pausedUntil: number
}

export const PULSE_DEFAULT_PREFS: PulsePrefs = { muted: false, pausedUntil: 0 }

export const PULSE_PAUSE_MS = 24 * 60 * 60 * 1000

/** Pure: should the floating card be allowed on screen right now? */
export function isPulseVisible(prefs: PulsePrefs, now: number): boolean {
  if (prefs.muted) return false
  return !(prefs.pausedUntil > now)
}

function readStorage(storage: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window[storage]
  } catch {
    return null
  }
}

export function readPulsePrefs(): PulsePrefs {
  const local = readStorage('localStorage')
  if (!local) return PULSE_DEFAULT_PREFS
  try {
    const paused = Number(local.getItem(PULSE_PAUSED_KEY) || 0)
    return {
      muted: local.getItem(PULSE_MUTED_KEY) === '1',
      pausedUntil: Number.isFinite(paused) ? paused : 0,
    }
  } catch {
    return PULSE_DEFAULT_PREFS
  }
}

export function writePulsePrefs(prefs: PulsePrefs): PulsePrefs {
  const local = readStorage('localStorage')
  if (local) {
    try {
      if (prefs.muted) local.setItem(PULSE_MUTED_KEY, '1')
      else local.removeItem(PULSE_MUTED_KEY)
      if (prefs.pausedUntil > 0) local.setItem(PULSE_PAUSED_KEY, String(prefs.pausedUntil))
      else local.removeItem(PULSE_PAUSED_KEY)
    } catch {
      /* storage unavailable — the choice just does not persist */
    }
  }
  return prefs
}

/** "Hide for now" — silence for the rest of THIS browsing session. */
export const PULSE_SESSION_HIDE_KEY = 'cc-pulse-hidden'

export function readSessionHidden(): boolean {
  const session = readStorage('sessionStorage')
  if (!session) return false
  try {
    return session.getItem(PULSE_SESSION_HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSessionHidden(hidden: boolean): void {
  const session = readStorage('sessionStorage')
  if (!session) return
  try {
    if (hidden) session.setItem(PULSE_SESSION_HIDE_KEY, '1')
    else session.removeItem(PULSE_SESSION_HIDE_KEY)
  } catch {
    /* ignore */
  }
}

/** "Pause for 24 hours" — comes back on its own, no settings trip needed. */
export function pausePulseFor(ms: number = PULSE_PAUSE_MS): PulsePrefs {
  return writePulsePrefs({ ...readPulsePrefs(), pausedUntil: Date.now() + ms })
}

/** "Turn off live updates" — persistent until switched back on in More. */
export function setPulseMuted(muted: boolean): PulsePrefs {
  return writePulsePrefs({ ...readPulsePrefs(), muted })
}
