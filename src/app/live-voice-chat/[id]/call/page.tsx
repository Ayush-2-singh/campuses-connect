'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useDataChannel,
  useTracks,
  VideoTrack,
} from '@livekit/components-react'
import type { TrackReferenceOrPlaceholder, TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

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
      if (!json.url) {
        return setError(
          'The voice server address is missing on this deployment. Add NEXT_PUBLIC_LIVEKIT_URL (or LIVEKIT_URL) to the environment and redeploy.'
        )
      }
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
  const { localParticipant } = useLocalParticipant()
  const { emojiEvents, sendReaction } = useReactions(localParticipant?.identity)
  const callId = useSearchParams().get('callId') || ''

  // ── GMeet-style layout control ─────────────────────────────────────
  // 'auto'   → screen-share stage when someone presents, tiles otherwise
  // 'grid'   → everyone as equal tiles, no stage
  // 'spotlight' → the pinned (or loudest/first) person fills the stage
  // Pinned identity survives layout switches; stored per session.
  const [layout, setLayout] = useState<'auto' | 'grid' | 'spotlight'>(() => {
    try {
      const v = window.sessionStorage.getItem('cc-voice-layout')
      return v === 'grid' || v === 'spotlight' || v === 'auto' ? v : 'auto'
    } catch {
      return 'auto'
    }
  })
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const changeLayout = useCallback((next: 'auto' | 'grid' | 'spotlight') => {
    setLayout(next)
    try {
      window.sessionStorage.setItem('cc-voice-layout', next)
    } catch {
      /* private browsing — layout just won't persist */
    }
  }, [])

  // ── Presence heartbeat ──────────────────────────────────────────────
  // Every surface derives LIVE from "a user is ACTUALLY inside", and the
  // server decides that from this beat (fresh = heartbeat < 150s old, see
  // 20260927_voice_live_truth.sql). A crashed tab stops beating, gets swept
  // as left within ~5 minutes and its call ends for real — so no room can
  // show LIVE with nobody in it. Errors are ignored on purpose: before the
  // migration is applied the RPC simply doesn't exist, and the leave RPC on
  // unmount still cleans up.
  useEffect(() => {
    if (!connected || !callId) return
    const beat = () => {
      void supabase.rpc('touch_live_voice_chat_heartbeat', { p_call_id: callId })
    }
    beat()
    const timer = setInterval(beat, 30_000)
    return () => clearInterval(timer)
  }, [connected, callId])

  const screenShareRef = useTracks([Track.Source.ScreenShare])[0]

  // Spotlight target: the pinned person, else the first remote participant,
  // else me — there is always someone on stage in spotlight mode.
  const spotlightId = pinnedId ?? participants.find((p) => !p.isLocal)?.identity ?? localParticipant?.identity ?? null

  return (
    <div style={{ minHeight: '72vh', display: 'flex', flexDirection: 'column' }}>
      <Header connected={connected} count={participants.length} onBack={onLeave} />
      {/* Layout switcher — Auto / Grid / Spotlight, like Meet's tile buttons. */}
      <LayoutSwitcher layout={layout} onChange={changeLayout} />

      {(layout === 'auto' || layout === 'spotlight') && (
        <Stage
          mode={layout === 'spotlight' ? 'spotlight' : 'share'}
          participants={participants}
          shareRef={screenShareRef}
          spotlightId={spotlightId}
          pinnedId={pinnedId}
          onUnpin={() => setPinnedId(null)}
        />
      )}

      <Participants
        participants={participants}
        emojiEvents={emojiEvents}
        layout={layout}
        pinnedId={pinnedId}
        spotlightId={spotlightId}
        onPin={(identity) => setPinnedId((cur) => (cur === identity ? null : identity))}
      />
      <div style={{ flex: 1 }} />
      <Controls callId={callId} onLeave={onLeave} sendReaction={sendReaction} />
    </div>
  )
}

