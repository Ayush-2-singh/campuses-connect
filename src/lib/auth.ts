import { type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════
// Redirect / validation helpers (used by auth pages)
// ═══════════════════════════════════════════════════════════════

const RESET_PASSWORD_PATH = '/auth/reset-password'

export function getSafeRedirect(value: string | null | undefined, fallback = '/feed'): string {
  if (!value) return fallback
  let candidate = value.trim()
  if (!candidate) return fallback

  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    return fallback
  }

  candidate = candidate.replace(/[\u0000-\u001F\u007F]/g, '')
  if (!candidate) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback

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

// ═══════════════════════════════════════════════════════════════
// Service-role client + cookie-based user verification
// (handles chunked @supabase/ssr v0.12.4 cookies)
// ═══════════════════════════════════════════════════════════════

let _supabaseAdmin: SupabaseClient | null = null
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

/**
 * Extract the authenticated user from request cookies.
 *
 * @supabase/ssr v0.12.4 stores auth tokens in CHUNKED cookies:
 *   sb-<ref>-auth-token.0
 *   sb-<ref>-auth-token.1
 *
 * Strategy: find all cookies, reassemble chunks, parse JSON, verify via service role.
 */
export async function getVerifiedUser(request: NextRequest) {
  try {
    const allCookies = request.cookies.getAll()

    // Collect ALL cookie names and values for debugging
    const cookieNames = allCookies.map((c) => c.name)

    // Find auth token chunks: name ends with -auth-token.N (where N is a digit)
    // This matches: sb-tnlbqirrrjrkxkxlkpat-auth-token.0, .1, etc.
    // It does NOT match: sb-...-auth-token-flow-...-code-verifier
    const authChunks: { index: number; value: string }[] = []

    for (const cookie of allCookies) {
      const name = cookie.name
      // Check if name ends with -auth-token followed by .NUMBER
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex > 0) {
        const afterDot = name.slice(dotIndex + 1)
        if (/^\d+$/.test(afterDot)) {
          // This is a chunk like sb-...-auth-token.0
          const baseName = name.slice(0, dotIndex)
          if (baseName.endsWith('-auth-token')) {
            authChunks.push({ index: parseInt(afterDot, 10), value: cookie.value })
          }
        }
      }
    }

    // Also check for a non-chunked token (fallback)
    const singleToken = allCookies.find((c) => c.name.endsWith('-auth-token') && !c.name.includes('.'))

    let sessionValue: string | null = null

    if (authChunks.length > 0) {
      authChunks.sort((a, b) => a.index - b.index)
      sessionValue = authChunks.map((c) => c.value).join('')
    } else if (singleToken) {
      sessionValue = singleToken.value
    }

    if (!sessionValue) {
      console.error('[auth] No auth cookie. Names:', cookieNames.join(', '))
      return null
    }

    // Parse the session to get access_token
    // @supabase/ssr stores sessions as JSON (may be base64url-encoded)
    let accessToken: string | undefined
    try {
      // Try JSON parse first
      const decoded = decodeURIComponent(sessionValue)
      const parsed = JSON.parse(decoded)
      accessToken = parsed.access_token
    } catch {
      try {
        // Try base64url decode (Supabase default cookieEncoding)
        const base64 = sessionValue.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const json = atob(padded)
        const parsed = JSON.parse(json)
        accessToken = parsed.access_token
      } catch {
        // Last resort: use raw value as token
        accessToken = sessionValue
      }
    }

    if (!accessToken) {
      console.error('[auth] No access_token in session. Preview:', sessionValue.slice(0, 80))
      return null
    }

    // Verify via service-role client
    const admin = getSupabaseAdmin()
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(accessToken)

    if (error || !user) {
      console.error('[auth] getUser failed:', error?.message)
      return null
    }

    return user
  } catch (err) {
    console.error('[auth] getVerifiedUser error:', err)
    return null
  }
}
