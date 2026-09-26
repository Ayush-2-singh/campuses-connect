'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useDataChannel,
} from '@livekit/components-react'
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
      className="mx-auto max-w-4xl p-4 md:p-6"
    >
      <RoomAudioRenderer />
      <CallShell connected={connected} onLeave={leave} />
    </LiveKitRoom>
  )
}

/**
 * Everything that needs live room context renders inside this shell.
 * ONE useDataChannelMessage instance lives here — reactions state and the
 * sender are passed down as props so every tile shares the same event list.
 */
function CallShell({ connected, onLeave }: { connected: boolean; onLeave: () => void }) {
  const participants = useParticipants()
  const { emojiEvents, sendReaction } = useReactions()
  const callId = useSearchParams().get('callId') || ''

  return (
    <div style={{ minHeight: '72vh', display: 'flex', flexDirection: 'column' }}>
      <Header connected={connected} count={participants.length} />
      <Participants participants={participants} emojiEvents={emojiEvents} />
      <div style={{ flex: 1 }} />
      <Controls callId={callId} onLeave={onLeave} sendReaction={sendReaction} />
    </div>
  )
}

/** Room header: live badge + participant count. */
function Header({ connected, count }: { connected: boolean; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
        color: 'var(--text-secondary)',
        fontSize: 13,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 800,
          color: connected ? 'var(--success-text, var(--accent-text))' : 'var(--text-muted)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? 'var(--success, var(--accent))' : 'var(--text-muted)',
            boxShadow: connected ? '0 0 8px var(--success, var(--accent))' : 'none',
          }}
        />
        {connected ? 'LIVE' : 'Connecting…'}
      </span>
      <span style={{ opacity: 0.6 }}>·</span>
      <span>{count} in call</span>
    </div>
  )
}

interface EmojiEvent {
  key: number
  emoji: string
  from: string
}

/**
 * PARTICIPANT TILES — one card per person (GMeet-style): speaking ring,
 * mute indicator, and floating emoji bursts anchored to the tile.
 */
function Participants({
  participants,
  emojiEvents,
}: {
  participants: ReturnType<typeof useParticipants>
  emojiEvents: EmojiEvent[]
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14,
        width: '100%',
      }}
    >
      {participants.map((p) => {
        const muted = !p.isMicrophoneEnabled
        const mineReactions = emojiEvents.filter((e) => e.from === p.identity)
        return (
          <div
            key={p.identity}
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 16,
              border: p.isSpeaking ? '2px solid var(--success, var(--accent))' : '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              padding: '22px 12px 14px',
              textAlign: 'center',
              boxShadow: p.isSpeaking
                ? '0 0 24px color-mix(in srgb, var(--success, var(--accent)) 25%, transparent)'
                : 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {/* floating emoji bursts from THIS participant */}
            {mineReactions.map((e) => (
              <span
                key={e.key}
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: `${18 + ((e.key * 37) % 60)}%`,
                  fontSize: 26,
                  pointerEvents: 'none',
                  animation: 'ccEmojiFloat 3s ease-out forwards',
                }}
              >
                {e.emoji}
              </span>
            ))}

            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                margin: '0 auto 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 800,
                color: p.isSpeaking ? 'var(--on-accent)' : 'var(--accent-text)',
                background: p.isSpeaking ? 'var(--success, var(--accent))' : 'var(--accent-light)',
                transition: 'background 0.2s ease',
              }}
            >
              {(p.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: 0,
              }}
            >
              {p.name ?? 'Student'}
              {p.isLocal ? ' (You)' : ''}
            </p>
            <p style={{ fontSize: 11, color: muted ? 'var(--danger)' : 'var(--text-muted)', margin: '4px 0 0' }}>
              {muted ? '🔇 muted' : '🎙 live'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Data-channel reactions: receive everyone's emoji (and send mine).
 * Topic 'reaction' — payload is just the emoji character. No DB, no polling:
 * the burst lives 3s in component state and disappears.
 */
function useReactions() {
  const [emojiEvents, setEmojiEvents] = useState<EmojiEvent[]>([])
  const seq = useRef(0)

  const push = useCallback((emoji: string, from: string) => {
    const key = ++seq.current
    setEmojiEvents((prev) => [...prev.slice(-14), { key, emoji, from }])
    window.setTimeout(() => {
      setEmojiEvents((prev) => prev.filter((e) => e.key !== key))
    }, 3000)
  }, [])

  const { send } = useDataChannel('reaction', (msg) => {
    // ReceivedDataMessage = { topic, payload: Uint8Array, from?: Participant }
    push(new TextDecoder().decode(msg.payload), msg.from?.identity ?? 'remote')
  })

  const sendReaction = useCallback(
    (emoji: string) => {
      try {
        send(new TextEncoder().encode(emoji), { reliable: false })
      } catch {
        /* channel not ready yet — the local burst still shows */
      }
      // Show my own reaction instantly (no round-trip wait). LiveKit does not
      // echo data messages back to the sender, so local echo is required.
      push(emoji, 'local')
    },
    [send, push]
  )

  return { emojiEvents, sendReaction }
}

/**
 * GMeet-style bottom control bar: emoji picker (3s float for everyone),
 * mic toggle, leave. Mic state also syncs to the DB via RPC.
 */
function Controls({
  callId,
  onLeave,
  sendReaction,
}: {
  callId: string
  onLeave: () => void
  sendReaction: (emoji: string) => void
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const [emojiOpen, setEmojiOpen] = useState(false)

  const REACTIONS = ['👏', '🔥', '❤️', '😂', '🎉', '👍', '🤯', '🙏']

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
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '18px 0 calc(16px + env(safe-area-inset-bottom, 0px))',
        flexWrap: 'wrap',
      }}
    >
      {/* emoji picker — reactions float up for ~3s, visible to everyone */}
      <div style={{ position: 'relative' }}>
        {emojiOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 64,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
              boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
              animation: 'ccCardUp 0.15s ease',
              zIndex: 5,
            }}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  sendReaction(emoji)
                  setEmojiOpen(false)
                }}
                aria-label={`Send ${emoji}`}
                style={{
                  fontSize: 24,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Send a reaction"
          aria-expanded={emojiOpen}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            fontSize: 20,
            cursor: 'pointer',
          }}
        >
          😀
        </button>
      </div>

      <button
        onClick={toggleMic}
        aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          border: 'none',
          background: isMicrophoneEnabled ? 'var(--bg-tertiary)' : 'var(--danger)',
          color: isMicrophoneEnabled ? 'var(--text-primary)' : '#fff',
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        {isMicrophoneEnabled ? '🎙️' : '🔇'}
      </button>

      <button
        onClick={onLeave}
        aria-label="Leave the call"
        style={{
          height: 60,
          padding: '0 26px',
          borderRadius: 30,
          border: 'none',
          background: 'var(--danger)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        Leave
      </button>
    </div>
  )
}
