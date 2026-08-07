import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brain_memories')
    .select('id, knowledge_gained, struggles_faced, behavioral_lifestyle, core_facts, is_core_memory, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch memories.' }, { status: 500 })
  }
  return NextResponse.json({ data: data || [] })
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing memory id.' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('brain_memories').delete().eq('id', id).eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: 'Failed to delete memory.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
