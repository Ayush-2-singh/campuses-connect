import { describe, it, expect } from 'vitest'
import { CONSENT_COOKIE, CONSENT_KEY, consentCookie, parseConsentCookie, readConsent } from '@/lib/consent'

/**
 * The consent rules are the only thing standing between "no decision yet" and
 * analytics actually loading, so they are covered here rather than trusted by
 * inspection: a corrupted key must never read as granted.
 */
const storageWith = (value: string | null) => ({
  getItem: (key: string) => (key === CONSENT_KEY ? value : null),
})

describe('cookie consent', () => {
  it('reads a granted choice from localStorage', () => {
    expect(readConsent(storageWith('granted'), '')).toBe('granted')
  })

  it('reads a denied choice from the cookie when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('storage blocked')
      },
    }
    expect(readConsent(blocked, `${CONSENT_COOKIE}=denied`)).toBe('denied')
  })

  it('prefers localStorage over a stale cookie', () => {
    expect(readConsent(storageWith('denied'), `${CONSENT_COOKIE}=granted`)).toBe('denied')
  })

  it('treats an unknown or corrupted value as "no choice yet"', () => {
    expect(readConsent(storageWith('yes'), '')).toBeNull()
    expect(readConsent(storageWith(''), '')).toBeNull()
    expect(readConsent(null, `${CONSENT_COOKIE}=maybe`)).toBeNull()
    expect(readConsent(storageWith(null), '')).toBeNull()
  })

  it('parses the cookie out of a busy cookie string', () => {
    expect(parseConsentCookie(`sb-auth=abc; ${CONSENT_COOKIE}=granted; theme=dark`)).toBe('granted')
    expect(parseConsentCookie('sb-auth=abc; theme=dark')).toBeNull()
  })

  it('writes a first-party, lax, 180-day cookie and adds secure on https', () => {
    const plain = consentCookie('denied', false)
    expect(plain).toContain(`${CONSENT_COOKIE}=denied`)
    expect(plain).toContain('path=/')
    expect(plain).toContain('max-age=15552000')
    expect(plain).toContain('samesite=lax')
    expect(plain).not.toContain('secure')
    expect(consentCookie('granted', true)).toContain('; secure')
  })
})
