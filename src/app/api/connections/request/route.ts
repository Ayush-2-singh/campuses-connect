import { NextRequest, NextResponse } from 'next/server'
import { requireAuthLite } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * POST /api/connections/request — send a connect request.
 *
 * WHY A SERVER ROUTE
 *
 * The browser insert was failing with an opaque RLS error even for two global
 * profiles. The table's INSERT policy depends on `can_interact_with_profile`,
 * and debugging that from the client is impossible. This route authenticates
 * the caller from the session, re-checks the same interaction-scope rule with
 * the service-role client, and returns a reason the UI can print.
 *
 * The reply is one of:
 *   pending · accepted · campus_only · blocked · not_found · self · error
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function handlePost(req: NextRequest) {
  const guard = await requireAuthLite(req)
  if (!guard.ok) return guard.response
  const meId = guard.auth.userId

  let body: { receiverId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const receiverId = String(body?.receiverId || '')
  if (!UUID.test(receiverId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (receiverId === meId) return NextResponse.json({ error: 'self' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const [{ data: me }, { data: target }] = await Promise.all([
    admin.from('profiles').select('id, interaction_scope, campus_id').eq('id', meId).maybeSingle(),
    admin
      .from('profiles')
      .select('id, interaction_scope, campus_id, is_public, is_active')
      .eq('id', receiverId)
      .maybeSingle(),
  ])

  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!target || target.is_active === false || target.is_public === false) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Mirrors can_interact_with_profile (migration 034).
  const myScope = me.interaction_scope || 'global'
  const theirScope = target.interaction_scope || 'global'
  const campusBlocked =
    (myScope === 'campus' && (!me.campus_id || me.campus_id !== target.campus_id)) ||
    (theirScope === 'campus' && (!target.campus_id || target.campus_id !== me.campus_id))
  if (campusBlocked) return NextResponse.json({ error: 'campus_only' }, { status: 403 })

  const { data: rows, error: readError } = await admin
    .from('connections')
    .select('id, requester_id, receiver_id, status')
    .or(
      `and(requester_id.eq.${meId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${meId})`
    )
  if (readError) {
    console.error('[connections/request] read failed:', readError)
    return NextResponse.json({ error: 'error', message: readError.message }, { status: 500 })
  }

  // Prefer accepted, then the incoming request (accepting closes the pair).
  const existing =
    rows?.find((r: any) => r.status === 'accepted') ||
    rows?.find((r: any) => r.receiver_id === meId && r.status === 'pending') ||
    rows?.[0]

  if (existing) {
    if (existing.status === 'accepted') return NextResponse.json({ status: 'accepted' })
    if (existing.status === 'blocked') return NextResponse.json({ error: 'blocked' }, { status: 403 })
    if (existing.status === 'pending' && existing.requester_id === meId) {
      return NextResponse.json({ status: 'pending', id: existing.id })
    }
    if (existing.status === 'pending' && existing.receiver_id === meId) {
      const { error: acceptError } = await admin
        .from('connections')
        .update({ status: 'accepted' })
        .eq('id', existing.id)
      if (acceptError) {
        console.error('[connections/request] accept failed:', acceptError)
        return NextResponse.json({ error: 'error', message: acceptError.message }, { status: 500 })
      }
      await admin.from('notifications').insert({
        recipient_id: receiverId,
        actor_id: meId,
        type: 'connection_accepted',
        ref_type: 'connection',
        ref_id: existing.id,
        title: 'Connection accepted',
        body: 'Your connection request was accepted — you can now message each other',
      })
      return NextResponse.json({ status: 'accepted', id: existing.id })
    }

    // A declined row is reusable: flip it back to pending in the current
    // direction instead of inserting (which would hit the unique pair index).
    if (existing.status === 'declined') {
      const { error: reopenError } = await admin
        .from('connections')
        .update({ status: 'pending', requester_id: meId, receiver_id: receiverId })
        .eq('id', existing.id)
      if (reopenError) {
        console.error('[connections/request] reopen failed:', reopenError)
        return NextResponse.json({ error: 'error', message: reopenError.message }, { status: 500 })
      }
      await admin.from('notifications').insert({
        recipient_id: receiverId,
        actor_id: meId,
        type: 'connection_request',
        ref_type: 'connection',
        ref_id: existing.id,
        title: 'New connection request',
        body: 'Someone wants to connect with you',
      })
      return NextResponse.json({ status: 'pending', id: existing.id })
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('connections')
    .insert({ requester_id: meId, receiver_id: receiverId, status: 'pending' })
    .select('id')
    .single()

  if (insertError) {
    // A concurrent send can hit the unique pair index — that is still a sent
    // request, not a failure.
    if ((insertError as any).code === '23505') return NextResponse.json({ status: 'pending' })
    console.error('[connections/request] insert failed:', insertError)
    return NextResponse.json({ error: 'error', message: insertError.message, code: insertError.code }, { status: 500 })
  }

  return NextResponse.json({ status: 'pending', id: inserted?.id })
}

/**
 * JSON in, JSON out — including on a crash.
 *
 * A thrown error used to surface as an HTML 500 page, so `res.json()` failed in
 * the browser and every failure looked like "Could not send the request" with
 * no reason. Now the real message reaches the toast.
 */
export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'error', message: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }
  try {
    return await handlePost(req)
  } catch (err) {
    console.error('[connections/request] crashed:', err)
    return NextResponse.json(
      { error: 'error', message: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    )
  }
}
