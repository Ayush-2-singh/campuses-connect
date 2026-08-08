import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId, adminTypes } = authResult.auth

  const isAdmin = adminTypes.includes('platform_admin') || adminTypes.includes('campus_admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const rl = checkRateLimit(`copilot:resolve:${userId}`, 120, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many actions.' }, { status: 429 })
  }

  let body: { item_id?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const itemId = (body.item_id || '').trim()
  const action = (body.action || '').trim()
  if (!itemId || !['approve', 'remove', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'item_id and action (approve|remove|dismiss) are required.' }, { status: 422 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('resolve_moderation_item', {
    p_item_id: itemId,
    p_action: action,
  })

  if (error) {
    return NextResponse.json({ error: `Could not resolve item: ${error.message}` }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Action not permitted.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
