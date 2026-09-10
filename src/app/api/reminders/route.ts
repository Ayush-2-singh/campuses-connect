import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/reminders — get user's reminders */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', user.id)
    .order('remind_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminders: data || [] })
}

/** POST /api/reminders — create a reminder */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, reminder_type, entity_type, entity_id, remind_at, is_recurring, recurrence } = body
  if (!title || !remind_at) return NextResponse.json({ error: 'title and remind_at required' }, { status: 400 })

  const { data, error } = await supabase.from('reminders').insert({
    user_id: user.id,
    title,
    description: description || null,
    reminder_type: reminder_type || 'custom',
    entity_type: entity_type || null,
    entity_id: entity_id || null,
    remind_at,
    is_recurring: is_recurring || false,
    recurrence: recurrence || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminder: data }, { status: 201 })
}

/** DELETE /api/reminders?id=xxx — delete a reminder */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('reminders').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
