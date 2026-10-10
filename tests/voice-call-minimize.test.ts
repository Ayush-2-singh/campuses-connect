/**
 * MINIMIZE, DON'T LEAVE — the top-left control on a live voice call collapses
 * the screen; it must not drop you out of the call.
 *
 * What was wrong: the header's back button called `onLeave`, which ran
 * leave_live_voice_chat_call() and navigated away — so a glance at another
 * screen silently took your voice out of the room for everyone else.
 *
 * The new contract:
 *   • the top-left control minimizes; the LiveKit room never unmounts, so the
 *     mic, the heartbeat and RoomAudioRenderer (which lives OUTSIDE the call
 *     shell) keep working;
 *   • leaving is explicit — the Leave button, or closing the tab (pagehide);
 *   • backgrounding the tab must NOT leave: you switch apps mid-sentence.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const call = read('src/app/live-voice-chat/[id]/call/page.tsx')
const css = read('src/app/globals.css')
const icons = read('src/components/icons.tsx')

describe('the top-left control minimizes instead of leaving', () => {
  it('no longer routes the header back button straight to leave', () => {
    expect(call).not.toMatch(/onBack=\{onLeave\}/)
    expect(call).toMatch(/onBack=\{\(\) => setMinimized\(true\)\}/)
  })

  it('wears a minimize glyph, not a back chevron', () => {
    // A back arrow that quietly drops you out of a live call is precisely the
    // surprise this replaced.
    expect(call).toMatch(/aria-label="Minimize the call"/)
    expect(call).toMatch(/title="Minimize — you stay in the call"/)
    expect(call).toMatch(/<Icon name="minimize"/)
    expect(icons).toMatch(/\n  minimize: \(/)
    expect(icons).toMatch(/\n  maximize: \(/)
  })

  it('collapses the screen without leaving the route', () => {
    // Minimizing must NOT navigate — a route change unmounts the page and the
    // LiveKit room with it.
    const minimizedBlock = call.slice(call.indexOf('const [minimized'), call.indexOf('const [minimized') + 400)
    expect(minimizedBlock).toMatch(/const \[minimized, setMinimized\] = useState\(false\)/)
    expect(call).toMatch(/if \(minimized\) \{/)
    expect(call).toMatch(/onRestore=\{\(\) => setMinimized\(false\)\}/)
  })

  it('keeps the audio renderer outside the call shell', () => {
    // It must stay on the PAGE, inside LiveKitRoom: that is what keeps every
    // body audible while the call screen is collapsed.
    expect(call).toMatch(/<RoomAudioRenderer \/>/)
    const shellAt = call.indexOf('function CallShell(')
    const rendererAt = call.indexOf('<RoomAudioRenderer />')
    expect(rendererAt).toBeGreaterThan(-1)
    expect(rendererAt).toBeLessThan(shellAt)
  })
})

describe('the minimized bar is a whole call in one pill', () => {
  it('offers mic, restore and leave', () => {
    expect(call).toMatch(/function MinimizedCallBar/)
    expect(call).toMatch(/aria-label="Call minimized"/)
    expect(call).toMatch(/Bring the call back/)
    expect(call).toMatch(/aria-label="Leave the call"/)
    expect(call).toMatch(/aria-label=\{isMicrophoneEnabled \? 'Mute microphone' : 'Unmute microphone'\}/)
  })

  it('keeps the DB mute state in sync from the minimized bar too', () => {
    const bar = call.slice(call.indexOf('function MinimizedCallBar'))
    expect(bar).toMatch(/setMicrophoneEnabled/)
    expect(bar).toMatch(/set_live_voice_chat_mute/)
  })

  it('says out loud that the call is still running', () => {
    expect(call).toMatch(/Still in the call/)
    expect(call).toMatch(/screen minimized/)
  })

  it('is styled, fixed, and pulses so it reads as live', () => {
    expect(css).toMatch(/\.lvc-mini \{[\s\S]*?position: fixed;/)
    expect(css).toMatch(/\.lvc-mini-dot \{/)
    expect(css).toMatch(/\.lvc-mini-leave \{/)
  })
})

describe('leaving stays explicit', () => {
  it('leaves on tab close, which is the only automatic leave', () => {
    expect(call).toMatch(/CLOSING THE TAB IS THE ONLY AUTOMATIC LEAVE/)
    expect(call).toMatch(/window\.addEventListener\('pagehide', onPageHide\)/)
    expect(call).toMatch(/removeEventListener\('pagehide', onPageHide\)/)
  })

  it('never leaves on visibilitychange — backgrounding must not drop the call', () => {
    expect(call).not.toMatch(/visibilitychange/)
    expect(call).not.toMatch(/document\.hidden/)
  })

  it('still cleans up on unmount for real navigation away', () => {
    expect(call).toMatch(/leave_live_voice_chat_call/)
    // Two guards (unmount + pagehide) share one leftRef, so neither can
    // double-leave or undo the other.
    expect(call).toMatch(/if \(callId && !leftRef\.current\) \{[\s\S]*?leftRef\.current = true/)
  })

  it('restores the screen when a game invite is accepted', () => {
    // A game cannot be played behind a minimized bar.
    const inviteBlock = call.slice(call.indexOf('const joinInvite'), call.indexOf('const broadcastRoom'))
    expect(inviteBlock).toMatch(/setMinimized\(false\)/)
  })
})
