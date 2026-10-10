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
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CALL_BACK_GUARD_KEY, installCallBackGuard, type BackGuardWindow } from '@/lib/callBackGuard'

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
  it('does not add a history entry when leaving', () => {
    // The entry the user is on is the back-guard duplicate, so leaving swaps
    // it for the room instead of stacking another step to walk back through.
    expect(call).toMatch(/router\.replace\(`\/live-voice-chat\/\$\{groupId\}`\)/)
  })

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

describe('the browser back button minimizes instead of leaving', () => {
  interface FakeEntry {
    state: unknown
    url: string
  }

  /**
   * A minimal History implementation — enough for the guard, and enough for us
   * to DRIVE the back button, which no test can otherwise press.
   */
  function fakeBrowser(href: string) {
    const entries: FakeEntry[] = [{ state: { __NA: 'seed' }, url: href }]
    let index = 0
    const listeners = new Set<() => void>()

    const win = {
      location: { href },
      history: {
        get state(): unknown {
          return entries[index]?.state
        },
        pushState(state: unknown, _title: string, url?: string | URL | null) {
          const nextUrl = url == null ? entries[index].url : String(url)
          entries.splice(index + 1) // a push truncates the forward stack
          entries.push({ state, url: nextUrl })
          index = entries.length - 1
        },
      },
      addEventListener(type: string, listener: () => void) {
        if (type === 'popstate') listeners.add(listener)
      },
      removeEventListener(type: string, listener: () => void) {
        if (type === 'popstate') listeners.delete(listener)
      },
    }

    return {
      win: win as unknown as BackGuardWindow,
      entries,
      atTop: () => index === entries.length - 1,
      current: () => entries[index],
      listeners: () => listeners.size,
      /** Press the browser's back button. */
      pressBack() {
        index = Math.max(0, index - 1)
        for (const fn of Array.from(listeners)) fn()
      },
    }
  }

  const CALL_URL = 'https://www.connecttocampus.com/live-voice-chat/abc/call?callId=c1'

  it('pushes one duplicate entry so the first back press changes nothing', () => {
    const browser = fakeBrowser(CALL_URL)
    installCallBackGuard(browser.win, () => {})

    expect(browser.entries).toHaveLength(2)
    // The duplicate carries the SAME url — that is the whole mechanism: back
    // moves between two identical entries, so no path change reaches the
    // router and the LiveKit room is never unmounted.
    expect(browser.entries[1].url).toBe(CALL_URL)
    expect(browser.atTop()).toBe(true)
  })

  it('copies the router state instead of clobbering it', () => {
    const browser = fakeBrowser(CALL_URL)
    installCallBackGuard(browser.win, () => {})

    // Next keeps its own markers (__NA …) in history.state; dropping them
    // breaks client-side back/forward across the whole app.
    expect(browser.entries[1].state).toMatchObject({ __NA: 'seed', [CALL_BACK_GUARD_KEY]: true })
  })

  it('minimizes on back and keeps the url exactly where it was', () => {
    const browser = fakeBrowser(CALL_URL)
    const onBack = vi.fn()
    installCallBackGuard(browser.win, onBack)

    browser.pressBack()

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(browser.current().url).toBe(CALL_URL)
    expect(browser.atTop()).toBe(true)
  })

  it('keeps the router markers alive across repeated back presses', () => {
    const browser = fakeBrowser(CALL_URL)
    installCallBackGuard(browser.win, () => {})

    browser.pressBack()
    browser.pressBack()

    expect(browser.current().state).toMatchObject({ __NA: 'seed', [CALL_BACK_GUARD_KEY]: true })
  })

  it('can never walk out of the call — however many times back is pressed', () => {
    const browser = fakeBrowser(CALL_URL)
    const onBack = vi.fn()
    installCallBackGuard(browser.win, onBack)

    for (let i = 0; i < 5; i++) browser.pressBack()

    expect(onBack).toHaveBeenCalledTimes(5)
    expect(browser.current().url).toBe(CALL_URL)
    expect(browser.entries).toHaveLength(2) // never grows a trail to walk back through
  })

  it('stops intercepting once torn down, so leaving really works', () => {
    const browser = fakeBrowser(CALL_URL)
    const onBack = vi.fn()
    const teardown = installCallBackGuard(browser.win, onBack)

    teardown()
    browser.pressBack()

    expect(browser.listeners()).toBe(0)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('is installed by the call screen, and only there', () => {
    expect(call).toMatch(/installCallBackGuard\(window, \(\) => setMinimized\(true\)\)/)
    // Installed inside CallShell — i.e. only while the call screen is mounted,
    // never globally (the rest of the app keeps a normal back button).
    const shellAt = call.indexOf('function CallShell(')
    const installAt = call.indexOf('installCallBackGuard(window')
    expect(shellAt).toBeGreaterThan(-1)
    expect(installAt).toBeGreaterThan(shellAt)
  })
})
