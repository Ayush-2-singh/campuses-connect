/**
 * Native (Capacitor) platform bridge — the ONLY place that talks to Capacitor.
 *
 * Design rules, so the Android shell can never break the web app:
 *   1. Every function early-returns on the web, and `isNativePlatform()` reads
 *      the global Capacitor injects into the WebView, so nothing is imported
 *      (and nothing is added to the web bundle) just to answer "am I native?".
 *   2. Native plugins are dynamically imported inside the function that needs
 *      them, so they are never evaluated during SSR or on the web.
 *   3. Each setup step is isolated: one failing plugin degrades that one
 *      feature instead of taking down the app shell.
 */

import { registerDeepLinkWiring } from './deeplink-wiring'
import { registerNativeOAuth } from './oauth'
import { installExternalLinkInterceptor } from './externalLinks'

export { isNativePlatform, nativePlatform } from './platform'
export { onDeepLink, buildDeepLink, isDeepLink } from './deeplink'
export { signInWithGoogleNative, NATIVE_AUTH_CALLBACK } from './oauth'
export { pickImageFile, isUserCancellation } from './media'
export { openExternalUrl, openOrDownloadFile } from './externalLinks'

export interface NativeInitOptions {
  /** Called when the app returns to the foreground. */
  onResume?: () => void
}

/**
 * Wire up the native shell. Safe to call on the web — it resolves to a no-op.
 * Resolves to a cleanup function that detaches every listener.
 */
export async function initNative(options: NativeInitOptions = {}): Promise<() => void> {
  const { isNativePlatform } = await import('./platform')
  if (!isNativePlatform()) return () => {}

  const cleanups: Array<() => void> = []
  const detach = () =>
    cleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        /* listener already gone */
      }
    })

  // Registry first, so an auth callback arriving during startup has somewhere
  // to go. Then visual chrome, then input/navigation, then device state.
  const steps: Array<[string, () => Promise<() => void>]> = [
    ['oauth', async () => registerNativeOAuth()],
    ['statusBar', () => setupStatusBar()],
    ['appState', () => setupAppState(options)],
    ['backButton', () => setupBackButton()],
    ['network', () => setupNetworkBridge()],
    ['externalLinks', async () => installExternalLinkInterceptor()],
    ['deepLinks', () => registerDeepLinkWiring()],
  ]

  for (const [name, setup] of steps) {
    try {
      cleanups.push(await setup())
    } catch (err) {
      // Never let one native capability break the shell.
      console.error(`[native] failed to initialise ${name}:`, err)
    }
  }

  return detach
}

/**
 * Match the Android status bar to the app's current theme.
 *
 * The web app already writes `data-theme="light|dark"` onto <html> (see the
 * inline theme script in src/app/layout.tsx), so we observe that attribute
 * instead of duplicating theme state. That keeps this fully decoupled from the
 * existing ThemeToggle component.
 */
async function setupStatusBar(): Promise<() => void> {
  const { StatusBar, Style } = await import('@capacitor/status-bar')

  // Keep WebView content below the bar — the app already handles its own
  // safe-area padding, so an overlay would double up.
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})

  const apply = async (isDark: boolean) => {
    try {
      // Style.Dark = light text/icons, for dark backgrounds.
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
      await StatusBar.setBackgroundColor({ color: isDark ? '#0F1115' : '#FFFFFF' })
    } catch {
      /* unsupported on this Android version — cosmetic only */
    }
  }

  const readTheme = () => document.documentElement.getAttribute('data-theme') !== 'light'

  await apply(readTheme())

  const observer = new MutationObserver(() => void apply(readTheme()))
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  return () => observer.disconnect()
}

/**
 * Android hardware/gesture back.
 *
 * The WebView owns its own history in remote mode, so back should walk that
 * history first and only exit the app from a root screen.
 */
async function setupBackButton(): Promise<() => void> {
  const { App } = await import('@capacitor/app')

  const handle = await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.exitApp()
    }
  })

  return () => void handle.remove()
}

/**
 * Bridge @capacitor/network into the browser's online/offline events.
 *
 * `navigator.onLine` is unreliable inside an Android WebView, which would
 * leave the existing OfflineIndicator and useOnlineStatus() hook stuck in the
 * "online" state. Rather than rewrite those, we redefine `navigator.onLine`
 * and dispatch the events they already listen for.
 */
async function setupNetworkBridge(): Promise<() => void> {
  const { Network } = await import('@capacitor/network')

  const overrideOnlineState = (connected: boolean) => {
    try {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => connected,
      })
    } catch {
      /* non-configurable on some engines — the event still fires */
    }
    window.dispatchEvent(new Event(connected ? 'online' : 'offline'))
  }

  const status = await Network.getStatus()
  overrideOnlineState(status.connected)

  const handle = await Network.addListener('networkStatusChange', (s) => {
    overrideOnlineState(s.connected)
  })

  return () => void handle.remove()
}

/**
 * Session hygiene on foreground (spec §4 — "handle expired sessions").
 *
 * We only report the resume; NativeShell performs the Supabase call so this
 * module stays free of any dependency on the data layer.
 */
async function setupAppState(options: NativeInitOptions): Promise<() => void> {
  const { App } = await import('@capacitor/app')

  const handle = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) options.onResume?.()
  })

  return () => void handle.remove()
}
