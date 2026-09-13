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
 * We find all chunks, reassemble them, parse the JSON session,
 * and verify the access_token via the service-role client.
 */
export async function getVerifiedUser(request: NextRequest) {
  try {
    const allCookies = request.cookies.getAll()

    // 1. Find all auth token chunks: sb-<ref>-auth-token.0, .1, etc.
    const authChunks: { index: number; value: string }[] = []
    for (const cookie of allCookies) {
      const match = cookie.name.match(/^(sb-.*-auth-token)\.(\d+)$/)
      if (match) {
        authChunks.push({ index: parseInt(match[2], 10), value: cookie.value })
      }
    }

    // 2. Also check for a non-chunked token (fallback)
    const singleToken = allCookies.find((c) => c.name.match(/^sb-.*-auth-token$/))

    let sessionValue: string | null = null

    if (authChunks.length > 0) {
      authChunks.sort((a, b) => a.index - b.index)
      sessionValue = authChunks.map((c) => c.value).join('')
    } else if (singleToken) {
      sessionValue = singleToken.value
    }

    if (!sessionValue) return null

    // 3. Parse the session JSON to get access_token
    let accessToken: string | undefined
    try {
      const decoded = decodeURIComponent(sessionValue)
      const parsed = JSON.parse(decoded)
      accessToken = parsed.access_token
    } catch {
      accessToken = sessionValue
    }

    if (!accessToken) return null

    // 4. Verify via service-role client
    const admin = getSupabaseAdmin()
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(accessToken)

    if (error || !user) return null
    return user
  } catch {
    return null
  }
}
