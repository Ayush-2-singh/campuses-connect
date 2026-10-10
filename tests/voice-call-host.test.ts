/**
 * THE CALL SURVIVES NAVIGATION — the live voice room lives ABOVE the routes.
 *
 * What was wrong: the LiveKit room was owned by the `/…/call` page. Leaving
 * that page unmounted it and ran the leave RPC, so navigating (back included)
 * could never mean anything except "hang up" — and the first attempt at
 * "minimise instead" left the user staring at an emptied call screen, which
 * read as a white page.
 *
 * The contract now:
 *   • the connection lives in CallProvider, mounted once in the root layout, so
 *     no route change can tear it down;
 *   • the call route is a THIN connector: it carries the ids and nothing else;
 *   • on the call route the full screen paints; anywhere else the same
 *     component is a compact bar, so the user always sees real page content;
 *   • leaving is explicit and owned in one place — the Leave button, or
 *     closing the tab (pagehide). Backgrounding must NOT leave.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { describeCallError } from '@/lib/callErrors'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const provider = read('src/components/voice/CallProvider.tsx')
const contextMod = read('src/components/voice/callContext.ts')
const surface = read('src/components/voice/CallSurface.tsx')
const layer = read('src/components/voice/LiveKitCallLayer.tsx')
const route = read('src/app/live-voice-chat/[id]/call/page.tsx')
const rootLayout = read('src/app/layout.tsx')

describe('the connection lives above the routes', () => {
  it('is mounted once, in the root layout, around every page', () => {
    expect(rootLayout).toContain('<CallProvider>{children}</CallProvider>')
  })

  it('owns the session, the handshake and the heartbeat', () => {
    expect(provider).toMatch(/const \[session, setSession\] = useState<CallSession \| null>\(null\)/)
    expect(provider).toMatch(/fetch\('\/api\/live-voice-chat\/token'/)
    expect(provider).toMatch(/touch_live_voice_chat_heartbeat/)
  })

  it('loads LiveKit lazily, so no other page pays for the bundle', () => {
    expect(provider).toMatch(/dynamic\(\(\) => import\('@\/components\/voice\/LiveKitCallLayer'\), \{ ssr: false \}\)/)
    // LiveKit itself is only imported by the layer.
    expect(surface).not.toMatch(/from '@livekit\/components-react'[\s\S]{0,200}LiveKitRoom/)
    expect(layer).toMatch(/<LiveKitRoom/)
  })

  it('renders the surface only once a call has a token', () => {
    expect(provider).toMatch(/\{session && token && url && \(/)
    expect(layer).toMatch(/<CallSurface \/>/)
  })
})

describe('the call route is a thin connector', () => {
  it('renders no LiveKit room of its own', () => {
    expect(route).not.toMatch(/LiveKitRoom/)
    expect(route).not.toMatch(/RoomAudioRenderer/)
  })

  it('never leaves on unmount — that was the whole bug', () => {
    // The old page ran leave_live_voice_chat_call() from an unmount cleanup,
    // which is exactly what made navigation destructive.
    expect(route).not.toMatch(/leave_live_voice_chat_call/)
    expect(provider).toMatch(/leave_live_voice_chat_call/)
  })

  it('hands the ids to the provider instead', () => {
    expect(route).toMatch(/connect\(callId, groupId\)/)
    expect(route).toMatch(/from '@\/components\/voice\/callContext'/)
  })

  it('reads the call from its own context module, not through a cycle', () => {
    // provider → layer → surface → context, with no import back into the
    // provider (a cycle there would be caught only at runtime).
    expect(contextMod).toMatch(/export function callScreenPath\(groupId: string\): string \{/)
    expect(contextMod).toMatch(/export function useCall\(\): CallContextValue \{/)
    expect(read('src/components/voice/CallSurface.tsx')).not.toMatch(/from '@\/components\/voice\/CallProvider'/)
    expect(read('src/components/VoiceChatCard.tsx')).not.toMatch(/from '@\/components\/voice\/CallProvider'/)
  })

  it('joining is idempotent, so coming back does not reconnect', () => {
    expect(provider).toMatch(/if \(sessionRef\.current\?\.callId === callId\) return/)
  })
})

describe('the surface follows the user instead of stranding them', () => {
  it('is full screen only on the call route', () => {
    expect(surface).toMatch(/const fullScreen = !!groupId && pathname === callScreenPath\(groupId\)/)
    expect(contextMod).toMatch(/return `\/live-voice-chat\/\$\{groupId\}\/call`/)
  })

  it('otherwise renders the compact bar, over real page content', () => {
    expect(surface).toMatch(/if \(!fullScreen\) \{/)
    expect(surface).toMatch(/<CallBar callId=\{callId\} count=\{participants\.length\}/)
  })

  it('the bar can bring the call screen back without reconnecting', () => {
    expect(surface).toMatch(/const openCallScreen = useCallback/)
    expect(surface).toMatch(/if \(callUrl\) router\.push\(callUrl\)/)
    expect(surface).toMatch(/aria-label="Back to the call screen"/)
  })

  it('the top-left control minimises by navigating, keeping the call', () => {
    expect(surface).toMatch(/const minimize = useCallback/)
    expect(surface).toMatch(/onBack=\{minimize\}/)
    expect(surface).not.toMatch(/onBack=\{leave\}/)
    // Navigating away is only safe because the room is no longer owned by the
    // route it navigates away from.
    expect(surface).toMatch(/router\.push\(`\/live-voice-chat\/\$\{groupId\}`\)/)
  })

  it('the bar says out loud that the call is still running', () => {
    expect(surface).toMatch(/Still in the call/)
    expect(surface).toMatch(/you are connected/)
  })
})

describe('leaving stays explicit and single-sourced', () => {
  it('leaves on tab close, which is the only automatic leave', () => {
    expect(provider).toMatch(/CLOSING THE TAB IS THE ONLY AUTOMATIC LEAVE/)
    expect(provider).toMatch(/window\.addEventListener\('pagehide', onPageHide\)/)
    expect(provider).toMatch(/removeEventListener\('pagehide', onPageHide\)/)
  })

  it('never leaves on visibilitychange — backgrounding must not drop the call', () => {
    expect(provider).not.toMatch(/visibilitychange/)
    expect(provider).not.toMatch(/document\.hidden/)
    expect(surface).not.toMatch(/visibilitychange/)
  })

  it('guards the leave RPC so it can never run twice for one call', () => {
    expect(provider).toMatch(/if \(!leftRef\.current\) \{/)
    expect(provider).toMatch(/leftRef\.current = true/)
  })

  it('sends the user back to the room when they leave the call screen', () => {
    // Otherwise the emptied route would sit there and simply re-join the call
    // it had just left.
    expect(provider).toMatch(/window\.location\.pathname\.startsWith\(callScreenPath\(current\.groupId\)\)/)
    expect(provider).toMatch(/router\.replace\(`\/live-voice-chat\/\$\{current\.groupId\}`\)/)
  })

  it('offers Leave in both the full screen and the bar', () => {
    expect(surface).toMatch(/aria-label="Leave the call"/)
    expect(surface).toMatch(/onLeave=\{leave\}/)
  })

  it('a connection error offers a way back out', () => {
    expect(route).toMatch(/Back to the voice room/)
  })
})

describe('the other live-room card gets out of the way', () => {
  const css = read('src/app/globals.css')

  it('hides the broadcast card while you are the one in a call', () => {
    const card = read('src/components/VoiceChatCard.tsx')
    expect(card).toMatch(/const \{ session \} = useCall\(\)/)
    expect(card).toMatch(/if \(session \|\| !state\.active/)
  })

  it('hides the create button, which shares the call bar\u2019s corner on a phone', () => {
    const layout = read('src/components/Layout.tsx')
    expect(layout).toMatch(/const \{ session: callSession \} = useCall\(\)/)
    expect(layout).toMatch(/data-hidden=\{callSession \? '1' : '0'\}/)
    expect(css).toMatch(/\.fab-wrap\[data-hidden='1'\] \{[\s\S]*?display: none !important;/)
  })

  it('never blocks the page underneath the layer', () => {
    // The layer spans the whole app on every page, so it must not eat clicks:
    // only its own boxes opt back in.
    expect(css).toMatch(/\.lvc-layer \{[\s\S]*?pointer-events: none;/)
    expect(css).toMatch(/\.lvc-mini \{[\s\S]*?pointer-events: auto;/)
    expect(css).toMatch(/\.lvc-layer-full \{[\s\S]*?pointer-events: auto;/)
  })

  it('lifts the bar above the mobile bottom nav', () => {
    expect(css).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.lvc-mini \{[\s\S]*?bottom: calc\(84px \+ env\(safe-area-inset-bottom/
    )
  })
})

describe('a call link without an id says so', () => {
  it('does not sit on Loading forever', () => {
    expect(route).toMatch(/This call link is missing its call id/)
  })
})

describe('describeCallError — the SDK text a student can act on', () => {
  it('explains a blocked microphone', () => {
    expect(describeCallError(new Error('NotAllowedError: Permission denied'))).toMatch(/Microphone access was blocked/)
  })

  it('explains a rejected token', () => {
    expect(describeCallError('401 Unauthorized')).toMatch(/call token was rejected/)
  })

  it('explains a dead connection', () => {
    expect(describeCallError(new Error('websocket disconnected'))).toMatch(/Lost the connection/)
  })

  it('falls back to the message, then to a sane default', () => {
    expect(describeCallError(new Error('something odd'))).toBe('something odd')
    expect(describeCallError(null)).toBe('Could not connect to the voice room.')
    expect(describeCallError(undefined)).toBe('Could not connect to the voice room.')
  })
})
