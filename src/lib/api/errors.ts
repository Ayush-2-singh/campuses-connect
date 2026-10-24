import { NextResponse } from 'next/server'

/**
 * serverError — the ONE place a database or runtime message becomes a response.
 *
 * Postgres errors name tables, columns, constraints and sometimes policy
 * expressions; returning `error.message` to the caller hands an attacker a map
 * of the schema and tells them exactly why a write failed. The detail belongs
 * in the server log, where an operator can see it, and the caller gets a stable
 * sentence plus a reference they can quote.
 *
 * Usage:
 *   if (error) return serverError('live-voice-chat/chat POST', error)
 */
export function serverError(context: string, error: unknown, status = 500) {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)
  // Server-side only: never included in the response body.
  console.error(`[api] ${context}: ${detail}`)
  return NextResponse.json(
    { error: status >= 500 ? 'Something went wrong. Please try again.' : 'That request could not be completed.' },
    { status }
  )
}
