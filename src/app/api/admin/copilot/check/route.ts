import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'
import { reviewContent } from '@/lib/copilot'

export const runtime = 'nodejs'
const MAX_TEXT = 3000

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const rl = checkRateLimit(`copilot:check:${userId}`, 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Review limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
  }

  let body: { text?: string; contentType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const text = (body.text || '').trim()
  const contentType = (body.contentType || 'post').trim()
  if (!text) return NextResponse.json({ error: 'text is required.' }, { status: 422 })
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: 'Content is too long to review.' }, { status: 422 })
  }

  // Gemini failure NEVER blocks posting — fall back to allow.
  try {
    const verdict = await reviewContent(text, contentType)
    return NextResponse.json({ verdict })
  } catch {
    return NextResponse.json({ error: 'AI review unavailable.' }, { status: 503 })
  }
}
