'use client'

/**
 * LIVEKIT CALL LAYER — the actual room, and the ONLY place
 * `@livekit/components-react` is loaded from.
 *
 * It is dynamically imported by CallProvider and rendered only once a call has
 * a token, so the LiveKit bundle never lands on any other page's first paint.
 *
 * It sits ABOVE the routes (a fixed, non-blocking layer), which is what lets
 * the call survive navigation: the user can browse the app while the room
 * stays connected, with only the compact bar visible.
 */

import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import CallSurface from '@/components/voice/CallSurface'

export default function LiveKitCallLayer({
  token,
  url,
  onConnected,
  onDisconnected,
  onError,
}: {
  token: string
  url: string
  onConnected: () => void
  onDisconnected: () => void
  onError: (err: unknown) => void
}) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect
      audio
      video={false}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      onError={onError}
      // Never blocks the page below: only the surface's own boxes take pointer
      // events (see .lvc-layer in globals.css).
      className="lvc-layer"
    >
      <RoomAudioRenderer />
      <CallSurface />
    </LiveKitRoom>
  )
}
