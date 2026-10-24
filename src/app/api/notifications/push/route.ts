import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { serverError } from '@/lib/api/errors'

/** POST /api/notifications/push — subscribe to push notifications */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: subscription churn costs rows and later push delivery —
  // 30/hour is far beyond any legitimate re-subscribe pattern.
  if (!(await checkRateLimit(user.id, 'push:subscribe', 30, 60))) {
    return NextResponse.json({ error: 'Too many requests — try again later' }, { status: 429 })
  }

  const body = await req.json()
  const { endpoint, p256dh, auth: authKey } = body
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'endpoint, p256dh, and auth required' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: req.headers.get('user-agent') || null,
    },
    { onConflict: 'user_id,endpoint' }
  )

  if (error) return serverError('notifications/push', error)
  return NextResponse.json({ ok: true })
}

/** DELETE /api/notifications/push — unsubscribe */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint')
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  } else {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
  }
  return NextResponse.json({ ok: true })
}
