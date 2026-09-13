import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuthLite } from '@/lib/api/middleware'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthLite(request)
    if (!auth.ok) return auth.response
    const user = auth.auth

    const { data: grants } = await getSupabaseAdmin().rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    if (grantsArr.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { note_id, is_verified } = await request.json()
    if (!note_id) {
      return NextResponse.json({ error: 'note_id required' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin()
      .from('notes')
      .update({ is_verified })
      .eq('id', note_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Note verification updated' })
  } catch (err: any) {
    console.error('Verify error:', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
