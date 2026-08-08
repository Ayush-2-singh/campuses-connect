import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'
import { reviewContent } from '@/lib/copilot'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId, adminTypes } = authResult.auth

  const isAdmin = adminTypes.includes('platform_admin') || adminTypes.includes('campus_admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const rl = checkRateLimit(`copilot:review:${userId}`, 60, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many reviews.' }, { status: 429 })
  }

  let body: { text?: string; contentType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const text = (body.text || '').trim()
  if (!text) return NextResponse.json({ error: 'text is required.' }, { status: 422 })

  try {
    const verdict = await reviewContent(text, (body.contentType || 'post').trim())
    return NextResponse.json({ verdict })
  } catch {
    return NextResponse.json({ error: 'AI review unavailable.' }, { status: 503 })
  }
}