/**
 * LAYOUT SWITCHER — Meet's three view modes. Segmented control, one press to
 * reflow the room; the choice persists for the session.
 */
function LayoutSwitcher({
  layout,
  onChange,
}: {
  layout: 'auto' | 'grid' | 'spotlight'
  onChange: (next: 'auto' | 'grid' | 'spotlight') => void
}) {
  const MODES: { key: 'auto' | 'grid' | 'spotlight'; label: string; icon: string }[] = [
    { key: 'auto', label: 'Auto', icon: 'layout' },
    { key: 'grid', label: 'Grid', icon: 'users' },
    { key: 'spotlight', label: 'Spotlight', icon: 'eye' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Call layout"
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        gap: 2,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 3,
        marginBottom: 14,
      }}
    >
      {MODES.map((m) => {
        const active = layout === m.key
        return (
          <button
            key={m.key}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              borderRadius: 9,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}
          >
            <Icon name={m.icon} size={14} strokeWidth={2.2} />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * STAGE — the big tile above the strip.
 *   share mode     → whoever is sharing their screen (Meet-style)
 *   spotlight mode → the pinned/loudest person's camera, or their avatar
 * Renders nothing when there is nothing to show (e.g. auto with no share).
 */
function Stage({
  mode,
  participants,
  shareRef,
  spotlightId,
  pinnedId,
  onUnpin,
}: {
  mode: 'share' | 'spotlight'
  participants: ReturnType<typeof useParticipants>
  shareRef?: TrackReferenceOrPlaceholder
  spotlightId: string | null
  pinnedId: string | null
  onUnpin: () => void
}) {
  const camRefs = useTracks([Track.Source.Camera])

  // A placeholder reference (publication still undefined) can't be rendered —
  // treat it exactly like "nothing is being shared".
  const share = mode === 'share' && shareRef && shareRef.publication ? (shareRef as TrackReference) : undefined

  if (mode === 'share' && !share) return null

  const person = participants.find((p) => p.identity === spotlightId)
  const camRef = camRefs.find((r) => r.participant.identity === spotlightId)
  const name = person?.name || person?.identity || 'Student'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxHeight: '48vh',
        aspectRatio: '16 / 9',
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#000',
        marginBottom: 14,
        flexShrink: 0,
      }}
    >
      {share ? (
        // muted: shared-screen audio flows through RoomAudioRenderer
        <VideoTrack trackRef={share} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : camRef ? (
        <VideoTrack
          trackRef={camRef}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            ...(person?.isLocal ? { transform: 'scaleX(-1)' } : null),
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'linear-gradient(160deg, var(--bg-secondary), var(--bg-page))',
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              fontWeight: 800,
              color: 'var(--accent-text)',
              background: 'var(--accent-light)',
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {name}
            {person?.isLocal ? ' (You)' : ''}
          </p>
        </div>
      )}

      {/* name chip */}
      <span
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11.5,
          fontWeight: 700,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          padding: '4px 9px',
          borderRadius: 8,
        }}
      >
        {share ? (
          <>
            <Icon name="screen-share" size={13} />
            {share.participant.isLocal ? `${name} · you are presenting` : `${name} is presenting`}
          </>
        ) : (
          <>
            <Icon name="eye" size={13} />
            {name}
            {person?.isLocal ? ' (You)' : ''}
          </>
        )}
      </span>

      {/* pinned chip — click to release, like Meet */}
      {pinnedId && (
        <button
          onClick={onUnpin}
          aria-label="Unpin from stage"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            fontWeight: 700,
            color: '#fff',
            background: 'var(--accent)',
            border: 'none',
            padding: '5px 10px',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Icon name="pin" size={12} strokeWidth={2.4} />
          Pinned
        </button>
      )}
    </div>
  )
}

