/**
 * Cookie-consent state, kept in one place so it can be unit-tested without a
 * browser. The banner (src/components/CookieConsent.tsx) owns the UI; this file
 * owns the rules:
 *
 *   • a first-party COOKIE records the choice (readable server-side later),
 *   • localStorage keeps the same value for a synchronous first paint,
 *   • localStorage wins when the two disagree (it is the newer write, since the
 *     banner writes both in the same tick and only storage can fail),
 *   • anything that is not exactly 'granted' / 'denied' reads as "no choice yet",
 *     so a corrupted key can never silently enable analytics.
 */
export type ConsentChoice = 'granted' | 'denied'

export const CONSENT_KEY = 'cc-cookie-consent'
export const CONSENT_COOKIE = 'cc_consent'
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180 // 180 days
export const CONSENT_EVENT = 'cc-consent'

const isChoice = (value: string | null | undefined): value is ConsentChoice => value === 'granted' || value === 'denied'

/** `document.cookie`-style string → choice (first match wins). */
export function parseConsentCookie(cookieString: string): ConsentChoice | null {
  if (!cookieString) return null
  for (const part of cookieString.split(';')) {
    const [rawName, ...rest] = part.split('=')
    if (rawName?.trim() !== CONSENT_COOKIE) continue
    const value = rest.join('=').trim()
    return isChoice(value) ? value : null
  }
  return null
}

/** Pick<Storage, 'getItem'> so a test can pass a plain object. */
type Readable = { getItem: (key: string) => string | null }

export function readConsent(storage: Readable | null | undefined, cookieString: string): ConsentChoice | null {
  try {
    const stored = storage?.getItem(CONSENT_KEY) ?? null
    if (isChoice(stored)) return stored
  } catch {
    /* storage blocked — fall through to the cookie */
  }
  return parseConsentCookie(cookieString)
}

/** The `Set-Cookie` payload the banner writes, minus the browser-only `secure`. */
export function consentCookie(value: ConsentChoice, secure: boolean): string {
  return `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure ? '; secure' : ''}`
}
