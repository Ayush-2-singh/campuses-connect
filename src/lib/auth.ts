/**
 * One reusable safe-redirect validator for every post-auth destination
 * (`next` / `redirect` / `returnTo` query params — never trust them directly).
 *
 * Allowed:   /feed  /onboarding  /admin  /courses?id=123  /auth/reset-password
 * Rejected:  https://evil.com  http://evil.com  //evil.com  /\evil.com
 *            javascript:alert(...)  %2F%2Fevil.com (encoded)  malformed URLs
 */
const RESET_PASSWORD_PATH = '/auth/reset-password'

export function getSafeRedirect(value: string | null | undefined, fallback = '/feed'): string {
  if (!value) return fallback
  let candidate = value.trim()
  if (!candidate) return fallback

  // Decode exactly once so double-encoded bypasses (`%2F%2Fevil.com`)
  // resolve to their real form before the checks below. Malformed
  // encodings (e.g. `/100%off`) are rejected outright.
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    return fallback
  }

  // Strip control characters (URL/header smuggling hygiene).
  candidate = candidate.replace(/[\u0000-\u001F\u007F]/g, '')
  if (!candidate) return fallback

  // Must be a relative path starting with a single slash.
  if (!candidate.startsWith('/')) return fallback

  // Protocol-relative URLs (`//evil.com`, `/\evil.com`) are treated as
  // cross-origin by browsers — reject both.
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback

  // Auth pages would loop back into the auth flow. The one exception is
  // the password-recovery page, which the recovery email link targets.
  if (candidate.startsWith('/auth')) {
    const isResetPassword =
      candidate === RESET_PASSWORD_PATH ||
      candidate.startsWith(`${RESET_PASSWORD_PATH}?`) ||
      candidate.startsWith(`${RESET_PASSWORD_PATH}#`)
    if (!isResetPassword) return fallback
  }

  return candidate
}

export function getAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (normalized.includes('email not confirmed')) return 'Please verify your email before signing in.'
  if (normalized.includes('user already registered'))
    return 'An account with this email already exists. Try signing in.'
  if (normalized.includes('password should be at least')) return 'Use a stronger password with at least 8 characters.'
  return message
}

export function getPasswordError(password: string): string {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use at least one uppercase letter, one lowercase letter, and one number.'
  }
  return ''
}