/** Room header: back-to-room, live badge + participant count. */
function Header({ connected, count, onBack }: { connected: boolean; count: number; onBack: () => void }) {
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
      <button onClick={onBack} aria-label="Back to room" className="lvc-back">
        <Icon name="chevron" size={18} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
      </button>
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
 * PRESENTATION STAGE — whoever is sharing their screen gets a big 16:9
 * stage above the tiles, like GMeet. Renders nothing when nobody shares.
 */
function ScreenStage() {
  const screenRefs = useTracks([Track.Source.ScreenShare])
  const ref = screenRefs[0]
  if (!ref) return null

  const who = ref.participant.name || ref.participant.identity || 'Student'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxHeight: '46vh',
        aspectRatio: '16 / 9',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#000',
        marginBottom: 14,
        flexShrink: 0,
      }}
    >
      {/* muted: shared-screen audio (if any) flows through RoomAudioRenderer */}
      <VideoTrack trackRef={ref} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      <span
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11.5,
          fontWeight: 700,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          padding: '4px 9px',
          borderRadius: 8,
        }}
      >
        <Icon name="screen-share" size={13} />
        {ref.participant.isLocal ? `${who} · you are presenting` : `${who} is presenting`}
      </span>
    </div>
  )
}

/**
 * PARTICIPANT TILES — one card per person (GMeet-style): speaking ring,
 * mute indicator, and floating emoji bursts anchored to the tile.
 * A participant with their camera on shows real video (mirrored for your
 * own tile); everyone else keeps the voice-first avatar tile.
 *
 * GMeet layout behaviours:
 *   • grid/strip hide the pinned/spotlighted person (they're on the stage)
 *   • every tile carries a Pin button — pinning puts that person on the stage
 *   • tile frames slowly cycle accent hues (animated gradient borders)
 */
function Participants({
  participants,
  emojiEvents,
  layout,
  pinnedId,
  spotlightId,
  onPin,
}: {
  participants: ReturnType<typeof useParticipants>
  emojiEvents: EmojiEvent[]
  layout: 'auto' | 'grid' | 'spotlight'
  pinnedId: string | null
  spotlightId: string | null
  onPin: (identity: string) => void
}) {
  const camRefs = useTracks([Track.Source.Camera])
  // In auto mode everyone stays in the strip; grid/spotlight lift the staged
  // person out so they aren't shown twice.
  const strip = participants.filter((p) => {
    if (layout === 'auto') return true
    return p.identity !== spotlightId
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 14,
        width: '100%',
      }}
    >
      {strip.map((p) => {
        const muted = !p.isMicrophoneEnabled
        const mineReactions = emojiEvents.filter((e) => e.from === p.identity)
        const camRef = camRefs.find((r) => r.participant.identity === p.identity)
        const isPinned = pinnedId === p.identity
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
            {/* pin control — Meet-style: keep this person on the stage */}
            <button
              onClick={() => onPin(p.identity)}
              aria-label={isPinned ? `Unpin ${p.name ?? 'participant'}` : `Pin ${p.name ?? 'participant'} to the stage`}
              aria-pressed={isPinned}
              title={isPinned ? 'Unpin' : 'Pin to stage'}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 30,
                height: 30,
                borderRadius: 9,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isPinned ? 'none' : '1px solid var(--border)',
                background: isPinned ? 'var(--accent)' : 'var(--bg)',
                color: isPinned ? 'var(--on-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                zIndex: 3,
              }}
            >
              <Icon name="pin" size={14} strokeWidth={2.2} />
            </button>
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

            {camRef ? (
              <div
                className="lvc-frame"
                style={{
                  width: '100%',
                  height: 124,
                  borderRadius: 12,
                  overflow: 'hidden',
                  margin: '0 auto 10px',
                  background: '#000',
                }}
              >
                <VideoTrack
                  trackRef={camRef}
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    // Meet-style: your own camera is mirrored, everyone else's is not.
                    ...(p.isLocal ? { transform: 'scaleX(-1)' } : null),
                  }}
                />
              </div>
            ) : (
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
            )}
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
            <p
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: muted ? 'var(--danger)' : 'var(--text-muted)',
                margin: '4px 0 0',
              }}
            >
              <Icon name={muted ? 'mic-off' : 'mic'} size={12} />
              {muted ? 'muted' : 'live'}
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
function useReactions(myIdentity: string | undefined) {
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
      // echo data messages back to the sender, so local echo is required —
      // and it must use MY participant identity so the burst renders on my
      // own tile, not a phantom 'local' key no tile matches.
      push(emoji, myIdentity ?? 'local')
    },
    [send, push, myIdentity]
  )

  return { emojiEvents, sendReaction }
}

