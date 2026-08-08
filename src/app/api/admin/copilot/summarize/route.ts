import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'
import { summarizeQueue } from '@/lib/copilot'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId, adminTypes } = authResult.auth

  const isAdmin = adminTypes.includes('platform_admin') || adminTypes.includes('campus_admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const rl = checkRateLimit(`copilot:summarize:${userId}`, 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many summaries.' }, { status: 429 })
  }

  let body: { items?: { type: string; preview: string; reason: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  try {
    const digest = await summarizeQueue(body.items || [])
    return NextResponse.json({ digest })
  } catch {
    return NextResponse.json({ error: 'AI summary unavailable.' }, { status: 503 })
  }
}
