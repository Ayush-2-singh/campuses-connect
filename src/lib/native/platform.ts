/**
 * Platform detection only — split into its own module so native feature
 * modules (oauth, media) can use it without importing `./index`, which would
 * create an import cycle.
 *
 * Detection reads the global object Capacitor injects into the WebView before
 * app code runs, so asking "am I native?" costs no import and cannot run
 * plugin code during SSR.
 */

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false
}

/** 'android' | 'ios' | 'web' — 'web' when not running natively. */
export function nativePlatform(): string {
  if (typeof window === 'undefined') return 'web'
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web'
}
