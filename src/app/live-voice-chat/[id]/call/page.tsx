'use client'

/**
 * /live-voice-chat/[id]/call — a THIN route.
 *
 * The call itself is NOT mounted here any more. It lives above the router, in
 * CallProvider, because that is the only way navigation can stop being
 * destructive: while the LiveKit room was owned by this route, leaving the
 * page unmounted it and ran the leave RPC, so back / minimise could never mean
 * anything except "hang up".
 *
 * All this page does is carry the room and call id from the URL to the
 * provider. The full call screen then paints over it (see CallSurface), and
 * the moment the user navigates away the call simply carries on in its
 * compact bar — with the previous page's real content on screen.
 */

import { Suspense, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useCall } from '@/components/voice/callContext'

export default function CallPage() {
  return (
    <Suspense fallback={<p className="lcm-status">Loading…</p>}>
      <CallConnector />
    </Suspense>
  )
}

function CallConnector() {
  const { id: groupId } = useParams<{ id: string }>()
  const callId = useSearchParams().get('callId') ?? ''
  const { session, error, connect, leave } = useCall()

  // Joining is idempotent: coming back to this screen reuses the live room
  // instead of reconnecting (see connect()).
  useEffect(() => {
    if (callId) connect(callId, groupId)
  }, [callId, groupId, connect])

  if (error) {
    return (
      <div className="lcm-status">
        <p style={{ margin: '0 0 10px', color: 'var(--danger)' }}>{error}</p>
        <button
          onClick={leave}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Back to the voice room
        </button>
      </div>
    )
  }

  // A link with no call id can never join anything — say so instead of sitting
  // on "Loading" forever.
  if (!callId)
    return <p className="lcm-status">This call link is missing its call id. Open the voice room and join again.</p>

  // The provider paints the real screen on top of this as soon as the handshake
  // finishes; until then, say what is happening rather than showing nothing.
  return <p className="lcm-status">{session ? 'Connecting to the call…' : 'Loading the call…'}</p>
}
