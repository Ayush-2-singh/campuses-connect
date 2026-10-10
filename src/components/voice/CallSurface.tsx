'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useDataChannel, useLocalParticipant, useParticipants, useTracks, VideoTrack } from '@livekit/components-react'
import type { TrackReferenceOrPlaceholder, TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import CallGamePanel, { CALL_GAME_LABELS, type CallGame, type CallGameInvite } from '@/components/games/CallGamePanel'
import CallChatPanel from '@/components/voice/CallChatPanel'
import { callScreenPath, useCall } from '@/components/voice/callContext'
import { appendChatMessage, cleanChatText, unreadCount, type CallChatMessage } from '@/lib/callChat'

const supabase = createClient()

/**
 * CALL SURFACE — everything the person in a call sees.
 *
 * It is mounted ONCE by CallProvider, above the routes (see
 * LiveKitCallLayer), so the same component renders two very different things
 * without the connection ever moving:
 *   • the full call screen, while the user is on the call route;
 *   • a compact bar that follows them everywhere else in the app.
 *
 * Living above the router is what makes navigation safe by construction: back
 * (or any other route change) can not unmount the LiveKit room, so it can not
 * hang anybody up — and because we are no longer stranding the user on an
 * emptied call screen, the previous page's real content is what they see.
 *
 * ONE useDataChannel instance per topic lives here — reactions, chat and game
 * invites — and the sender is passed down as props so every tile shares the
 * same event list.
 */
export default function CallSurface() {
  const { connected, session, leave, callUrl } = useCall()
  const router = useRouter()
  const pathname = usePathname()

  const callId = session?.callId ?? ''
  const groupId = session?.groupId ?? ''

  // Full screen ONLY on the call route. Anywhere else this component is the
  // compact bar — which is exactly why browser back shows the website rather
  // than an emptied call screen.
  const fullScreen = !!groupId && pathname === callScreenPath(groupId)

  /** Leave the call screen without leaving the call: back to the voice room,
   *  where the compact bar keeps the call one tap away. */
  const minimize = useCallback(() => {
    if (groupId) router.push(`/live-voice-chat/${groupId}`)
  }, [groupId, router])

  /** Come back to the full call screen (same LiveKit room — no reconnect). */
  const openCallScreen = useCallback(() => {
    if (callUrl) router.push(callUrl)
  }, [callUrl, router])

  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const { emojiEvents, sendReaction } = useReactions(localParticipant?.identity)

  // ── IN-CALL MESSAGES ───────────────────────────────────────────────────
  const { messages, sendChat } = useCallChat(localParticipant?.identity, localParticipant?.name)
  const [chatOpen, setChatOpen] = useState(false)
  // Read cursor = the key of the newest line the panel has shown. Anything
  // newer, written by somebody ELSE, feeds the control's unread badge.
  const [readKey, setReadKey] = useState(0)
  const unread = unreadCount(messages, readKey)
  useEffect(() => {
    if (chatOpen && messages.length) setReadKey(messages[messages.length - 1].key)
  }, [chatOpen, messages])

  // ── TALK + PLAY ───────────────────────────────────────────────────────────
  // A second data channel (next to 'reaction') carries exactly one payload:
  // { game, code }. When somebody creates a room inside the panel the code
  // goes out to everyone on the call, so joining needs no typing, no copy
  // paste and no one leaves the conversation — the panel mounts the game
  // while LiveKit keeps the mic open underneath.
  const [gamesOpen, setGamesOpen] = useState(false)
  const [game, setGame] = useState<CallGame | null>(null)
  const [gameCode, setGameCode] = useState<string | undefined>(undefined)
  const [invite, setInvite] = useState<(CallGameInvite & { key: number }) | null>(null)

  const { send: sendGame } = useDataChannel('game', (msg) => {
    let parsed: Partial<CallGameInvite> | null = null
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload)) as CallGameInvite
    } catch {
      return // malformed payload, e.g. a peer still on an older bundle
    }
    if (parsed?.game !== 'typing' && parsed?.game !== 'math') return
    if (typeof parsed.code !== 'string' || !/^\d{6}$/.test(parsed.code)) return
    setInvite({
      game: parsed.game,
      code: parsed.code,
      from: msg.from?.name || 'Someone in the call',
      key: Date.now(),
    })
  })

  // An invite that is never tapped should not sit on the screen all call.
  useEffect(() => {
    if (!invite) return
    const timer = window.setTimeout(() => setInvite(null), 20_000)
    return () => window.clearTimeout(timer)
  }, [invite])

  const startGame = useCallback((next: CallGame) => {
    setGame(next)
    setGameCode(undefined)
    setInvite(null)
    setGamesOpen(true)
  }, [])

  const joinInvite = useCallback(() => {
    if (!invite) return
    setGame(invite.game)
    setGameCode(invite.code)
    setInvite(null)
    setGamesOpen(true)
  }, [invite])

  /** Pushes the creator's room code to everyone else on the call — LiveKit
   *  never echoes a data message back to its sender, so the player who made
   *  the room simply stays where they are; nothing to re-render for them.
   *
   *  Deliberately does NOT write back into `gameCode`: that state is only
   *  ever set by `joinInvite`, and pushing the creator's own code into it
   *  would change the game's `key` and remount a room that is already
   *  running (QuickMath would then re-join itself and trip nickname_taken). */
  const broadcastRoom = useCallback(
    (next: CallGame, code: string) => {
      try {
        sendGame(new TextEncoder().encode(JSON.stringify({ game: next, code })), { reliable: true })
      } catch {
        /* channel not open yet — the code is still printed in the lobby */
      }
    },
    [sendGame]
  )

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

  // The heartbeat lives in CallProvider with the connection itself, so it
  // keeps beating no matter which route the user is reading.

  const screenShareRef = useTracks([Track.Source.ScreenShare])[0]

  // Spotlight target: the pinned person, else the first remote participant,
  // else me — there is always someone on stage in spotlight mode.
  const spotlightId = pinnedId ?? participants.find((p) => !p.isLocal)?.identity ?? localParticipant?.identity ?? null

  // Off the call route: the same LiveKit room, shrunk to a bar that follows the
  // user around the app. Every hook above has already run, and nothing mounts
  // or unmounts the room — that lives above the router.
  if (!fullScreen) {
    return <CallBar callId={callId} count={participants.length} onOpen={openCallScreen} onLeave={leave} />
  }

  return (
    <div className="lvc-layer-full">
      <div className="lvc-screen">
        <Header connected={connected} count={participants.length} onBack={minimize} />

        {/* The stage takes the full width; the messages panel FLOATS above the
          call so the user can drag it wherever the video is not. It clamps
          itself inside the viewport and above the control bar (see
          lib/floatingPanel.ts), so mic / leave stay reachable. */}
        <div>
          {gamesOpen ? (
            <CallGamePanel
              game={game}
              roomCode={gameCode}
              participantCount={participants.length}
              participants={participants.map((p) => ({
                id: p.identity,
                name: p.name?.trim() || 'Student',
              }))}
              onPick={startGame}
              onRoomReady={broadcastRoom}
              onClose={() => {
                setGamesOpen(false)
                setGame(null)
                setGameCode(undefined)
              }}
            />
          ) : (
            <>
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
            </>
          )}
        </div>

        {chatOpen && <CallChatPanel messages={messages} onSend={sendChat} onClose={() => setChatOpen(false)} />}

        {/* Someone on the call started a game — one tap joins their room. */}
        {invite && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '10px 12px',
              marginBottom: 12,
              animation: 'ccCardUp 0.15s ease',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="gamepad" size={17} />
            </span>
            <p style={{ flex: 1, minWidth: 160, fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
              <strong>{invite.from}</strong> started {CALL_GAME_LABELS[invite.game]} — room {invite.code}
            </p>
            <button
              onClick={joinInvite}
              style={{
                minHeight: 40,
                padding: '0 18px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Join
            </button>
            <button
              onClick={() => setInvite(null)}
              aria-label="Dismiss the game invite"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Controls
          callId={callId}
          onLeave={leave}
          sendReaction={sendReaction}
          gamesOpen={gamesOpen}
          onOpenGames={() => setGamesOpen((open) => !open)}
          chatOpen={chatOpen}
          unread={unread}
          onOpenChat={() => setChatOpen((open) => !open)}
        />
      </div>
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

/**
 * Room header: live badge + participant count, and the minimize control.
 *
 * The top-left control used to LEAVE the call; it now only collapses the
 * screen (see CallBar), so it wears a minimize glyph instead of a
 * back chevron — a back arrow that quietly drops you out of a live call is
 * exactly the surprise this replaced.
 */
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
      <button
        onClick={onBack}
        aria-label="Minimize the call"
        title="Minimize — you stay in the call"
        className="lvc-back"
      >
        <Icon name="minimize" size={18} strokeWidth={2.4} />
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
 * CALL BAR — the call, compact, on every page.
 *
 * This is what the call looks like off the call route: the user keeps talking
 * while they read the feed, their campus, or any other screen, and the bar
 * rides along. Nothing here is torn down — RoomAudioRenderer is mounted by the
 * LiveKit layer above the router, so audio keeps flowing and the room stays
 * live until the user actually leaves.
 *
 * Leaving is explicit: the Leave button, or closing the tab.
 */
function CallBar({
  callId,
  count,
  onOpen,
  onLeave,
}: {
  callId: string
  count: number
  /** Bring the full call screen back (same room — nothing reconnects). */
  onOpen: () => void
  onLeave: () => void
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()

  const ON = { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' } as const
  const OFF = { background: 'var(--danger)', color: '#fff' } as const

  /** Same mic path as the full control bar: LiveKit first, then the DB's
   *  mute state, so the room's roster never disagrees with the mic. */
  async function toggleMic() {
    const nextEnabled = !isMicrophoneEnabled
    try {
      await localParticipant.setMicrophoneEnabled(nextEnabled)
    } catch {
      return // microphone permission denied — LiveKit keeps the current state
    }
    await supabase.rpc('set_live_voice_chat_mute', { p_call_id: callId, p_muted: !nextEnabled })
  }

  return (
    <div className="lvc-mini" role="status" aria-label="In a call">
      <span className="lvc-mini-dot" aria-hidden="true" />
      <span className="lvc-mini-text">
        <strong>Still in the call</strong>
        <span>{count} in call · you are connected</span>
      </span>

      <button
        onClick={toggleMic}
        aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={!isMicrophoneEnabled}
        className="lvc-mini-btn"
        style={isMicrophoneEnabled ? ON : OFF}
      >
        <Icon name={isMicrophoneEnabled ? 'mic' : 'mic-off'} size={19} />
      </button>

      <button onClick={onOpen} className="lvc-mini-restore" aria-label="Back to the call screen">
        <Icon name="maximize" size={16} strokeWidth={2.4} />
        <span>Back to call</span>
      </button>

      <button onClick={onLeave} className="lvc-mini-leave" aria-label="Leave the call">
        <span>Leave</span>
      </button>
    </div>
  )
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
 * IN-CALL MESSAGES — Meet's chat, carried by the call's own data channel.
 *
 * Topic 'chat' next to 'reaction' and 'game': the payload is just { text }.
 * No DB row and no realtime subscription, for the same reasons the reactions
 * skip them — the thread belongs to the call, so it arrives in sync with the
 * LiveKit room and disappears when the call ends (late joiners see nothing
 * that was said before them, which is the honest behaviour for a live room).
 */
function useCallChat(myIdentity: string | undefined, myName: string | undefined) {
  const [messages, setMessages] = useState<CallChatMessage[]>([])
  const seq = useRef(0)

  const push = useCallback((msg: Omit<CallChatMessage, 'key'>) => {
    const key = ++seq.current
    // appendChatMessage caps the thread: a data-channel line is small, but an
    // all-night call must not hold thousands of them in state.
    setMessages((prev) => appendChatMessage(prev, msg, key))
  }, [])

  const { send } = useDataChannel('chat', (msg) => {
    let parsed: { text?: unknown } | null = null
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload)) as { text?: unknown }
    } catch {
      return // malformed payload, e.g. a peer still on an older bundle
    }
    const text = cleanChatText(parsed?.text)
    if (!text) return
    push({
      id: msg.from?.identity ?? 'remote',
      name: msg.from?.name?.trim() || msg.from?.identity || 'Someone in the call',
      text,
      at: Date.now(),
      mine: false,
    })
  })

  const sendChat = useCallback(
    (text: string) => {
      const body = cleanChatText(text)
      if (!body) return
      try {
        // reliable: a dropped chat line reads as being ignored.
        send(new TextEncoder().encode(JSON.stringify({ text: body })), { reliable: true })
      } catch {
        /* channel not ready yet — my own message still shows locally */
      }
      // LiveKit does not echo a data message back to its sender, so local echo
      // is required — same reason the reaction burst is shown instantly, and
      // it must carry MY identity so the line is grouped as mine.
      push({ id: myIdentity ?? 'local', name: myName?.trim() || 'You', text: body, at: Date.now(), mine: true })
    },
    [send, push, myIdentity, myName]
  )

  return { messages, sendChat }
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
  gamesOpen,
  onOpenGames,
  chatOpen,
  unread,
  onOpenChat,
}: {
  callId: string
  onLeave: () => void
  sendReaction: (emoji: string) => void
  gamesOpen: boolean
  onOpenGames: () => void
  chatOpen: boolean
  unread: number
  onOpenChat: () => void
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

      {/* Messages — Meet's chat. The badge counts only lines written by other
          people that the panel has not shown yet. */}
      <button
        onClick={onOpenChat}
        aria-label={chatOpen ? 'Close in-call messages' : 'Open in-call messages'}
        aria-expanded={chatOpen}
        className="lvc-ctrl lvc-chat-toggle"
        style={chatOpen ? { background: 'var(--accent)', color: 'var(--on-accent)' } : ON}
      >
        <Icon name="message" size={23} />
        {unread > 0 && (
          <span aria-label={`${unread} unread messages`} className="lvc-chat-badge">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Games — opens the in-call panel: play together without hanging up. */}
      <button
        onClick={onOpenGames}
        aria-label={gamesOpen ? 'Close the games panel' : 'Play a game with the call'}
        aria-expanded={gamesOpen}
        className="lvc-ctrl"
        style={gamesOpen ? { background: 'var(--accent)', color: 'var(--on-accent)' } : ON}
      >
        <Icon name="gamepad" size={23} />
      </button>

      <button onClick={onLeave} aria-label="Leave the call" className="lvc-leave">
        Leave
      </button>
    </div>
  )
}
