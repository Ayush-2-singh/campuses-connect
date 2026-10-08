import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite } from '@/lib/api/middleware'

const MAX_QUERY_LENGTH = 80
const MAX_RESULTS = 20

/** GET /api/colleges/search?q=<query> */
export async function GET(req: NextRequest) {
  const auth = await requireAuthLite()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const rawQ = searchParams.get('q')

  if (rawQ === null || rawQ === undefined) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
  }

  const q = rawQ.trim()

  if (q.length < 2) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Search query must be ${MAX_QUERY_LENGTH} characters or fewer` }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('colleges')
    .select('id, name, city, state')
    .eq('is_active', true)
    .ilike('name', `%${q}%`)
    .ilike('city', `%${q}%`)
    .ilike('state', `%${q}%`)
    .limit(MAX_RESULTS)
    .order('name')

  if (error) {
    console.error('[colleges/search] supabase error', error)
    return NextResponse.json({ error: 'Failed to search colleges' }, { status: 500 })
  }

  return NextResponse.json({
    colleges: (data as Array<{ id: string; name: string; city: string | null; state: string | null }>) || [],
  })
}
