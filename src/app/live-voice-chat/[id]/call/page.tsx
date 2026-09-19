'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants } from '@livekit/components-react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function CallPage() {
  return (
    <Suspense fallback={<p className="p-6 text-white/50">Loading…</p>}>
      <CallRoom />
    </Suspense>
  )
}

function CallRoom() {
  const { id: groupId } = useParams<{ id: string }>()
  const callId = useSearchParams().get('callId')
  const router = useRouter()

  const [conn, setConn] = useState<{ token: string; url: string } | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  // Guarantees the leave RPC runs at most once, whichever of connected-
  // disconnect / explicit leave / unmount happens first.
  const leftRef = useRef(false)

  useEffect(() => {
    async function getToken() {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt || !callId) return setError('Your session or the call id is missing.')

      const res = await fetch('/api/live-voice-chat/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ callId }),
      })
      const json = await res.json()
      if (!res.ok) return setError(json.error ?? 'Could not get a call token.')
      setConn(json)
    }
    getToken()
  }, [callId])

  const leave = useCallback(async () => {
    if (!leftRef.current) {
      leftRef.current = true
      if (callId) {
        await supabase.rpc('leave_live_voice_chat_call', { p_call_id: callId })
      }
    }
    router.push(`/live-voice-chat/${groupId}`)
  }, [callId, groupId, router])

  /**
   * Closing the tab, hitting back, or navigating away unmounts this page
   * without ever firing onDisconnected. Without this the participant would
   * stay in the participant row forever, so the room would show as LIVE with
   * somebody who already left and the call would never be allowed to end.
   */
  useEffect(() => {
    return () => {
      if (callId && !leftRef.current) {
        leftRef.current = true
        void supabase.rpc('leave_live_voice_chat_call', { p_call_id: callId })
      }
    }
  }, [callId])

  /** Turn the SDK's raw text into something a student can act on. */
  const describeError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err ?? '')
    if (/permission|notallowed|denied/i.test(message)) {
      return 'Microphone access was blocked. Allow the microphone for this site and join again.'
    }
    if (/token|unauthor|401|403/i.test(message)) {
      return 'Your call token was rejected. Rejoin the room to get a new one.'
    }
    if (/network|disconnect|websocket/i.test(message)) {
      return 'Lost the connection to the voice server. Check your internet and rejoin.'
    }
    return message || 'Could not connect to the voice room.'
  }

  if (error) return <p className="p-6 text-red-400">{error}</p>
  if (!conn) return <p className="p-6 text-white/50">Connecting to the call…</p>

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.url}
      connect
      audio
      video={false}
      onConnected={() => setConnected(true)}
      onError={(err) => setError(describeError(err))}
      onDisconnected={leave}
      className="mx-auto max-w-3xl p-4 md:p-6"
    >
      <RoomAudioRenderer />
      <p className="mb-4 text-sm text-white/50">{connected ? '🟢 Connected' : 'Connecting…'}</p>
      <Participants />
      <Controls callId={callId!} onLeave={leave} />
    </LiveKitRoom>
  )
}

function Participants() {
  const participants = useParticipants()
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
      {participants.map((p) => (
        <div
          key={p.identity}
          className={`rounded-xl border p-4 text-center ${
            p.isSpeaking ? 'border-green-400' : 'border-white/10'
          } bg-white/5`}
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-lg text-white">
            {(p.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <p className="truncate text-sm text-white">
            {p.name ?? 'Student'}
            {p.isLocal ? ' (You)' : ''}
          </p>
        </div>
      ))}
    </div>
  )
}

function Controls({ callId, onLeave }: { callId: string; onLeave: () => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()

  async function toggleMic() {
    const nextEnabled = !isMicrophoneEnabled
    await localParticipant.setMicrophoneEnabled(nextEnabled)
    // Keep the DB's mute state in sync with the room.
    await supabase.rpc('set_live_voice_chat_mute', {
      p_call_id: callId,
      p_muted: !nextEnabled,
    })
  }

  return (
    <div className="flex justify-center gap-3">
      <button
        onClick={toggleMic}
        className={`rounded-full px-6 py-3 text-sm font-medium ${
          isMicrophoneEnabled ? 'bg-white/10 text-white' : 'bg-red-500 text-white'
        }`}
      >
        {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
      </button>
      <button onClick={onLeave} className="rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white">
        Leave
      </button>
    </div>
  )
}