/**
 * GMeet-style bottom control bar: emoji picker (3s float for everyone), mic,
 * camera, screen share, leave — every control an SVG button like Meet. Mic
 * and camera turn Meet-red while OFF; an active screen share lights up in
 * the accent. Mic state syncs to the DB via RPC; camera/screen share are
 * pure LiveKit toggles (the share button hides itself in browsers without
 * getDisplayMedia, e.g. older mobile Safari).
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
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const [emojiOpen, setEmojiOpen] = useState(false)

  // Screen capture does not exist on every browser — decide AFTER mount so
  // SSR and the first client render agree (no hydration mismatch).
  const [canScreenShare, setCanScreenShare] = useState(false)
  useEffect(() => {
    setCanScreenShare(!!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia))
  }, [])

  const REACTIONS = ['👏', '🔥', '❤️', '😂', '🎉', '👍', '🤯', '🙏']

  /** Meet palette for the round controls: neutral = on, red = off. */
  const ON = { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' } as const
  const OFF = { background: 'var(--danger)', color: '#fff' } as const

  async function toggleMic() {
    const nextEnabled = !isMicrophoneEnabled
    try {
      await localParticipant.setMicrophoneEnabled(nextEnabled)
    } catch {
      return // microphone permission denied — LiveKit keeps the current state
    }
    // Keep the DB's mute state in sync with the room.
    await supabase.rpc('set_live_voice_chat_mute', {
      p_call_id: callId,
      p_muted: !nextEnabled,
    })
  }

  /** Camera is pure LiveKit — no DB column; off by default, opt in like Meet. */
  async function toggleCamera() {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled)
    } catch {
      /* permission denied or no camera — the button simply stays off */
    }
  }

  async function toggleScreenShare() {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
    } catch {
      /* user cancelled the picker, or this browser refuses screen capture */
    }
  }

  return (
    <div className="lvc-controls">
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
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="smile" size={22} strokeWidth={2} />
        </button>
      </div>

      {/* Meet-style mic — red slashed SVG glyph while muted */}
      <button
        onClick={toggleMic}
        aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={!isMicrophoneEnabled}
        className="lvc-ctrl"
        style={isMicrophoneEnabled ? ON : OFF}
      >
        <Icon name={isMicrophoneEnabled ? 'mic' : 'mic-off'} size={23} />
      </button>

      {/* Camera — Meet-red while off; turning it on publishes your video */}
      <button
        onClick={toggleCamera}
        aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        aria-pressed={!isCameraEnabled}
        className="lvc-ctrl"
        style={isCameraEnabled ? ON : OFF}
      >
        <Icon name={isCameraEnabled ? 'video' : 'video-off'} size={23} />
      </button>

      {/* Screen share — accent while presenting; hidden where unsupported */}
      {canScreenShare && (
        <button
          onClick={toggleScreenShare}
          aria-label={isScreenShareEnabled ? 'Stop sharing your screen' : 'Share your screen'}
          aria-pressed={isScreenShareEnabled}
          className="lvc-ctrl"
          style={{
            background: isScreenShareEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: isScreenShareEnabled ? 'var(--on-accent)' : 'var(--text-primary)',
          }}
        >
          <Icon name="screen-share" size={23} />
        </button>
      )}

      <button onClick={onLeave} aria-label="Leave the call" className="lvc-leave">
        Leave
      </button>
    </div>
  )
}
