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
// DELETE — Delete colleges, campuses, or departments
// ═══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const admin = auth.auth

  const body = await request.json()
  const { action, id } = body

  if (!action || !id) {
    return NextResponse.json({ error: 'action and id required' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  try {
    if (action === 'delete_college') {
      // Get all campuses for this college
      const { data: campuses } = await db
        .from('campuses')
        .select('id')
        .eq('college_id', id)

      // Delete departments for each campus
      for (const campus of campuses || []) {
        await db.from('departments').delete().eq('campus_id', campus.id)
      }

      // Delete all campuses of this college
      await db.from('campuses').delete().eq('college_id', id)

      // Delete the college itself
      const { error } = await db.from('colleges').delete().eq('id', id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Log
      await db.from('audit_log').insert({
        actor_id: admin.userId,
        action: 'campus.delete_college',
        entity_type: 'college',
        entity_id: id,
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'delete_campus') {
      // Delete departments for this campus
      await db.from('departments').delete().eq('campus_id', id)

      // Delete the campus
      const { error } = await db.from('campuses').delete().eq('id', id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Log
      await db.from('audit_log').insert({
        actor_id: admin.userId,
        action: 'campus.delete_campus',
        entity_type: 'campus',
        entity_id: id,
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'delete_department') {
      const { error } = await db.from('departments').delete().eq('id', id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Log
      await db.from('audit_log').insert({
        actor_id: admin.userId,
        action: 'campus.delete_department',
        entity_type: 'department',
        entity_id: id,
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
