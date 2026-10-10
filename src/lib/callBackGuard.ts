// ═══════════════════════════════════════════════════════════════════════════
// CALL BACK GUARD — make the browser's back button MINIMIZE a live voice call
// instead of walking out of it.
//
// The call screen's LiveKit room lives inside the `/…/call` route, so any real
// navigation unmounts it and the unmount cleanup runs the leave RPC — i.e.
// back used to silently take your voice out of the room for everyone else.
//
// The trick is that we never let a navigation happen. On mount we push ONE
// duplicate entry of the current URL, so the next back press moves between two
// entries with the SAME url: the address is unchanged by the time `popstate`
// fires, the router sees no path change, and nothing unmounts. We then push
// the duplicate straight back so the user stays put forever, and the only
// visible effect is the screen collapsing.
//
// No React, no LiveKit — just the two History APIs, so it is unit-testable.
// ═══════════════════════════════════════════════════════════════════════════

/** The slice of `window` this needs — `window` itself satisfies it. */
export interface BackGuardWindow {
  location: { href: string }
  history: {
    state: unknown
    pushState(state: unknown, title: string, url?: string | URL | null): void
  }
  addEventListener(type: 'popstate', listener: () => void): void
  removeEventListener(type: 'popstate', listener: () => void): void
}

/** Marker so the duplicate entry is identifiable in the history state. */
export const CALL_BACK_GUARD_KEY = '__ccCallGuard'

/**
 * Install the guard. `onBack` runs on every intercepted back press — the call
 * screen uses it to minimize itself.
 *
 * @returns a teardown that removes the listener (call it on unmount).
 */
export function installCallBackGuard(win: BackGuardWindow, onBack: () => void): () => void {
  /**
   * Copy the CURRENT entry's state instead of replacing it. Next keeps its own
   * router markers in `history.state` (the `__NA` keys); clobbering them
   * breaks client-side back/forward for the whole app, not just this screen.
   */
  const pushGuard = () => {
    const prev = win.history.state
    win.history.pushState(
      { ...(prev && typeof prev === 'object' ? prev : {}), [CALL_BACK_GUARD_KEY]: true },
      '',
      win.location.href
    )
  }

  pushGuard()

  const onPopState = () => {
    pushGuard()
    onBack()
  }

  win.addEventListener('popstate', onPopState)
  return () => win.removeEventListener('popstate', onPopState)
}
