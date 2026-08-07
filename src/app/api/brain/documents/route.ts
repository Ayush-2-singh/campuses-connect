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
    .from('brain_documents')
    .select('*, brain_chunks(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch documents.' }, { status: 500 })
  }

  const docs = (data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    file_type: d.file_type,
    char_count: d.char_count,
    created_at: d.created_at,
    chunkCount: d.brain_chunks?.[0]?.count ?? 0,
  }))
  return NextResponse.json({ data: docs })
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing document id.' }, { status: 400 })

  const supabase = await createClient()
  // RLS ensures the user can only delete their own document
  const { error } = await supabase.from('brain_documents').delete().eq('id', id).eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
