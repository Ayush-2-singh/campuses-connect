/**
 * LIVE PULSE PREFERENCES — the two user choices that govern the floating
 * live-activity card:
 *   • "Hide for now" — this tab session only (sessionStorage); a fresh visit
 *     brings the card back.
 *   • "Turn off" — persistent (localStorage), always reversible from the
 *     switch on the More page.
 *
 * There is deliberately NO "pause 24 hours" any more: a card silenced once
 * and forgotten read like a broken feature for a whole day. The contract is
 * the opposite — the card shows up on EVERY visit (with a real activity item,
 * or an honestly-labelled "last message 3h ago" fallback) and irritation is
 * handled by the 45s auto-dismiss instead of long silences.
 *
 * isPulseVisible stays pure for unit tests; the storage helpers never throw
 * (Safari private mode throws on localStorage access).
 */

export const PULSE_MUTED_KEY = 'cc-pulse-muted'

export interface PulsePrefs {
  /** The user switched the card off entirely. */
  muted: boolean
}

export const PULSE_DEFAULT_PREFS: PulsePrefs = { muted: false }

/** Pure: should the floating card be allowed on screen right now? */
export function isPulseVisible(prefs: PulsePrefs): boolean {
  return !prefs.muted
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
    return { muted: local.getItem(PULSE_MUTED_KEY) === '1' }
  } catch {
    return PULSE_DEFAULT_PREFS
  }
}

export function setPulseMuted(muted: boolean): PulsePrefs {
  const local = readStorage('localStorage')
  if (local) {
    try {
      if (muted) local.setItem(PULSE_MUTED_KEY, '1')
      else local.removeItem(PULSE_MUTED_KEY)
    } catch {
      /* storage unavailable — the choice just does not persist */
    }
  }
  return { muted }
}

/** "Hide for now" — this browsing session (tab) only, back on a fresh visit. */
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

/**
 * Honest age labels for the last-activity fallback card ("last message 3h
 * ago"). Never fabricates recency: something 2 days old says "2d ago".
 */
export function timeAgoLabel(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  const wk = Math.floor(d / 7)
  if (wk < 5) return `${wk}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

/** How long the card surfaces for a brand-new @tag, even when muted. */
export const PULSE_MENTION_FLASH_MS = 5_000

/**
 * Pure decision for the MENTION FLASH: a brand-new @tag is a notification,
 * not ambient activity — it surfaces the card for 5 seconds even when the
 * user muted or hid it. Mentions already seen this session (and everything
 * present on the very first load, via the bootstrap flag) never flash, so a
 * page refresh does not replay old tags.
 */
export function mentionFlash(
  seen: Set<string>,
  mentionKeys: string[],
  bootstrapped: boolean,
  now: number
): { until: number; key: string } | null {
  if (!bootstrapped) return null
  for (const key of mentionKeys) {
    if (!seen.has(key)) return { until: now + PULSE_MENTION_FLASH_MS, key }
  }
  return null
}
