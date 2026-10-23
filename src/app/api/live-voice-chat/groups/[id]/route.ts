import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, scopeFilterFor } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * DELETE /api/live-voice-chat/groups/[id] — remove a room.
 *
 * Who may:
 *   • the room's creator;
 *   • a member whose `live_voice_chat_members.role` is `admin` (the room's own
 *     moderator, assigned in the DB);
 *   • a platform admin (any room);
 *   • a campus admin, for rooms scoped to their campus only.
 *
 * Members, calls and participants all reference the group with ON DELETE
 * CASCADE, so one delete closes the room cleanly. The action is written to
 * `audit_log` before the response, because deleting a live room is exactly the
 * kind of destructive act an operator has to be able to trace later.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response
  const { userId, adminTypes, grants } = auth.auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Room id required.' }, { status: 400 })

  const admin = getSupabaseAdmin()

  const { data: group, error } = await admin
    .from('live_voice_chat_groups')
    .select('id, name, created_by, campus_id')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!group) return NextResponse.json({ error: 'Room not found.' }, { status: 404 })

  let allowed = group.created_by === userId

  if (!allowed) {
    const { data: membership } = await admin
      .from('live_voice_chat_members')
      .select('role')
      .eq('group_id', id)
      .eq('user_id', userId)
      .maybeSingle()
    allowed = membership?.role === 'admin'
  }

  if (!allowed && adminTypes.length > 0) {
    const { isPlatform, canModerateRow } = scopeFilterFor({
      userId,
      profile: { id: userId },
      adminTypes,
      grants,
    })
    allowed = canModerateRow({
      campus_id: group.campus_id ?? null,
      college_id: null,
      community_id: null,
    })
    if (isPlatform) allowed = true
  }

  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden. Only the room creator, a room admin or a platform admin can delete this room.' },
      { status: 403 }
    )
  }

  const { error: deleteError } = await admin.from('live_voice_chat_groups').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  try {
    await admin.from('audit_log').insert({
      actor_id: userId,
      action: 'live_voice_chat.delete_group',
      entity_type: 'live_voice_chat_groups',
      metadata: { id, name: group.name, created_by: group.created_by },
    })
  } catch {
    // Best-effort: never fail a completed delete because the audit write failed.
  }

  return NextResponse.json({ success: true, deleted: 1 })
}
