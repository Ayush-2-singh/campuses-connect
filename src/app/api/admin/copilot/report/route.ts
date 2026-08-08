import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['post', 'comment', 'opportunity', 'note', 'question', 'answer'])

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const rl = checkRateLimit(`copilot:report:${userId}`, 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many reports.' }, { status: 429 })
  }

  let body: { content_type?: string; content_id?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const contentType = (body.content_type || '').trim()
  const contentId = (body.content_id || '').trim()
  const reason = (body.reason || '').trim().slice(0, 500)
  if (!VALID_TYPES.has(contentType) || !contentId) {
    return NextResponse.json({ error: 'content_type and content_id are required.' }, { status: 422 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('content_reports').insert({
    content_type: contentType,
    content_id: contentId,
    reported_by: userId,
    reason: reason || 'Reported content',
  })

  if (error) {
    return NextResponse.json({ error: `Could not submit report: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
