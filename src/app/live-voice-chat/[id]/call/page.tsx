'use client'

import { Suspense, useEffect, useState } from 'react'
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
  const [error, setError] = useState('')

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

  async function leave() {
    if (callId) {
      await supabase.rpc('leave_live_voice_chat_call', { p_call_id: callId })
    }
    router.push(`/live-voice-chat/${groupId}`)
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
      onDisconnected={leave}
      className="mx-auto max-w-3xl p-4 md:p-6"
    >
      <RoomAudioRenderer />
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
