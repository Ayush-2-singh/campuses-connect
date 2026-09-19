/**
 * Regression tests for the session-cookie decoding in `getVerifiedUserFromCookie`.
 *
 * Why this file exists: admin DELETE (and every other authenticated API route)
 * resolves the caller through this function. `@supabase/ssr` stores the session
 * as `base64-<Base64URL(JSON)>`, split across `sb-<ref>-auth-token.0`, `.1`, ...
 * chunks. The previous implementation did not understand that format: it tried
 * `decodeURIComponent` → `JSON.parse`, then a base64url attempt, and finally
 * **fell back to treating the raw cookie value as the access token itself**
 * (`accessToken = sessionValue`). That produced a garbage token, `getUser()`
 * rejected it, and the request came back 401 — which is what made the admin
 * section look like it "could not delete" anything.
 *
 * These tests pin the decoding contract and, most importantly, assert that a
 * malformed cookie can never be forwarded to Supabase Auth as a token.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Tokens handed to the mocked service-role `getUser()`, in call order. */
const mock = vi.hoisted(() => {
  const state = {
    /** token -> user, mirrors the server-side JWT check. */
    tokens: new Map<string, { id: string }>(),
    /** Every token value we were asked to verify. */
    seenTokens: [] as unknown[],
  }

  function createClient() {
    return {
      auth: {
        getUser: async (token: string) => {
          state.seenTokens.push(token)
          const user = typeof token === 'string' ? state.tokens.get(token) : undefined
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
        },
      },
    }
  }

  return { state, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }))

import { getVerifiedUserFromCookie } from '@/lib/auth'

/** Encode a session payload the way `@supabase/ssr` does. */
function encodeSession(session: Record<string, unknown>): string {
  const json = JSON.stringify(session)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `base64-${base64url}`
}

/** Build a Cookie header, chunking the token the way supabase-js does. */
function cookieHeader(ref: string, sessionValue: string, chunkSize?: number): string {
  const name = `sb-${ref}-auth-token`
  if (!chunkSize) return `${name}=${sessionValue}`

  const parts: string[] = []
  for (let i = 0; i < sessionValue.length; i += chunkSize) {
    parts.push(`${name}.${i / chunkSize}=${sessionValue.slice(i, i + chunkSize)}`)
  }
  return parts.join('; ')
}

beforeEach(() => {
  mock.state.tokens = new Map()
  mock.state.seenTokens = []
})

describe('getVerifiedUserFromCookie() — base64 session cookie', () => {
  it('decodes a single base64- cookie and verifies the access_token', async () => {
    mock.state.tokens.set('access-token-1', { id: 'user-1' })
    const cookie = cookieHeader('projref', encodeSession({ access_token: 'access-token-1' }))

    const user = await getVerifiedUserFromCookie(cookie)

    expect(user).toEqual({ id: 'user-1' })
    expect(mock.state.seenTokens).toEqual(['access-token-1'])
  })

  it('reassembles a chunked base64 cookie before decoding it', async () => {
    mock.state.tokens.set('access-token-chunked', { id: 'user-2' })
    const session = encodeSession({ access_token: 'access-token-chunked' })
    // Chunk mid-string so the split lands inside the base64 body, not on a
    // convenient boundary.
    const cookie = cookieHeader('projref', session, 20)

    // Genuinely split across multiple cookies, not a single-value shortcut.
    expect(cookie).toContain('-auth-token.0=')
    expect(cookie).toContain('-auth-token.2=')

    const user = await getVerifiedUserFromCookie(cookie)

    expect(user).toEqual({ id: 'user-2' })
    expect(mock.state.seenTokens).toEqual(['access-token-chunked'])
  })

  it('decodes UTF-8 session payloads without mangling multibyte characters', async () => {
    // atob() yields latin1 binary; without a TextDecoder pass the extracted
    // token would be corrupted for any non-ASCII session metadata.
    mock.state.tokens.set('access-token-utf8', { id: 'user-3' })
    const session = encodeSession({
      access_token: 'access-token-utf8',
      user: { full_name: 'आयुष 🎓' },
    })

    const user = await getVerifiedUserFromCookie(cookieHeader('projref', session))

    expect(user).toEqual({ id: 'user-3' })
    expect(mock.state.seenTokens).toEqual(['access-token-utf8'])
  })

  it('still accepts a legacy raw-JSON cookie (backward compatibility)', async () => {
    mock.state.tokens.set('access-token-legacy', { id: 'user-4' })
    const legacy = encodeURIComponent(JSON.stringify({ access_token: 'access-token-legacy' }))

    const user = await getVerifiedUserFromCookie(`sb-projref-auth-token=${legacy}`)

    expect(user).toEqual({ id: 'user-4' })
    expect(mock.state.seenTokens).toEqual(['access-token-legacy'])
  })
})

describe('getVerifiedUserFromCookie() — malformed cookies are not credentials', () => {
  it('returns null for a garbage cookie instead of forwarding it as a token', async () => {
    // The regression: the old fallback passed this value straight to getUser().
    const user = await getVerifiedUserFromCookie('sb-projref-auth-token=not-a-real-session')

    expect(user).toBeNull()
    expect(mock.state.seenTokens).toEqual([])
  })

  it('returns null when a base64- cookie does not decode to JSON', async () => {
    // Valid base64url, but the payload is not a session object.
    const user = await getVerifiedUserFromCookie(
      cookieHeader('projref', `base64-${btoa('definitely not json').replace(/=+$/, '')}`)
    )

    expect(user).toBeNull()
    expect(mock.state.seenTokens).toEqual([])
  })

  it('returns null when the decoded session has no access_token', async () => {
    const user = await getVerifiedUserFromCookie(
      cookieHeader('projref', encodeSession({ refresh_token: 'refresh-only' }))
    )

    expect(user).toBeNull()
    expect(mock.state.seenTokens).toEqual([])
  })

  it('returns null when no auth cookie is present at all', async () => {
    const user = await getVerifiedUserFromCookie('theme=dark; locale=en')

    expect(user).toBeNull()
    expect(mock.state.seenTokens).toEqual([])
  })

  it('ignores non-numeric auth-token suffixed cookies', async () => {
    // `-auth-token.expires` / `-auth-token.code-verifier` must not be treated as
    // a chunk of the session payload.
    const user = await getVerifiedUserFromCookie(
      'sb-projref-auth-token.expires=1234; sb-projref-auth-token.code-verifier=abc'
    )

    expect(user).toBeNull()
    expect(mock.state.seenTokens).toEqual([])
  })
})
