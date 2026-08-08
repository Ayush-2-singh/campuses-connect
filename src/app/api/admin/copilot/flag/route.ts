import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'
import type { AiVerdict } from '@/lib/copilot'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['post', 'comment', 'opportunity', 'note', 'question', 'answer'])

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const rl = checkRateLimit(`copilot:flag:${userId}`, 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Flag limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
  }

  let body: { content_type?: string; content_id?: string; reason?: string; ai_verdict?: AiVerdict; author_id?: string }
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
  // RPC enforces "author OR moderator" — author_id defaults to auth.uid()
  const { data, error } = await supabase.rpc('flag_content', {
    p_content_type: contentType,
    p_content_id: contentId,
    p_reason: reason || 'Flagged by AI Admin Copilot',
    p_ai_verdict: body.ai_verdict || null,
    p_author_id: body.author_id || null,
  })

  if (error) {
    return NextResponse.json({ error: `Could not flag content: ${error.message}` }, { status: 500 })
  }
  // RPC returns NULL when the caller doesn't own the content (non-moderator)
  if (!data) {
    return NextResponse.json({ error: 'You can only flag your own content.' }, { status: 403 })
  }
  return NextResponse.json({ queue_id: data }, { status: 201 })
}
