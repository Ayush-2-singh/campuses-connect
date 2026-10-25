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
import CallCodePad from '@/components/voice/CallCodePad'
import CallMusicPanel from '@/components/voice/CallMusicPanel'
import EmojiPicker, { useDismiss } from '@/components/voice/EmojiPicker'
import { callScreenPath, useCall } from '@/components/voice/callContext'
import {
  appendChatMessage,
  cleanChatText,
  unreadCount,
  CALL_CHAT_MAX_THREAD,
  type CallChatMessage,
} from '@/lib/callChat'
import { DEFAULT_MUSIC_KEY, isMusicKey, musicCollection } from '@/lib/music'

const supabase = createClient()

/** What travels over the 'music' data channel: the shared playlist flavour. */
interface MusicInvite {
  key: string
  /** Human display name of the sharer (LiveKit participant name). */
  from?: string
}

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
 * ONE useDataChannel instance per topic lives here — reactions, chat, game
 * invites and shared music — and the sender is passed down as props so every
 * tile shares the same event list.
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
  const { messages, sendChat } = useCallChat(localParticipant?.identity, localParticipant?.name, callId, groupId)
  const { hands, myHandUp, toggleHand } = useHandRaise(localParticipant?.identity, localParticipant?.name)
  const [codeOpen, setCodeOpen] = useState(false)
  const { pad, updateCode, updateLanguage } = useSharedPad(localParticipant?.identity)
  // A raised hand disappears from the rail when its owner leaves: the data
  // channel has no "leave" event for it.
  const presentHands = hands.filter((h) => participants.some((p) => p.identity === h.id))
  const [chatOpen, setChatOpen] = useState(false)
  // Read cursor = the key of the newest line the panel has shown. Anything
  // newer, written by somebody ELSE, feeds the control's unread badge.
  const [readKey, setReadKey] = useState(0)
  const unread = unreadCount(messages, readKey)
  useEffect(() => {
    if (chatOpen && messages.length) setReadKey(messages[messages.length - 1].key)
  }, [chatOpen, messages])

  // ── LISTEN TOGETHER ───────────────────────────────────────────────────────
  // A third data channel (next to 'reaction' and 'game') carries one small
  // payload: { key } — the flavour of the Top 50 playlist somebody put on.
  // Every peer plays it from YouTube's official embed, the same one /global
  // uses. No file is uploaded, no row is written, nothing is billed: a shared
  // playlist is a live-room moment, so it stays on the wire like reactions,
  // chat and game invites.
  const [musicOpen, setMusicOpen] = useState(false)
  const [musicKey, setMusicKey] = useState(DEFAULT_MUSIC_KEY)
  const [musicAuto, setMusicAuto] = useState(false)
  /** The flavour *I* have shared with the call, or null. */
  const [sharedMusic, setSharedMusic] = useState<string | null>(null)
  const [musicInvite, setMusicInvite] = useState<MusicInvite | null>(null)

  const { send: sendMusic } = useDataChannel('music', (msg) => {
    let parsed: { key?: unknown } | null = null
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload)) as { key?: unknown }
    } catch {
      return // malformed payload, e.g. a peer still on an older bundle
    }
    // null = the sharer stopped; anything unrecognised is ignored, never trusted.
    if (parsed?.key === null) {
      setMusicInvite(null)
      return
    }
    if (!isMusicKey(parsed?.key)) return
    setMusicInvite({ key: parsed.key, from: msg.from?.name?.trim() || 'Someone in the call' })
  })

  // A music invite is ambient — longer-lived than a game invite, but it still
  // should not sit on the screen all call.
  useEffect(() => {
    if (!musicInvite) return
    const timer = window.setTimeout(() => setMusicInvite(null), 60_000)
    return () => window.clearTimeout(timer)
  }, [musicInvite])

  /** Pushes my pick to everyone else on the call. LiveKit never echoes a data
   *  message back to its sender, so my own player is the "local echo". */
  const shareMusic = useCallback(
    (key: string | null) => {
      setSharedMusic(key)
      try {
        sendMusic(new TextEncoder().encode(JSON.stringify({ key })), { reliable: true })
      } catch {
        /* channel not open yet — my own player still plays */
      }
    },
    [sendMusic]
  )

  /** One tap on an invite: open the panel on that flavour and prime autoplay
   *  so the tap the student just made is the only gesture needed. */
  const joinMusic = useCallback(() => {
    if (!musicInvite) return
    setMusicKey(musicInvite.key)
    setMusicAuto(true)
    setMusicOpen(true)
    setMusicInvite(null)
  }, [musicInvite])

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
  // UP TO THREE PEOPLE hold the stage at once: the first pin is the hero (the
  // big tile), the next two ride beside it as small tiles, and everyone else
  // stays in the compact strip below. Pins survive layout switches and a page
  // reload, stored per session.
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const raw = window.sessionStorage.getItem('cc-voice-pins')
      const list = JSON.parse(raw ?? '[]') as unknown
      return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, 3) : []
    } catch {
      return []
    }
  })

  const togglePin = useCallback((identity: string) => {
    setPinnedIds((cur) => {
      // Toggle off if already pinned; otherwise push to the end and keep the
      // newest THREE, so a fourth pin replaces the oldest companion first and
      // the hero is only dropped once everything else is.
      const next = cur.includes(identity) ? cur.filter((p) => p !== identity) : [...cur, identity].slice(-3)
      try {
        window.sessionStorage.setItem('cc-voice-pins', JSON.stringify(next))
      } catch {
        /* private browsing — pins just won't persist */
      }
      return next
    })
  }, [])

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

  // Stage roster: pins first (oldest pin = hero), then the first remote
  // person, then me. Spotlight always stages somebody; Auto stages only what
  // the user pinned; Grid stages nobody — every tile is equal there.
  const presentPins = pinnedIds.filter((id) => participants.some((p) => p.identity === id))
  const fallbackId = participants.find((p) => !p.isLocal)?.identity ?? localParticipant?.identity ?? null
  const heroId = (layout === 'spotlight' ? (presentPins[0] ?? fallbackId) : presentPins[0]) ?? null
  // Grid stages NOBODY by definition — every tile is equal there — so a pin
  // never silently removes somebody from the grid.
  const stagePeople = layout === 'grid' || !heroId ? [] : [heroId, ...presentPins.filter((id) => id !== heroId)]

  // Off the call route: the same LiveKit room, shrunk to a bar that follows the
  // user around the app. Every hook above has already run, and nothing mounts
  // or unmounts the room — that lives above the router.
  if (!fullScreen) {
    return (
      <>
        {/* OFF THE CALL SCREEN TOO — a reaction has to land wherever the
            person actually is. The overlay is fixed and pointer-transparent,
            so it rides over any page without touching it; before this, the
            recipient only ever saw reactions while sitting on the call screen,
            which read as "emoji nahi dikh rahe". */}
        <ReactionRise events={emojiEvents} participants={participants} localIdentity={localParticipant?.identity} />
        <CallBar
          callId={callId}
          count={participants.length}
          onOpen={openCallScreen}
          onLeave={leave}
          // The same sender the call screen uses, so a burst from the bar
          // lands on the same overlay (a second hook instance would show it
          // nowhere — its local echo would live in its own state).
          sendReaction={sendReaction}
        />
      </>
    )
  }

  return (
    <div className="lvc-layer-full">
      <div className="lvc-screen">
        <Header connected={connected} count={participants.length} onBack={minimize} />
        {presentHands.length > 0 && <HandRail hands={presentHands} />}

        {/* The stage takes the full width; the messages panel FLOATS above the
          call so the user can drag it wherever the video is not. It clamps
          itself inside the viewport and above the control bar (see
          lib/floatingPanel.ts), so mic / leave stay reachable. */}
        <div>
          {musicOpen ? (
            <CallMusicPanel
              key={musicKey}
              initialKey={musicKey}
              initialAutoPlay={musicAuto}
              sharedKey={sharedMusic}
              participantCount={participants.length}
              onShare={shareMusic}
              onClose={() => setMusicOpen(false)}
            />
          ) : codeOpen ? (
            <CallCodePad
              value={pad.code}
              language={pad.language}
              connected={participants.length}
              onCode={updateCode}
              onLanguage={updateLanguage}
              onClose={() => setCodeOpen(false)}
            />
          ) : gamesOpen ? (
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
                  stagePeople={stagePeople}
                  onUnpin={togglePin}
                />
              )}

              <Participants
                participants={participants}
                stagedIds={stagePeople}
                pinnedIds={presentPins}
                onPin={togglePin}
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

        {/* Someone put a playlist on — one tap joins them in listening. */}
        {musicInvite && (
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
              <Icon name="music" size={17} />
            </span>
            <p style={{ flex: 1, minWidth: 160, fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
              <strong>{musicInvite.from}</strong> is playing {musicCollection(musicInvite.key)?.label ?? 'a playlist'} —
              listen together?
            </p>
            <button
              onClick={joinMusic}
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
              Listen
            </button>
            <button
              onClick={() => setMusicInvite(null)}
              aria-label="Dismiss the music invite"
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
        {/* Meet-style: every reaction rises from the bottom of the call screen
            carrying the sender's name, instead of hiding inside one tile. */}
        <ReactionRise events={emojiEvents} participants={participants} localIdentity={localParticipant?.identity} />
        <Controls
          callId={callId}
          onLeave={leave}
          sendReaction={sendReaction}
          gamesOpen={gamesOpen}
          onOpenGames={() => {
            setMusicOpen(false)
            setCodeOpen(false)
            setGamesOpen((open) => !open)
          }}
          musicOpen={musicOpen}
          onOpenMusic={() => {
            setGamesOpen(false)
            setCodeOpen(false)
            setMusicAuto(false)
            setMusicOpen((open) => !open)
          }}
          codeOpen={codeOpen}
          onOpenCode={() => {
            setMusicOpen(false)
            setGamesOpen(false)
            setCodeOpen((open) => !open)
          }}
          chatOpen={chatOpen}
          unread={unread}
          onOpenChat={() => setChatOpen((open) => !open)}
          handUp={myHandUp}
          onToggleHand={toggleHand}
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
 * STAGE — the band above the strip.
 *   share mode     → whoever is sharing their screen (Meet-style, full width)
 *   otherwise      → up to THREE people: the first pin is the hero (the big
 *                    tile) and the next two ride in the corner as small tiles,
 *                    so one stays special while two still get real attention.
 * Renders nothing when there is nothing to stage (auto with no pins).
 */
function Stage({
  mode,
  participants,
  shareRef,
  stagePeople,
  onUnpin,
}: {
  mode: 'share' | 'spotlight'
  participants: ReturnType<typeof useParticipants>
  shareRef?: TrackReferenceOrPlaceholder
  /** Ids of the people on stage, hero first (max three — see CallSurface). */
  stagePeople: string[]
  onUnpin: (identity: string) => void
}) {
  const camRefs = useTracks([Track.Source.Camera])

  // A placeholder reference (publication still undefined) can't be rendered —
  // treat it exactly like "nothing is being shared".
  const share = mode === 'share' && shareRef && shareRef.publication ? (shareRef as TrackReference) : undefined

  const heroId = stagePeople[0] ?? null
  const companions = stagePeople.slice(1, 3)

  // Nothing shared and nobody staged (auto, no pins) → no stage at all.
  if (!share && !heroId) return null

  const person = participants.find((p) => p.identity === heroId)
  const camRef = camRefs.find((r) => r.participant.identity === heroId)
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

      {/* THE OTHER TWO ON STAGE — small tiles in the corner, so one person
          stays special while two more still get real attention instead of
          shrinking into the strip. Each one can be unpinned from here. */}
      {companions.length > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'grid', gap: 8, zIndex: 2 }}>
          {companions.map((id) => (
            <StagePip key={id} identity={id} participants={participants} onUnpin={onUnpin} />
          ))}
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
      {heroId && (
        <button
          onClick={() => onUnpin(heroId)}
          aria-label={`Unpin ${name} from the stage`}
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
 * ONE COMPANION ON THE STAGE — the small tile that rides the hero's corner.
 * Same anatomy as the big one (camera, else avatar; name; unpin), only the
 * size changes — that difference IS the layout: one special, two close, the
 * rest compact in the strip.
 */
function StagePip({
  identity,
  participants,
  onUnpin,
}: {
  identity: string
  participants: ReturnType<typeof useParticipants>
  onUnpin: (identity: string) => void
}) {
  const camRefs = useTracks([Track.Source.Camera])
  const person = participants.find((p) => p.identity === identity)
  const camRef = camRefs.find((r) => r.participant.identity === identity)
  const name = person?.name || person?.identity || 'Student'

  return (
    <div
      style={{
        position: 'relative',
        width: 'clamp(116px, 16vw, 190px)',
        aspectRatio: '16 / 9',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#000',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
      }}
    >
      {camRef ? (
        <VideoTrack
          trackRef={camRef}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...(person?.isLocal ? { transform: 'scaleX(-1)' } : null),
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(160deg, var(--bg-secondary), var(--bg-page))',
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--accent-text)',
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      <span
        style={{
          position: 'absolute',
          left: 6,
          bottom: 5,
          maxWidth: '72%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 10.5,
          fontWeight: 700,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          padding: '2px 7px',
          borderRadius: 6,
        }}
      >
        {name}
        {person?.isLocal ? ' (You)' : ''}
      </span>

      <button
        onClick={() => onUnpin(identity)}
        aria-label={`Unpin ${name} from the stage`}
        title="Unpin"
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          borderRadius: 7,
          border: 'none',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon name="pin" size={11} strokeWidth={2.4} />
      </button>
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

/** How long one reaction stays on screen — matches ccReactionRise (6s). */
const REACTION_LIFETIME = 6_000

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
  sendReaction,
}: {
  callId: string
  count: number
  /** Bring the full call screen back (same room — nothing reconnects). */
  onOpen: () => void
  onLeave: () => void
  /** The call's own reaction sender — see the note at the call site. */
  sendReaction: (emoji: string) => void
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()

  // Reactions are possible from the bar too: the recipient sees them on any
  // page, so the sender must be able to send from any page.
  const [emojiOpen, setEmojiOpen] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLDivElement>(null)
  const closeEmoji = useCallback(() => setEmojiOpen(false), [])
  useDismiss(emojiOpen, closeEmoji, [emojiRef, emojiButtonRef])

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

      <div ref={emojiButtonRef} style={{ position: 'relative' }}>
        {emojiOpen && (
          <div ref={emojiRef} style={{ position: 'absolute', bottom: 48, right: 0, zIndex: 5 }}>
            <EmojiPicker label="Send an emoji reaction" onPick={sendReaction} onClose={closeEmoji} />
          </div>
        )}
        <button
          onClick={() => setEmojiOpen((open) => !open)}
          aria-label="Send a reaction"
          aria-expanded={emojiOpen}
          className="lvc-mini-btn"
          style={ON}
        >
          <Icon name="smile" size={19} />
        </button>
      </div>

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
  stagedIds,
  pinnedIds,
  onPin,
}: {
  participants: ReturnType<typeof useParticipants>
  /** Everyone holding the stage right now — they never repeat in the strip. */
  stagedIds: string[]
  /** Pinned identities (max three) — the pin control lights for these. */
  pinnedIds: string[]
  onPin: (identity: string) => void
}) {
  const camRefs = useTracks([Track.Source.Camera])
  // Anyone on the stage is lifted out of the strip so nobody shows twice. In
  // grid mode nothing is staged, so the strip IS the room — equal small tiles.
  const strip = participants.filter((p) => !stagedIds.includes(p.identity))

  return (
    <div
      style={{
        display: 'grid',
        // Compact by design: this is the "everyone else" row that sits under a
        // stage which may already be showing three people.
        gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
        gap: 10,
        width: '100%',
      }}
    >
      {strip.map((p) => {
        const muted = !p.isMicrophoneEnabled
        const camRef = camRefs.find((r) => r.participant.identity === p.identity)
        const isPinned = pinnedIds.includes(p.identity)
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
            {/* Floating reactions now rise over the WHOLE call screen — see
                ReactionRise. They used to live here, as a 26px glyph inside
                this overflow:hidden tile, where the control bar and the open
                emoji sheet sat right on top of them. */}

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
 * MEET-STYLE REACTION RAIN — the emoji rises from the BOTTOM of the call
 * screen to the top with the sender's name beside it, so a reaction can not be
 * missed. (It used to be a small glyph clipped inside the sender's own tile,
 * under the control bar: visible only if you were looking for it.)
 *
 * Fixed and pointer-transparent: it sits above the stage, below the popups,
 * and can never swallow a click. Each burst carries its own key, so several
 * people reacting at once simply share the screen.
 */
function ReactionRise({
  events,
  participants,
  localIdentity,
}: {
  events: EmojiEvent[]
  participants: ReturnType<typeof useParticipants>
  localIdentity: string | undefined
}) {
  if (events.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-label="Reactions"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {events.map((e) => {
        const sender = participants.find((p) => p.identity === e.from)
        const mine = e.from === localIdentity || e.from === 'local'
        const name = sender?.name?.trim() || (mine ? 'You' : 'Someone')
        return (
          <span
            key={e.key}
            style={{
              position: 'absolute',
              bottom: 76,
              // Spread the bursts across the width instead of piling them up.
              left: `${6 + ((e.key * 17) % 76)}%`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              animation: 'ccReactionRise 6s cubic-bezier(0.25, 0.6, 0.35, 1) forwards',
            }}
          >
            <span
              style={{
                fontSize: 34,
                lineHeight: 1,
                filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.55))',
              }}
            >
              {e.emoji}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(0,0,0,0.55)',
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              {mine ? 'You' : name}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Data-channel reactions: receive everyone's emoji (and send mine).
 * Topic 'reaction' — payload is just the emoji character. No DB, no polling:
 * the burst lives 6s in component state (long enough for ccReactionRise to
 * climb the screen) and disappears.
 */
function useReactions(myIdentity: string | undefined) {
  const [emojiEvents, setEmojiEvents] = useState<EmojiEvent[]>([])
  const seq = useRef(0)

  const push = useCallback((emoji: string, from: string) => {
    const key = ++seq.current
    setEmojiEvents((prev) => [...prev.slice(-14), { key, emoji, from }])
    window.setTimeout(() => {
      setEmojiEvents((prev) => prev.filter((e) => e.key !== key))
    }, REACTION_LIFETIME)
  }, [])

  const { send } = useDataChannel('reaction', (msg) => {
    // ReceivedDataMessage = { topic, payload: Uint8Array, from?: Participant }
    push(new TextDecoder().decode(msg.payload), msg.from?.identity ?? 'remote')
  })

  const sendReaction = useCallback(
    (emoji: string) => {
      try {
        // RELIABLE, not lossy: a dropped reaction reads as "the emoji never
        // sent" to the person who tapped it, and the payload is a few bytes.
        send(new TextEncoder().encode(emoji), { reliable: true })
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
 * IN-CALL MESSAGES — Meet's chat, carried by the call's own data channel and
 * backed by the database.
 *
 * Topic 'chat' next to 'reaction' and 'game': the payload is just { text }.
 * Live delivery is still the data channel, so lines appear instantly and in
 * sync with the room. On top of that, every line is written to
 * `live_voice_chat_messages` and the thread is loaded when the panel mounts:
 * without that, a late joiner read an empty chat and every link shared before
 * they arrived was gone.
 */
function useCallChat(myIdentity: string | undefined, myName: string | undefined, callId: string, groupId: string) {
  const [messages, setMessages] = useState<CallChatMessage[]>([])
  const seq = useRef(0)

  const push = useCallback((msg: Omit<CallChatMessage, 'key'>) => {
    const key = ++seq.current
    // appendChatMessage caps the thread: a data-channel line is small, but an
    // all-night call must not hold thousands of them in state.
    setMessages((prev) => appendChatMessage(prev, msg, key))
  }, [])

  // History for this call, merged UNDER anything already on screen. Keys are
  // assigned outside the state updater so a React strict-mode double invoke
  // cannot hand out the same key twice.
  useEffect(() => {
    if (!callId || !groupId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/live-voice-chat/chat?callId=${encodeURIComponent(callId)}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data?.messages)) return
        const base = seq.current
        const history: CallChatMessage[] = data.messages.map((m: any, i: number) => ({
          key: base + i + 1,
          id: m.user_id,
          name: m.user_id === myIdentity ? myName?.trim() || 'You' : 'Earlier in this room',
          text: String(m.body ?? ''),
          at: new Date(m.created_at).getTime(),
          mine: m.user_id === myIdentity,
        }))
        if (history.length === 0) return
        seq.current = base + history.length
        setMessages((prev) => [...history, ...prev].slice(-CALL_CHAT_MAX_THREAD))
      } catch {
        // History is an enhancement: a failed read leaves the live thread alone.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [callId, groupId, myIdentity, myName])

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
      // Persist for late joiners. Fire-and-forget: the line is already on
      // screen, and a failed write must never interrupt the conversation.
      if (callId && groupId) {
        void fetch('/api/live-voice-chat/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ callId, groupId, body }),
        }).catch(() => {})
      }
    },
    [send, push, myIdentity, myName, callId, groupId]
  )

  return { messages, sendChat }
}

/** A hand raised on the call. */
type RaisedHand = { id: string; name: string; at: number }

/**
 * HAND RAISE — a tiny 'hand' data channel next to 'reaction' and 'chat'.
 *
 * In a study room someone has to go first, and talking over each other is the
 * default failure. A raised hand is ephemeral (it dies with the call) and
 * carries just { id, name, raised }. LiveKit never echoes data back to the
 * sender, so the local raise is applied directly as well.
 */
function useHandRaise(myIdentity: string | undefined, myName: string | undefined) {
  const [hands, setHands] = useState<RaisedHand[]>([])

  const apply = useCallback((id: string, name: string, raised: boolean) => {
    setHands((prev) => {
      if (!raised) return prev.filter((h) => h.id !== id)
      if (prev.some((h) => h.id === id)) return prev
      return [...prev, { id, name, at: Date.now() }]
    })
  }, [])

  const { send } = useDataChannel('hand', (msg) => {
    let parsed: { id?: unknown; name?: unknown; raised?: unknown } | null = null
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload))
    } catch {
      return
    }
    const id = typeof parsed?.id === 'string' && parsed.id ? parsed.id : (msg.from?.identity ?? '')
    if (!id) return
    const name =
      typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : msg.from?.name?.trim() || 'Someone'
    apply(id, name, !!parsed?.raised)
  })

  const myKey = myIdentity ?? 'local'
  const myHandUp = hands.some((h) => h.id === myKey)

  const toggleHand = useCallback(() => {
    const name = myName?.trim() || 'You'
    const raised = !hands.some((h) => h.id === myKey)
    try {
      send(new TextEncoder().encode(JSON.stringify({ id: myKey, name, raised })), { reliable: true })
    } catch {
      /* channel not ready — the local state still flips */
    }
    apply(myKey, name, raised)
  }, [hands, send, apply, myKey, myName])

  return { hands, myHandUp, toggleHand }
}

/** Languages the shared pad accepts — mirrors CallCodePad's picker. */
const PAD_LANGUAGES = ['python', 'javascript', 'cpp', 'java']
const PAD_MAX_CHARS = 20_000

/**
 * SHARED CODE PAD — one buffer, everyone's screen, no database.
 *
 * Topic 'pad'. Payloads are either `{ type: 'sync' }` (a newcomer asking for
 * the current buffer) or `{ type: 'state', code, language, rev }`. `rev` is a
 * millisecond timestamp: the highest revision wins, so two people typing at
 * once settle on the last change instead of ping-ponging forever. Edits are
 * broadcast on a 250 ms debounce — full buffers keep this simple and a 20k
 * character payload is still far inside the data-channel limit.
 */
function useSharedPad(myIdentity: string | undefined) {
  const [pad, setPad] = useState<{ code: string; language: string; rev: number }>({
    code: '',
    language: 'python',
    rev: 0,
  })
  const padRef = useRef(pad)
  padRef.current = pad
  const debounce = useRef<number | null>(null)
  // The data-channel sender is created after the broadcast helper (the handler
  // below needs the helper), so it is reached through a ref.
  const sendRef = useRef<((data: Uint8Array, opts?: any) => void | Promise<void>) | null>(null)

  const broadcast = useCallback(
    (next: { code: string; language: string; rev: number }) => {
      try {
        sendRef.current?.(
          new TextEncoder().encode(
            JSON.stringify({ type: 'state', code: next.code, language: next.language, rev: next.rev, from: myIdentity })
          ),
          { reliable: true }
        )
      } catch {
        /* channel not ready — the local buffer is still correct */
      }
    },
    [myIdentity]
  )

  const { send } = useDataChannel('pad', (msg) => {
    let parsed: { type?: unknown; code?: unknown; language?: unknown; rev?: unknown; from?: unknown } | null = null
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload))
    } catch {
      return
    }

    if (parsed?.type === 'sync') {
      // Only answer when there is something to share, so a silent room stays
      // silent instead of trading empty buffers.
      if (padRef.current.code) broadcast(padRef.current)
      return
    }

    if (parsed?.type !== 'state' || typeof parsed.code !== 'string') return
    const rev = typeof parsed.rev === 'number' ? parsed.rev : 0
    if (rev <= padRef.current.rev) return
    const language =
      typeof parsed.language === 'string' && PAD_LANGUAGES.includes(parsed.language)
        ? parsed.language
        : padRef.current.language
    setPad({ code: parsed.code.slice(0, PAD_MAX_CHARS), language, rev })
  })

  sendRef.current = send

  // Ask whoever is already here for the buffer; retry once for peers still
  // finishing their own handshake.
  useEffect(() => {
    const ask = () => {
      try {
        send(new TextEncoder().encode(JSON.stringify({ type: 'sync' })), { reliable: true })
      } catch {
        /* not connected yet */
      }
    }
    ask()
    const retry = window.setTimeout(ask, 1500)
    return () => window.clearTimeout(retry)
  }, [send])

  const updateCode = useCallback(
    (code: string) => {
      const next = { code: code.slice(0, PAD_MAX_CHARS), language: padRef.current.language, rev: Date.now() }
      setPad(next)
      if (debounce.current) window.clearTimeout(debounce.current)
      debounce.current = window.setTimeout(() => broadcast(next), 250)
    },
    [broadcast]
  )

  const updateLanguage = useCallback(
    (language: string) => {
      if (!PAD_LANGUAGES.includes(language)) return
      const next = { ...padRef.current, language, rev: Date.now() }
      setPad(next)
      broadcast(next)
    },
    [broadcast]
  )

  return { pad, updateCode, updateLanguage }
}

/** The strip that names whose hand is up, in the order they raised it. */
function HandRail({ hands }: { hands: RaisedHand[] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        margin: '8px auto 0',
        maxWidth: 720,
        padding: '7px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--accent-border)',
        borderRadius: 999,
        fontSize: 12.5,
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--accent-text)', flexShrink: 0 }} aria-hidden="true">
        <Icon name="hand" size={14} strokeWidth={2.2} />
      </span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
        {hands.length === 1 ? '1 hand up' : `${hands.length} hands up`}
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {hands.map((h) => h.name).join(' · ')}
      </span>
    </div>
  )
}

/**
 * GMeet-style bottom control bar, kept deliberately SHORT: the whole emoji
 * sheet, mic, camera, messages, a "More" menu (hand, screen share, games,
 * compiler, music) and Leave — one row on a phone instead of two.
 *
 * Mic and camera turn Meet-red while OFF; an active screen share lights up in
 * the accent. Mic state syncs to the DB via RPC; camera, screen share, games
 * and shared music are pure LiveKit / component state (screen share hides
 * itself in browsers without getDisplayMedia, e.g. older mobile Safari).
 */
function Controls({
  callId,
  onLeave,
  sendReaction,
  gamesOpen,
  onOpenGames,
  musicOpen,
  onOpenMusic,
  chatOpen,
  unread,
  onOpenChat,
  handUp,
  onToggleHand,
  codeOpen,
  onOpenCode,
}: {
  callId: string
  onLeave: () => void
  sendReaction: (emoji: string) => void
  gamesOpen: boolean
  onOpenGames: () => void
  musicOpen: boolean
  onOpenMusic: () => void
  chatOpen: boolean
  unread: number
  onOpenChat: () => void
  handUp: boolean
  onToggleHand: () => void
  codeOpen: boolean
  onOpenCode: () => void
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** Everything too rare for the bar — hand, share, games, compiler, music. */
  const [moreOpen, setMoreOpen] = useState(false)

  // Each floating panel keeps its own refs: the sheet, and the button that
  // opened it, so tapping that button again toggles instead of bouncing.
  const emojiRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLDivElement>(null)
  const closeEmoji = useCallback(() => setEmojiOpen(false), [])
  const closeMore = useCallback(() => setMoreOpen(false), [])
  useDismiss(emojiOpen, closeEmoji, [emojiRef, emojiButtonRef])
  useDismiss(moreOpen, closeMore, [moreRef, moreButtonRef])

  // Screen capture does not exist on every browser — decide AFTER mount so
  // SSR and the first client render agree (no hydration mismatch).
  const [canScreenShare, setCanScreenShare] = useState(false)
  useEffect(() => {
    setCanScreenShare(!!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia))
  }, [])

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
      {/* EMOJI — the whole set, WhatsApp-style. A tap fires a reaction at
          everyone (it floats over their tile for ~3s) and the sheet STAYS
          OPEN, because the point is sending several in a row quickly; ✕,
          Escape or a tap outside is what closes it. */}
      <div ref={emojiButtonRef} style={{ position: 'relative' }}>
        {emojiOpen && (
          <div
            ref={emojiRef}
            style={{ position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 6 }}
          >
            <EmojiPicker label="Send an emoji reaction" onPick={sendReaction} onClose={closeEmoji} />
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

      {/* MORE — everything that is real but not constant: raise hand, screen
          share, games, the shared compiler and listen-together music. The bar
          keeps only what a call is about (emoji, mic, camera, messages) plus
          Leave, so a phone shows one row instead of two. */}
      <div ref={moreButtonRef} style={{ position: 'relative' }}>
        {moreOpen && (
          <div
            ref={moreRef}
            role="menu"
            aria-label="More call options"
            style={{
              position: 'absolute',
              bottom: 68,
              right: 0,
              minWidth: 232,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
              animation: 'ccCardUp 0.15s ease',
              zIndex: 6,
            }}
          >
            <MoreItem
              icon="hand"
              label={handUp ? 'Lower your hand' : 'Raise your hand'}
              active={handUp}
              onClick={() => {
                onToggleHand()
                closeMore()
              }}
            />
            {canScreenShare && (
              <MoreItem
                icon="screen-share"
                label={isScreenShareEnabled ? 'Stop sharing your screen' : 'Share your screen'}
                active={isScreenShareEnabled}
                onClick={() => {
                  void toggleScreenShare()
                  closeMore()
                }}
              />
            )}
            <MoreItem
              icon="gamepad"
              label={gamesOpen ? 'Close the games panel' : 'Play a game with the call'}
              active={gamesOpen}
              onClick={() => {
                onOpenGames()
                closeMore()
              }}
            />
            <MoreItem
              icon="code"
              label={codeOpen ? 'Close the shared code pad' : 'Open the shared code pad'}
              active={codeOpen}
              onClick={() => {
                onOpenCode()
                closeMore()
              }}
            />
            <MoreItem
              icon="music"
              label={musicOpen ? 'Close the music panel' : 'Listen to music with the call'}
              active={musicOpen}
              onClick={() => {
                onOpenMusic()
                closeMore()
              }}
            />
          </div>
        )}
        <button
          onClick={() => setMoreOpen((open) => !open)}
          aria-label="More call options"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className="lvc-ctrl"
          style={
            moreOpen || gamesOpen || codeOpen || musicOpen
              ? { background: 'var(--accent)', color: 'var(--on-accent)' }
              : ON
          }
        >
          <Icon name="more" size={23} />
        </button>
      </div>

      <button onClick={onLeave} aria-label="Leave the call" className="lvc-leave">
        Leave
      </button>
    </div>
  )
}

/**
 * ONE LINE IN THE "MORE" MENU — icon, label, and a highlighted row while the
 * panel it opens is on screen, so the menu still answers "what is running?"
 * now that the bar no longer shows those five controls.
 */
function MoreItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  /** True while the panel this opens is the one mounted on the call. */
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      aria-label={label}
      data-active={active ? '1' : '0'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        border: 'none',
        borderRadius: 10,
        padding: '9px 10px',
        background: active ? 'var(--accent-light)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-primary)',
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} size={18} strokeWidth={2.1} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
    </button>
  )
}
