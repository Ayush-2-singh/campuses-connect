import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/middleware'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    // Publishing a community upload is an admin decision. `requireAuth` reads
    // the caller's real admin_grants; the old `my_admin_grants()` RPC was called
    // with the service-role client, where auth.uid() is NULL, so it returned no
    // rows and blocked every admin too.
    if (auth.auth.adminTypes.length === 0) {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const { note_id, is_verified } = await request.json()
    if (!note_id) {
      return NextResponse.json({ error: 'note_id required' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin().from('notes').update({ is_verified }).eq('id', note_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Note verification updated' })
  } catch (err: any) {
    console.error('Verify error:', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
