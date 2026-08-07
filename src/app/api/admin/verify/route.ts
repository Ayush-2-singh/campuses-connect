import { createHash } from 'crypto'
import { NextResponse } from 'next/server'

// Server-only admin gate. The password lives in ADMIN_PASSWORD (env), never
// ships to the browser, and the session cookie value is derived from it via
// sha256 so it can't be forged with a guessable value like admin=1.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const COOKIE_NAME = 'cc_admin_pw'
const SALT = 'campusconnect:v1'

function cookieValue(): string {
  return createHash('sha256').update(`${SALT}:${ADMIN_PASSWORD}`).digest('hex')
}

function cookieIsValid(cookieHeader: string | null): boolean {
  if (!ADMIN_PASSWORD) return true // gate disabled if no password configured
  if (!cookieHeader) return false
  return cookieHeader
    .split(';')
    .map(c => c.trim())
    .some(c => c.startsWith(`${COOKIE_NAME}=`) && c.slice(COOKIE_NAME.length + 1) === cookieValue())
}

/**
 * GET /api/admin/verify — is this session already unlocked?
 */
export async function GET(request: Request) {
  return NextResponse.json({ authed: cookieIsValid(request.headers.get('cookie')) })
}

/**
 * POST /api/admin/verify — Body: { password }
 * On success, sets an httpOnly session cookie (7 days).
 */
export async function POST(request: Request) {
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ ok: true }) // gate disabled
  }
  const { password } = await request.json().catch(() => ({ password: '' }))
  if (typeof password !== 'string' || password !== ADMIN_PASSWORD) {
    // Small constant delay to slow down brute-force attempts
    await new Promise(r => setTimeout(r, 600))
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, cookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return res
}
