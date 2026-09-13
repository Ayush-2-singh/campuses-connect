import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api/middleware'

let _supabaseAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin!
}

// ═══════════════════════════════════════════════════════════════
// DELETE — Admin user operations (revoke premium, etc.)
// ═══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const admin = auth.auth

  const body = await request.json()
  const { action, user_id } = body

  if (!action || !user_id) {
    return NextResponse.json({ error: 'action and user_id required' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  try {
    if (action === 'revoke_premium') {
      const { error } = await db.from('user_premium').delete().eq('user_id', user_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      try {
        await db.from('audit_log').insert({
          actor_id: admin.userId,
          action: 'users.revoke_premium',
          entity_type: 'user_premium',
          entity_id: user_id,
        })
      } catch { /* ignore */ }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
