'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  useDataChannel,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/components-react'
import type { TrackReferenceOrPlaceholder, TrackReference } from '@livekit/components-react'
import { RemoteParticipant, Track } from 'livekit-client'
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

/** Meet's four view modes — the whole set, nothing invented. */
type CallLayout = 'auto' | 'grid' | 'spotlight' | 'sidebar'

const LAYOUT_MODES: { key: CallLayout; label: string; icon: string }[] = [
  { key: 'auto', label: 'Auto', icon: 'layout' },
  { key: 'grid', label: 'Grid', icon: 'users' },
  { key: 'spotlight', label: 'Spotlight', icon: 'eye' },
  { key: 'sidebar', label: 'Sidebar', icon: 'layers' },
]

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
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant()
  const { emojiEvents, sendReaction } = useReactions(localParticipant?.identity, callId)

  // ── IN-CALL MESSAGES ───────────────────────────────────────────────────
  const { messages, sendChat } = useCallChat(localParticipant?.identity, localParticipant?.name, callId, groupId)
  const { hands, myHandUp, toggleHand } = useHandRaise(localParticipant?.identity, localParticipant?.name)

  // ── WHO RUNS THE ROOM, AND WHO HAS BEEN SILENCED ─────────────────────
  // Owner, admin and co-admin run a room; the first two can also hand out
  // co-admin. Muting somebody is a moderator's power, not a vote: their own
  // client reads the same flag and keeps its microphone off (below), and the
  // server mutes the track at LiveKit as well, so a backgrounded tab is
  // silenced too.
  const { canModerate, iamHostMuted, hostMutedIds, toggleHostMute, roomLocked, toggleLock, muteAll } = useModeration(
    callId,
    groupId,
    localParticipant?.identity
  )

  /** How loudly each person plays ON MY DEVICE — 0..1, keyed by identity.
   *  It is only ever my own setting: nobody else's call is affected. */
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const setVolume = useCallback((identity: string, volume: number) => {
    setVolumes((prev) => ({ ...prev, [identity]: volume }))
  }, [])
  // Applied to the running track, so the slider is heard immediately — and
  // re-applied whenever somebody new arrives with a volume I already set.
  useEffect(() => {
    for (const p of participants) {
      if (p.isLocal) continue
      const volume = volumes[p.identity]
      if (volume === undefined) continue
      if (p instanceof RemoteParticipant) p.setVolume(volume)
    }
  }, [participants, volumes])

  // A moderator's mute is not a suggestion: the microphone goes off and stays
  // off, even if the person taps the mic button in the bar.
  useEffect(() => {
    if (!iamHostMuted || !localParticipant || !isMicrophoneEnabled) return
    void localParticipant.setMicrophoneEnabled(false).catch(() => {
      /* permission already gone — it is off either way */
    })
  }, [iamHostMuted, isMicrophoneEnabled, localParticipant])
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
  /** The roster panel: per-person playback volume for everyone, host mute
   *  for an owner/admin/co-admin. */
  const [peopleOpen, setPeopleOpen] = useState(false)
  /** The floating self-view can be dismissed — until the camera goes off. */
  const [selfPreviewHidden, setSelfPreviewHidden] = useState(false)
  useEffect(() => {
    if (!isCameraEnabled) setSelfPreviewHidden(false)
  }, [isCameraEnabled])
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
  const [layout, setLayout] = useState<CallLayout>(() => {
    try {
      const v = window.sessionStorage.getItem('cc-voice-layout')
      return v === 'grid' || v === 'spotlight' || v === 'sidebar' || v === 'auto' ? v : 'auto'
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

  const changeLayout = useCallback((next: CallLayout) => {
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
  /** The person Auto has settled on as the current speaker (see below). */
  const [autoSpeaker, setAutoSpeaker] = useState<string | null>(null)
  /** Laptop-or-wider: the stage and the strip can sit SIDE BY SIDE. */
  const wide = useWideStage()

  const presentPins = pinnedIds.filter((id) => participants.some((p) => p.identity === id))
  const fallbackId = participants.find((p) => !p.isLocal)?.identity ?? localParticipant?.identity ?? null

  // AUTO FOLLOWS WHOEVER IS ACTUALLY TALKING (Meet's auto): the stage would
  // otherwise sit on an empty hero while somebody is mid-sentence. The new
  // speaker has to hold the floor for a couple of seconds first — otherwise a
  // room of four would flick between faces on every "haan".
  const speakerId = participants.find((p) => p.isSpeaking && !p.isLocal)?.identity ?? null
  useEffect(() => {
    if (layout !== 'auto' || !speakerId || speakerId === autoSpeaker) return
    const timer = window.setTimeout(() => setAutoSpeaker(speakerId), 2_500)
    return () => window.clearTimeout(timer)
  }, [layout, speakerId, autoSpeaker])
  // Nobody pinned in Auto → the person who has been talking gets the stage.
  const autoSpeakerId = layout === 'auto' && presentPins.length === 0 ? autoSpeaker : null

  const heroId =
    (layout === 'spotlight' || layout === 'sidebar'
      ? (presentPins[0] ?? fallbackId)
      : (presentPins[0] ?? autoSpeakerId)) ?? null
  // Grid stages NOBODY by definition — every tile is equal there — so a pin
  // never silently removes somebody from the grid.
  const stagePeople = layout === 'grid' || !heroId ? [] : [heroId, ...presentPins.filter((id) => id !== heroId)]
  /** Does the stage have anything to show? Decides whether the strip can move
   *  to the right-hand column beside it (GMeet's shape) instead of below. */
  const stageVisible = stagePeople.length > 0 || (!!screenShareRef?.publication && layout === 'auto')

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
          {peopleOpen ? (
            <CallPeoplePanel
              participants={participants}
              volumes={volumes}
              onVolume={setVolume}
              canModerate={canModerate}
              hostMutedIds={hostMutedIds}
              onToggleMute={toggleHostMute}
              roomLocked={roomLocked}
              onToggleLock={toggleLock}
              onMuteAll={muteAll}
              onClose={() => setPeopleOpen(false)}
            />
          ) : musicOpen ? (
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
              {/* GMEET'S SHAPE — up to THREE people get the big tiles and
                  everybody after that rides the RIGHT edge in small tiles,
                  stacked vertically, exactly as members join (free4talk and
                  Meet both do this). Below 900px the column drops under the
                  stage instead: a phone has no room for a sidebar. */}
              <div
                style={
                  stageVisible && (layout === 'sidebar' || wide)
                    ? { display: 'flex', gap: 14, alignItems: 'flex-start', width: '100%' }
                    : { display: 'contents' }
                }
              >
                <div
                  style={
                    stageVisible && (layout === 'sidebar' || wide) ? { flex: 1, minWidth: 0 } : { display: 'contents' }
                  }
                >
                  {(layout === 'auto' || layout === 'spotlight' || layout === 'sidebar') && (
                    <Stage
                      mode={layout === 'auto' ? 'share' : 'spotlight'}
                      participants={participants}
                      shareRef={screenShareRef}
                      stagePeople={stagePeople}
                      onUnpin={togglePin}
                    />
                  )}
                </div>

                {stageVisible && (layout === 'sidebar' || wide) && (
                  <aside
                    aria-label="Everyone else"
                    style={{
                      width: 'clamp(196px, 21vw, 264px)',
                      flexShrink: 0,
                      maxHeight: '56vh',
                      overflowY: 'auto',
                      paddingRight: 2,
                    }}
                  >
                    <Participants
                      participants={participants}
                      stagedIds={stagePeople}
                      pinnedIds={presentPins}
                      handIds={presentHands.map((h) => h.id)}
                      onPin={togglePin}
                      variant="side"
                    />
                  </aside>
                )}
              </div>

              {!stageVisible || !(layout === 'sidebar' || wide) ? (
                <Participants
                  participants={participants}
                  stagedIds={stagePeople}
                  pinnedIds={presentPins}
                  handIds={presentHands.map((h) => h.id)}
                  onPin={togglePin}
                />
              ) : null}
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
        {/* Meet's floating self-view: your camera, draggable, always clear of
            the control bar. Only while the camera is on. */}
        {isCameraEnabled && !selfPreviewHidden && <SelfPreview onClose={() => setSelfPreviewHidden(true)} />}
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
          peopleOpen={peopleOpen}
          onOpenPeople={() => {
            setMusicOpen(false)
            setGamesOpen(false)
            setCodeOpen(false)
            setPeopleOpen((open) => !open)
          }}
          hostMuted={iamHostMuted}
          layout={layout}
          onChangeLayout={changeLayout}
        />
      </div>
    </div>
  )
}

/**
 * VIEW MODE — Meet's four layouts (Auto / Grid / Spotlight / Sidebar), moved
 * off the call canvas and into the More menu. A segmented bar above the stage
 * spent a whole band of the call on a control nobody touches twice; here the
 * same four choices sit one tap deeper, with the active one ticked.
 *
 * The menu stays open after a pick, exactly like Meet's layout panel, so the
 * modes can be compared without reopening it each time.
 */
function ViewModeSection({ layout, onChange }: { layout: CallLayout; onChange: (next: CallLayout) => void }) {
  return (
    <div role="group" aria-label="View mode" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          padding: '7px 10px 3px',
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        View mode
      </span>
      {LAYOUT_MODES.map((m) => {
        const active = layout === m.key
        return (
          <button
            key={m.key}
            role="menuitemradio"
            aria-checked={active}
            aria-label={`${m.label} view`}
            onClick={() => onChange(m.key)}
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
            <Icon name={m.icon} size={18} strokeWidth={2.1} />
            <span style={{ flex: 1, minWidth: 0 }}>{m.label}</span>
            {active && <Icon name="check" size={16} strokeWidth={2.6} />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * LAPTOP-OR-WIDER — the stage has room to lay people out side by side.
 * Phones and narrow windows keep the hero + corner pips, where three tiles at
 * "equal size" would shrink into thumbnails. Resolves to false until mounted,
 * so the first client render matches what SSR painted.
 */
function useWideStage() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 900px)')
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return wide
}

/**
 * STAGE — the band above the strip.
 *   share mode     → whoever is sharing their screen (Meet-style, full width)
 *   laptop, 2–3    → every staged person SIDE BY SIDE, all the same size
 *                    (Meet's pinned row — no hero, no thumbnails)
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
  const wide = useWideStage()

  // A placeholder reference (publication still undefined) can't be rendered —
  // treat it exactly like "nothing is being shared".
  const share = mode === 'share' && shareRef && shareRef.publication ? (shareRef as TrackReference) : undefined

  const heroId = stagePeople[0] ?? null
  const companions = stagePeople.slice(1, 3)

  // Nothing shared and nobody staged (auto, no pins) → no stage at all.
  if (!share && !heroId) return null

  // LAPTOP, MEET-STYLE — "teen log equal size me dikhen": two or three staged
  // people sit side by side at the SAME size, each a full 16:9 tile, instead
  // of one hero with two corner pips. Narrow screens keep the pips, because
  // three equal tiles on a phone are just thumbnails.
  if (!share && wide && stagePeople.length > 1) {
    return (
      <div style={{ display: 'flex', gap: 10, width: '100%', marginBottom: 14, flexShrink: 0 }}>
        {stagePeople.map((id) => (
          <StagePip key={id} identity={id} participants={participants} onUnpin={onUnpin} variant="row" />
        ))}
      </div>
    )
  }

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
 *
 * `variant="row"` is the laptop rendering of the same person: flexed to an
 * equal share of the stage, so two or three staged people all come out the
 * same size instead of hero-plus-thumbnails.
 */
function StagePip({
  identity,
  participants,
  onUnpin,
  variant = 'pip',
}: {
  identity: string
  participants: ReturnType<typeof useParticipants>
  onUnpin: (identity: string) => void
  /** 'pip' rides the hero's corner; 'row' sits equal beside the others. */
  variant?: 'pip' | 'row'
}) {
  const camRefs = useTracks([Track.Source.Camera])
  const person = participants.find((p) => p.identity === identity)
  const camRef = camRefs.find((r) => r.participant.identity === identity)
  const name = person?.name || person?.identity || 'Student'
  const row = variant === 'row'

  return (
    <div
      style={{
        position: 'relative',
        ...(row
          ? { flex: '1 1 0', minWidth: 0, borderRadius: 14 }
          : { width: 'clamp(116px, 16vw, 190px)', borderRadius: 10 }),
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#000',
        boxShadow: row ? 'none' : '0 6px 20px rgba(0,0,0,0.35)',
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
  /** Cell in the bottom band (two lines of six). Allocated when the burst is
   *  pushed and freed when it expires, so a reaction never jumps to another
   *  cell while it is on screen. */
  slot: number
}

/** The band is TWO LINES of SIX reactions — never more of the screen. */
const REACTION_BAND_CELLS = 12

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
 * PARTICIPANT TILES — one card per person, Meet-style.
 *
 * THE FRAME: every tile is a 16:9 frame with the camera (or the avatar)
 * filling it edge to edge, the name and mic state always visible over the
 * bottom-left corner, and a solid green ring while that person talks — Meet's
 * speaking signal instead of the decorative gradient ring that used to spin.
 *
 * GMeet layout behaviours:
 *   • the stage's people are lifted out — nobody is ever shown twice
 *   • every tile carries a Pin button — pinning puts that person on the stage
 *   • raised hands sort first, then whoever is talking
 *   • variant="side" is the column that lives beside the stage: one small
 *     tile per row, where everybody after the first three keeps riding along
 */
function Participants({
  participants,
  stagedIds,
  pinnedIds,
  handIds = [],
  onPin,
  variant = 'grid',
}: {
  participants: ReturnType<typeof useParticipants>
  /** Everyone holding the stage right now — they never repeat in the strip. */
  stagedIds: string[]
  /** Pinned identities (max three) — the pin control lights for these. */
  pinnedIds: string[]
  /** Raised hands — they sort to the front of the strip. */
  handIds?: string[]
  onPin: (identity: string) => void
  /** 'grid' = a responsive row of equal tiles; 'side' = one row per person. */
  variant?: 'grid' | 'side'
}) {
  const camRefs = useTracks([Track.Source.Camera])
  // Anyone on the stage is lifted out of the strip so nobody shows twice. In
  // grid mode nothing is staged, so the strip IS the room — equal tiles.
  const strip = participants.filter((p) => !stagedIds.includes(p.identity))
  // Hands first (they asked to speak), then whoever is talking, then the room.
  const rank = (id: string, speaking: boolean) => (handIds.includes(id) ? 2 : speaking ? 1 : 0)
  const ordered = [...strip].sort((a, b) => rank(b.identity, b.isSpeaking) - rank(a.identity, a.isSpeaking))

  /** Up to three people: one big tile per row, stacked vertically. */
  const stacked = variant === 'grid' && ordered.length > 0 && ordered.length <= 3
  /** How wide each stacked tile may grow, so three of them still fit a laptop. */
  const stackedMaxWidth = ordered.length === 1 ? 880 : ordered.length === 2 ? 640 : 500

  return (
    <div
      style={{
        display: 'grid',
        // Meet's tile flow, by headcount:
        //   • 1–3 people → one tile PER ROW, stacked vertically, each face
        //     kept big;
        //   • the fourth person onward → the compact tiled grid: smaller
        //     tiles in as many columns as the width allows, exactly the way
        //     Meet shrinks once the room fills up.
        // The right-hand column has no choice to make: one tile per row.
        gridTemplateColumns:
          variant === 'side' ? '1fr' : stacked ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(148px, 1fr))',
        justifyItems: stacked ? 'center' : undefined,
        gap: 10,
        width: '100%',
      }}
    >
      {ordered.map((p) => {
        const muted = !p.isMicrophoneEnabled
        const camRef = camRefs.find((r) => r.participant.identity === p.identity)
        const isPinned = pinnedIds.includes(p.identity)
        return (
          <div
            key={p.identity}
            style={{
              position: 'relative',
              ...(stacked ? { width: '100%', maxWidth: stackedMaxWidth } : null),
              aspectRatio: '16 / 9',
              overflow: 'hidden',
              borderRadius: 14,
              border: p.isSpeaking ? '2px solid var(--success, var(--accent))' : '1px solid var(--border)',
              background: 'linear-gradient(160deg, var(--bg-secondary), var(--bg-page))',
              boxShadow: p.isSpeaking
                ? '0 0 24px color-mix(in srgb, var(--success, var(--accent)) 25%, transparent)'
                : 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {/* THE FRAME — camera or avatar, filling the tile edge to edge. */}
            {camRef ? (
              <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
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
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span
                  style={{
                    width: 'min(34%, 84px)',
                    aspectRatio: '1',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'clamp(16px, 3vw, 30px)',
                    fontWeight: 800,
                    color: p.isSpeaking ? 'var(--on-accent)' : 'var(--accent-text)',
                    background: p.isSpeaking ? 'var(--success, var(--accent))' : 'var(--accent-light)',
                    transition: 'background 0.2s ease',
                  }}
                >
                  {(p.name ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Name + mic state, always on — never a hover-only detail. */}
            <span
              style={{
                position: 'absolute',
                left: 8,
                bottom: 7,
                maxWidth: 'calc(100% - 46px)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(0,0,0,0.55)',
                padding: '3px 8px',
                borderRadius: 7,
                overflow: 'hidden',
              }}
            >
              {muted && <Icon name="mic-off" size={11} strokeWidth={2.4} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name ?? 'Student'}
                {p.isLocal ? ' (You)' : ''}
              </span>
            </span>

            {/* pin control — Meet-style: keep this person on the stage */}
            <button
              onClick={() => onPin(p.identity)}
              aria-label={isPinned ? `Unpin ${p.name ?? 'participant'}` : `Pin ${p.name ?? 'participant'} to the stage`}
              aria-pressed={isPinned}
              title={isPinned ? 'Unpin' : 'Pin to stage'}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isPinned ? 'none' : '1px solid rgba(255, 255, 255, 0.35)',
                background: isPinned ? 'var(--accent)' : 'rgba(0, 0, 0, 0.55)',
                color: isPinned ? 'var(--on-accent)' : '#fff',
                cursor: 'pointer',
                zIndex: 3,
              }}
            >
              <Icon name="pin" size={13} strokeWidth={2.2} />
            </button>
            {/* Floating reactions live over the BOTTOM TWO LINES of the call
                screen — see ReactionRise — never inside this overflow:hidden
                tile, where the control bar sits on top of them. */}
          </div>
        )
      })}
    </div>
  )
}

/**
 * REACTIONS — TWO LINES AT THE BOTTOM, SIX TO A LINE.
 *
 * The ask: the emoji section should be there, but only over the LAST TWO
 * lines — never the whole screen, so the call above it stays readable and
 * scrollable. The band is pointer-transparent, so taps and scrolls pass
 * straight through it, and it never grows past twelve (two lines of six).
 *
 * Every burst keeps the cell it was handed when it arrived (see
 * EmojiEvent.slot), so nothing slides to a different cell while it is on
 * screen; when the band is full, the oldest — by then already faded — gives
 * up its cell to the newest tap.
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
    <div aria-live="polite" aria-label="Reactions" className="lvc-reaction-band">
      {events.map((e) => {
        const sender = participants.find((p) => p.identity === e.from)
        const mine = e.from === localIdentity || e.from === 'local'
        const name = sender?.name?.trim() || (mine ? 'You' : 'Someone')
        return (
          <span
            key={e.key}
            className="lvc-reaction"
            style={{ gridRow: Math.floor(e.slot / 6) + 1, gridColumn: (e.slot % 6) + 1 }}
          >
            <span className="lvc-reaction-emoji">{e.emoji}</span>
            <span className="lvc-reaction-name">{mine ? 'You' : name}</span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Data-channel reactions: receive everyone's emoji (and send mine).
 *
 * DELIVERY IS DELIBERATELY REDUNDANT — the same burst goes out over the
 * LiveKit data channel (in sync with the room, zero latency) AND over a
 * Supabase broadcast on the call's own channel. Reactions were arriving for
 * the sender and for nobody else — the local echo always paints, so a failed
 * send looked like a success — so the second path guarantees everyone in the
 * call gets it. The receiver drops the duplicate, keyed on sender + emoji
 * inside a short window.
 *
 * The burst lives 6s in component state (long enough for ccReactionRise to
 * climb the screen) and disappears.
 */
function useReactions(myIdentity: string | undefined, callId: string) {
  const [emojiEvents, setEmojiEvents] = useState<EmojiEvent[]>([])
  const seq = useRef(0)
  /** When each sender last showed each emoji — the duplicate guard. */
  const shownAt = useRef(new Map<string, number>())
  /** Which band cells are busy, oldest first — see EmojiEvent.slot. */
  const busyCells = useRef(new Set<number>())
  const cellOrder = useRef<{ key: number; slot: number }[]>([])
  /** The one broadcast channel for this call, so send and receive agree. */
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const push = useCallback((emoji: string, from: string) => {
    const dupKey = `${from}|${emoji}`
    const last = shownAt.current.get(dupKey) ?? 0
    // Both paths may deliver the same burst: show it once, not twice.
    if (Date.now() - last < 2_000) return
    shownAt.current.set(dupKey, Date.now())
    if (shownAt.current.size > 60) shownAt.current.clear()

    // THE BAND IS FULL → the oldest, most-faded cell goes to the new one.
    // Reactions are arrivals, not history: the newest tap is the one worth
    // showing when the two lines are already busy.
    if (cellOrder.current.length >= REACTION_BAND_CELLS) {
      const evicted = cellOrder.current.shift()
      if (evicted) {
        busyCells.current.delete(evicted.slot)
        setEmojiEvents((prev) => prev.filter((e) => e.key !== evicted.key))
      }
    }
    let slot = 0
    while (slot < REACTION_BAND_CELLS && busyCells.current.has(slot)) slot += 1
    busyCells.current.add(slot)

    const key = ++seq.current
    cellOrder.current.push({ key, slot })
    setEmojiEvents((prev) => [...prev.slice(-14), { key, emoji, from, slot }])
    window.setTimeout(() => {
      setEmojiEvents((prev) => prev.filter((e) => e.key !== key))
      busyCells.current.delete(slot)
      cellOrder.current = cellOrder.current.filter((c) => c.key !== key)
    }, REACTION_LIFETIME)
  }, [])

  // The second path: everyone in the call is on this channel, whoever they
  // are and whichever page they are looking at.
  useEffect(() => {
    if (!callId) return
    const channel = supabase.channel(`lvc-reactions-${callId}`)
    channelRef.current = channel
    channel
      .on('broadcast', { event: 'reaction' }, (msg) => {
        const payload = msg.payload as { emoji?: unknown; from?: unknown }
        if (typeof payload?.emoji !== 'string' || !payload.emoji) return
        push(payload.emoji, typeof payload.from === 'string' && payload.from ? payload.from : 'remote')
      })
      .subscribe()
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [callId, push])

  const { send } = useDataChannel('reaction', (msg) => {
    // ReceivedDataMessage = { topic, payload: Uint8Array, from?: Participant }
    push(new TextDecoder().decode(msg.payload), msg.from?.identity ?? 'remote')
  })

  const sendReaction = useCallback(
    (emoji: string) => {
      const bytes = new TextEncoder().encode(emoji)
      try {
        // RELIABLE, not lossy: a dropped reaction reads as "the emoji never
        // sent" to the person who tapped it, and the payload is a few bytes.
        send(bytes, { reliable: true })
      } catch {
        /* channel not ready — the broadcast below still carries it */
      }
      // The path that reaches everybody: a broadcast on the call's channel,
      // independent of the peer connection (the receiver de-duplicates it
      // against the data-channel copy above).
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, from: myIdentity ?? 'local' },
      })
      // Show my own reaction instantly (no round-trip wait). Neither path
      // echoes back to the sender — and it must carry MY identity so the
      // burst renders as mine, not as a phantom 'local' key no tile matches.
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
 * MODERATION — who may run the room, and who has been silenced.
 *
 *   canModerate    the owner (the creator), an 'admin' member or a
 *                  'co-admin' member of THIS room. Both tables are read
 *                  directly; the server re-checks exactly the same facts in
 *                  SQL before anything changes, so a client can never hand
 *                  itself power by editing a row.
 *   hostMutedIds   people a moderator has muted this call. Their own client
 *                  reads the same flag and keeps its microphone off — which
 *                  is why it lives apart from is_muted, the person's OWN
 *                  toggle for their own mic.
 *
 * Both tables move while a call runs (somebody is promoted, somebody is
 * muted), so one realtime subscription re-reads them; the mute action itself
 * goes through the API route, which also asks LiveKit to silence the track.
 */
function useModeration(callId: string, groupId: string, myId: string | undefined) {
  const [canModerate, setCanModerate] = useState(false)
  const [hostMutedIds, setHostMutedIds] = useState<string[]>([])
  /** The door: no NEW person gets a token while this is on (see the route). */
  const [roomLocked, setRoomLocked] = useState(false)

  const refresh = useCallback(async () => {
    if (!callId || !groupId || !myId) return
    try {
      const { data: callRow, error } = await supabase
        .from('live_voice_chat_calls')
        .select('locked')
        .eq('id', callId)
        .maybeSingle()
      // The column arrives with its migration — until then nothing is locked.
      if (!error) setRoomLocked(!!callRow?.locked)
    } catch {
      /* pre-migration: the room simply has no lock */
    }
    try {
      const [group, me] = await Promise.all([
        supabase.from('live_voice_chat_groups').select('created_by').eq('id', groupId).maybeSingle(),
        supabase
          .from('live_voice_chat_members')
          .select('role')
          .eq('group_id', groupId)
          .eq('user_id', myId)
          .maybeSingle(),
      ])
      const role = (me.data?.role ?? '') as string
      setCanModerate(group.data?.created_by === myId || role === 'admin' || role === 'co-admin')
    } catch {
      /* before the migration lands there is simply nobody with power */
    }
    try {
      const { data, error } = await supabase
        .from('live_voice_chat_participants')
        .select('user_id, host_muted')
        .eq('call_id', callId)
        .is('left_at', null)
      // The column arrives with its migration — until then nothing is muted.
      if (error || !Array.isArray(data)) return
      setHostMutedIds(
        data.filter((row: { host_muted?: boolean }) => row.host_muted).map((row: { user_id: string }) => row.user_id)
      )
    } catch {
      /* ditto */
    }
  }, [callId, groupId, myId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // One subscription for both facts: a promotion or a mute lands here within
  // a beat, on every screen, without polling.
  useEffect(() => {
    if (!callId || !groupId) return
    const channel = supabase
      .channel(`lvc-moderation-${callId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_voice_chat_participants', filter: `call_id=eq.${callId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_voice_chat_members', filter: `group_id=eq.${groupId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_voice_chat_calls', filter: `id=eq.${callId}` },
        () => void refresh()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [callId, groupId, refresh])

  /** Silencing somebody (or letting them speak again). The route owns the
   *  authorisation: it runs the role-checked RPC, then LiveKit's own mute. */
  const toggleHostMute = useCallback(
    async (target: string, muted: boolean) => {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) throw new Error('Sign in again to moderate the room.')
      const res = await fetch('/api/live-voice-chat/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ callId, targetUserId: target, muted }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not change that')
      setHostMutedIds((prev) => (muted ? [...new Set([...prev, target])] : prev.filter((id) => id !== target)))
      void refresh()
    },
    [callId, refresh]
  )

  /** Lock / open the room. Same role check as a mute — in SQL. */
  const toggleLock = useCallback(
    async (locked: boolean) => {
      const { error } = await supabase.rpc('set_live_voice_chat_call_lock', {
        p_call_id: callId,
        p_locked: locked,
      })
      if (error) throw new Error(error.message)
      setRoomLocked(locked)
    },
    [callId]
  )

  /** MUTE EVERYONE but me — the roster panel's one tap (see the API route). */
  const muteAll = useCallback(
    async (muted: boolean) => {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) throw new Error('Sign in again to moderate the room.')
      const res = await fetch('/api/live-voice-chat/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ callId, all: true, muted }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not do that')
      await refresh()
    },
    [callId, refresh]
  )

  return {
    canModerate,
    iamHostMuted: !!myId && hostMutedIds.includes(myId),
    hostMutedIds,
    toggleHostMute,
    roomLocked,
    toggleLock,
    muteAll,
  }
}

/**
 * PEOPLE — the roster, with the two controls that belong to a person rather
 * than to the call:
 *
 *   • VOLUME — how loudly THEIR voice plays on MY device. Everyone gets this
 *     slider: the one loud roommate can stay fully audible to the rest of the
 *     room while being quiet in my ears. It never touches anyone else's call.
 *   • MUTE — the owner's, an admin's or a co-admin's power to silence them
 *     for real. Only the three of those see the button.
 */
function CallPeoplePanel({
  participants,
  volumes,
  onVolume,
  canModerate,
  hostMutedIds,
  onToggleMute,
  roomLocked,
  onToggleLock,
  onMuteAll,
  onClose,
}: {
  participants: ReturnType<typeof useParticipants>
  volumes: Record<string, number>
  onVolume: (identity: string, volume: number) => void
  canModerate: boolean
  hostMutedIds: string[]
  onToggleMute: (identity: string, muted: boolean) => Promise<void>
  /** The door: no NEW person joins while this is on. */
  roomLocked: boolean
  onToggleLock: (locked: boolean) => Promise<void>
  /** Mute everyone but the moderator pressing it. */
  onMuteAll: (muted: boolean) => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that')
    } finally {
      setBusy(null)
    }
  }

  async function mute(identity: string, next: boolean) {
    await run(identity, () => onToggleMute(identity, next))
  }

  /** Nobody else is speaking through me — everyone else, in one tap. */
  const others = participants.filter((p) => !p.isLocal)
  const everyoneMuted = others.length > 0 && others.every((p) => hostMutedIds.includes(p.identity))

  return (
    <section
      aria-label="People in this call"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 18,
        background: 'var(--bg)',
        padding: '14px 16px',
        marginBottom: 14,
        animation: 'ccCardUp 0.15s ease',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
          People · {participants.length}
        </h2>
        <span style={{ flex: 1 }} />

        {canModerate && (
          <button
            onClick={() => void run('mute-all', () => onMuteAll(!everyoneMuted))}
            disabled={busy === 'mute-all'}
            aria-label={everyoneMuted ? 'Let everyone speak again' : 'Mute everyone else'}
            style={{
              minHeight: 32,
              padding: '0 11px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: everyoneMuted ? 'var(--accent)' : 'var(--bg-secondary)',
              color: everyoneMuted ? 'var(--on-accent)' : 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: busy === 'mute-all' ? 'wait' : 'pointer',
            }}
          >
            {busy === 'mute-all' ? '…' : everyoneMuted ? 'Allow everyone' : 'Mute everyone'}
          </button>
        )}

        {canModerate && (
          <button
            onClick={() => void run('lock', () => onToggleLock(!roomLocked))}
            disabled={busy === 'lock'}
            aria-pressed={roomLocked}
            aria-label={roomLocked ? 'Open the room to new people' : 'Lock the room to new people'}
            style={{
              minHeight: 32,
              padding: '0 11px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: roomLocked ? 'var(--accent)' : 'var(--bg-secondary)',
              color: roomLocked ? 'var(--on-accent)' : 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: busy === 'lock' ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name={roomLocked ? 'lock' : 'unlock'} size={13} strokeWidth={2.2} />
            {busy === 'lock' ? '…' : roomLocked ? 'Open room' : 'Lock room'}
          </button>
        )}

        <button
          onClick={onClose}
          aria-label="Close the people panel"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </header>

      {error && (
        <p role="alert" style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {participants.map((p) => {
          const name = p.name?.trim() || 'Student'
          const volume = Math.round((volumes[p.identity] ?? 1) * 100)
          const silenced = hostMutedIds.includes(p.identity)
          return (
            <li
              key={p.identity}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 800,
                  color: p.isSpeaking ? 'var(--on-accent)' : 'var(--accent-text)',
                  background: p.isSpeaking ? 'var(--accent)' : 'var(--accent-light)',
                }}
              >
                {name.charAt(0).toUpperCase()}
              </span>

              <span style={{ minWidth: 96, flexShrink: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                  {p.isLocal ? ' (You)' : ''}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Icon name={!p.isMicrophoneEnabled ? 'mic-off' : 'mic'} size={11} />
                  {silenced ? 'muted by admin' : !p.isMicrophoneEnabled ? 'muted' : 'live'}
                </span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
                <Icon name="volume" size={15} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={volume}
                  onChange={(e) => onVolume(p.identity, Number(e.target.value) / 100)}
                  aria-label={`Volume for ${name}`}
                  style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent)' }}
                />
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    width: 34,
                    textAlign: 'right',
                  }}
                >
                  {volume}%
                </span>
              </span>

              {canModerate && !p.isLocal && (
                <button
                  onClick={() => void mute(p.identity, !silenced)}
                  disabled={busy === p.identity}
                  aria-label={silenced ? `Let ${name} speak again` : `Mute ${name} in this call`}
                  style={{
                    minHeight: 32,
                    padding: '0 12px',
                    borderRadius: 9,
                    border: 'none',
                    background: silenced ? 'var(--accent)' : 'var(--danger)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: busy === p.identity ? 'wait' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {silenced ? 'Allow' : 'Mute'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import {
  PANEL_MARGIN,
  clampPanelPosition,
  movePanelByKey,
  movePanelPosition,
  readPanelPosition,
  savePanelPosition,
} from '@/lib/floatingPanel'

/**
 * SELF-VIEW PREVIEW — your own camera as a small floating window, Meet-style.
 *
 * It rides the call screen instead of competing with the stage for tiles, it
 * can be dragged anywhere (and moved with the arrow keys), and it always
 * lands inside the viewport and ABOVE the control bar — that maths lives in
 * lib/floatingPanel.ts, next to the chat panel's, and is unit-tested there.
 * ✕ hides it until the camera goes off and on again, so it never fights the
 * person for screen space.
 */
/** Size of the floating self-view: a 16:9 picture plus its grip bar. */
const SELF_PREVIEW_BOX = { width: 176, height: 132 }

function SelfPreview({ onClose }: { onClose: () => void }) {
  const camRefs = useTracks([Track.Source.Camera])
  const camRef = camRefs.find((r) => r.participant.isLocal)
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })
  /** sessionStorage key: where the person last parked their own preview. */
  const storageKey = 'cc-self-preview'

  const [point, setPoint] = useState(() => {
    let stored: string | null = null
    try {
      stored = window.sessionStorage.getItem(storageKey)
    } catch {
      /* private browsing — just dock it */
    }
    // Saved spot wins; otherwise bottom-left, just above the control bar.
    return stored
      ? readPanelPosition(window.sessionStorage, storageKey, SELF_PREVIEW_BOX, viewport())
      : clampPanelPosition({ x: PANEL_MARGIN, y: window.innerHeight }, SELF_PREVIEW_BOX, viewport())
  })

  // The window can shrink under it (rotate, half-screen): keep it reachable.
  useEffect(() => {
    const onResize = () => setPoint((p) => clampPanelPosition(p, SELF_PREVIEW_BOX, viewport()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const drag = useRef<{ x: number; y: number; origin: { x: number; y: number } } | null>(null)

  if (!camRef) return null

  return (
    <section
      aria-label="Your camera preview"
      style={{
        position: 'fixed',
        left: point.x,
        top: point.y,
        width: SELF_PREVIEW_BOX.width,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#000',
        boxShadow: '0 12px 34px rgba(0, 0, 0, 0.45)',
        zIndex: 20,
      }}
    >
      {/* The grip is the drag surface: dragging the VIDEO must not steal the
          preview from under a stray thumb. */}
      <div
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, origin: point }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setPoint(
            movePanelPosition(d.origin, { x: e.clientX - d.x, y: e.clientY - d.y }, SELF_PREVIEW_BOX, viewport())
          )
        }}
        onPointerUp={(e) => {
          if (!drag.current) return
          drag.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
          setPoint((p) => {
            savePanelPosition(window.sessionStorage, storageKey, p)
            return p
          })
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onKeyDown={(e) => {
          const next = movePanelByKey(point, e.key, SELF_PREVIEW_BOX, viewport())
          if (!next) return
          e.preventDefault()
          setPoint(next)
        }}
        role="button"
        tabIndex={0}
        aria-label="Move your camera preview"
        title="Drag to move — arrow keys work too"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          background: 'rgba(0, 0, 0, 0.55)',
          color: '#fff',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <Icon name="grip" size={14} strokeWidth={2.2} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>You</span>
        <button
          onClick={onClose}
          aria-label="Hide your camera preview"
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            border: 'none',
            background: 'rgba(255, 255, 255, 0.16)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={13} strokeWidth={2.4} />
        </button>
      </div>
      <VideoTrack
        trackRef={camRef}
        muted
        style={{
          display: 'block',
          width: '100%',
          height: SELF_PREVIEW_BOX.height - 28,
          objectFit: 'cover',
          // Meet-style: your own camera is a mirror.
          transform: 'scaleX(-1)',
        }}
      />
    </section>
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
  peopleOpen,
  onOpenPeople,
  hostMuted,
  layout,
  onChangeLayout,
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
  peopleOpen: boolean
  onOpenPeople: () => void
  /** The room's current view mode, and the setter the More menu writes to. */
  layout: CallLayout
  onChangeLayout: (next: CallLayout) => void
  /** True while a moderator has silenced MY microphone this call. */
  hostMuted: boolean
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const room = useRoomContext()
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** Everything too rare for the bar — hand, share, games, compiler, music. */
  const [moreOpen, setMoreOpen] = useState(false)

  /** Browser full screen — Meet keeps it in the same layout panel, so here it
   *  is the row right under View mode. Read from the document itself, because
   *  Esc leaves full screen without ever touching our state. */
  const [isFull, setIsFull] = useState(false)
  useEffect(() => {
    const sync = () => setIsFull(!!document.fullscreenElement)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleFullScreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      /* the browser (or an embedded webview) refused — the view stays put */
    }
  }, [])

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

  // ── FLIP THE CAMERA (phones have two, laptops usually have one) ──────────
  // The list is read on mount and re-read once the camera turns on — that is
  // when the browser finally hands out real deviceIds — and again whenever a
  // camera is plugged in or removed, so the flip button only ever shows up
  // when there is genuinely a second camera to switch to.
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!media?.enumerateDevices) return
    let alive = true
    const refresh = () => {
      media
        .enumerateDevices()
        .then((list) => {
          if (alive) setCameras(list.filter((d) => d.kind === 'videoinput'))
        })
        .catch(() => {
          /* no device list yet (permission still pending) — no flip button */
        })
    }
    refresh()
    media.addEventListener('devicechange', refresh)
    return () => {
      alive = false
      media.removeEventListener('devicechange', refresh)
    }
  }, [isCameraEnabled])

  /** Meet palette for the round controls: neutral = on, red = off. */
  const ON = { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' } as const
  const OFF = { background: 'var(--danger)', color: '#fff' } as const

  async function toggleMic() {
    // A moderator's mute beats the button: the mic stays off until they
    // release it, exactly like the server-side mute on the other end.
    if (hostMuted) return
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

  /**
   * FRONT ↔ BACK — the one camera move a phone has.
   *
   * We cycle through whatever the device exposes: the live track is
   * re-acquired in place, so the room keeps receiving video without anyone
   * else seeing a gap, and the current camera is read off the running track
   * (not off a guess) so the very next one in the list is the flip.
   */
  async function flipCamera() {
    if (cameras.length < 2) return
    const camera = Array.from(localParticipant.videoTrackPublications.values()).find(
      (p) => p.source === Track.Source.Camera
    )
    const currentId = camera?.videoTrack?.mediaStreamTrack.getSettings().deviceId
    const at = cameras.findIndex((d) => d.deviceId === currentId)
    // No id to match (some browsers hide it) → take the second camera, which
    // is the other one on every phone.
    const next = cameras[at < 0 ? Math.min(1, cameras.length - 1) : (at + 1) % cameras.length]
    try {
      await room.switchActiveDevice('videoinput', next.deviceId)
    } catch {
      /* the camera refused to switch — the view simply stays where it is */
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
        title={hostMuted ? 'Muted by a moderator' : undefined}
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

      {/* FLIP — front ↔ back. Only rendered while the camera is live AND the
          device has a second one, so a one-webcam laptop never sees it. */}
      {isCameraEnabled && cameras.length > 1 && (
        <button
          onClick={() => void flipCamera()}
          aria-label="Switch between the front and back camera"
          className="lvc-ctrl"
          style={ON}
        >
          <Icon name="camera-flip" size={23} />
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
              icon="users"
              label={peopleOpen ? 'Close the people panel' : 'People — volume and mute'}
              active={peopleOpen}
              onClick={() => {
                onOpenPeople()
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

            {/* EVERY WAY THE SCREEN CAN BE LAID OUT, in one place — Meet's
                four modes plus full screen, instead of a segmented bar taking
                up room above the stage. */}
            <div style={{ height: 1, background: 'var(--border)', margin: '5px 6px' }} />
            <ViewModeSection layout={layout} onChange={onChangeLayout} />
            <MoreItem
              icon="maximize"
              label={isFull ? 'Exit full screen' : 'Full screen'}
              active={isFull}
              onClick={() => {
                void toggleFullScreen()
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
            moreOpen || gamesOpen || codeOpen || musicOpen || peopleOpen
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
