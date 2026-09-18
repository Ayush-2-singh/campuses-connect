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
    const isReset =
      candidate === RESET_PASSWORD_PATH ||
      candidate.startsWith(`${RESET_PASSWORD_PATH}?`) ||
      candidate.startsWith(`${RESET_PASSWORD_PATH}#`)
    if (!isReset) return fallback
  }
  return candidate
}

export function getAuthErrorMessage(message: string): string {
  const n = message.toLowerCase()
  if (n.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (n.includes('email not confirmed')) return 'Please verify your email before signing in.'
  if (n.includes('user already registered')) return 'An account with this email already exists. Try signing in.'
  if (n.includes('password should be at least')) return 'Use a stronger password with at least 8 characters.'
  return message
}

export function getPasswordError(password: string): string {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
    return 'Use at least one uppercase letter, one lowercase letter, and one number.'
  return ''
}

// ═══════════════════════════════════════════════════════════════
// Service-role client + cookie-based user verification
// ═══════════════════════════════════════════════════════════════

let _supabaseAdmin: SupabaseClient | null = null
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

/**
 * Parse the raw Cookie header into { name: value } pairs.
 * Bypasses NextRequest.cookies.getAll() which may not work correctly
 * in all @supabase/ssr versions.
 */
function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const map: Record<string, string> = {}
  if (!cookieHeader) return map
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const name = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    map[name] = value
  }
  return map
}

/**
 * Extract the authenticated user from the raw Cookie header.
 *
 * @supabase/ssr v0.12.4 stores auth tokens in CHUNKED cookies:
 *   sb-<ref>-auth-token.0
 *   sb-<ref>-auth-token.1
 *
 * We parse the raw Cookie header, find all chunks, reassemble,
 * parse JSON, and verify via the service-role client.
 *
 * NOTE: this module is also imported by client auth pages (getSafeRedirect,
 * getAuthErrorMessage), so it must stay free of `next/headers`. The fallback
 * for callers that don't pass a request lives in `@/lib/api/middleware`, which
 * is server-only.
 */
export async function getVerifiedUserFromCookie(cookieHeader: string) {
  try {
    const cookies = parseCookieHeader(cookieHeader)
    const cookieNames = Object.keys(cookies)

    // Find auth token chunks: name ends with -auth-token.N (where N is a digit)
    const authChunks: { index: number; value: string }[] = []

    for (const name of cookieNames) {
      const dotIndex = name.lastIndexOf('.')
      if (dotIndex > 0) {
        const afterDot = name.slice(dotIndex + 1)
        if (/^\d+$/.test(afterDot)) {
          const baseName = name.slice(0, dotIndex)
          if (baseName.endsWith('-auth-token')) {
            authChunks.push({ index: parseInt(afterDot, 10), value: cookies[name] })
          }
        }
      }
    }

    // Also check for a non-chunked token (fallback)
    let singleTokenValue: string | null = null
    for (const name of cookieNames) {
      if (name.endsWith('-auth-token') && !name.includes('.')) {
        singleTokenValue = cookies[name]
        break
      }
    }

    let sessionValue: string | null = null

    if (authChunks.length > 0) {
      authChunks.sort((a, b) => a.index - b.index)
      sessionValue = authChunks.map((c) => c.value).join('')
    } else if (singleTokenValue) {
      sessionValue = singleTokenValue
    }

    if (!sessionValue) {
      console.error('[auth] No auth cookie. Header names:', cookieNames.join(', '))
      return null
    }

    // Parse the session to get access_token
    let accessToken: string | undefined
    try {
      const decoded = decodeURIComponent(sessionValue)
      const parsed = JSON.parse(decoded)
      accessToken = parsed.access_token
    } catch {
      try {
        // Try base64url decode
        const base64 = sessionValue.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const json = atob(padded)
        const parsed = JSON.parse(json)
        accessToken = parsed.access_token
      } catch {
        accessToken = sessionValue
      }
    }

    if (!accessToken) {
      console.error('[auth] No access_token. Preview:', sessionValue.slice(0, 100))
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

/** Wrapper for callers that already hold the incoming NextRequest. */
export async function getVerifiedUser(request?: NextRequest) {
  if (!request) return null
  return getVerifiedUserFromCookie(request.headers.get('cookie') || '')
}
