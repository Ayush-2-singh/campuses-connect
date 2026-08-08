import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function GET() {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId, adminTypes, profile } = authResult.auth

  const isAdmin = adminTypes.includes('platform_admin') || adminTypes.includes('campus_admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const rl = checkRateLimit(`copilot:queue:${userId}`, 60, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const supabase = await createClient()

  // Align route authz with the RPC: admins need the content.moderation
  // permission (platform admins have it implicitly via has_mod_permission).
  const { data: canModerate } = await supabase.rpc('has_mod_permission', {
    p_user_id: userId,
    p_key: 'content.moderation',
    p_campus_id: profile.campus_id || null,
  })
  if (!canModerate) {
    return NextResponse.json({ error: 'You do not have the content.moderation permission.' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('get_moderation_queue', { p_limit: 100 })
  if (error) {
    return NextResponse.json({ error: `Failed to load queue: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ items: data || [] })
}
