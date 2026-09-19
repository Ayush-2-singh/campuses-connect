/**
 * Wires Capacitor's `appUrlOpen` event into the deep-link registry.
 *
 * Split from index.ts so the registry stays free of Capacitor imports and can
 * be unit-tested / reused without the native runtime.
 */

import { dispatchDeepLink, setPendingDeepLink } from './deeplink'

/**
 * Attach the native deep-link listener.
 * Resolves to a cleanup function that removes it.
 */
export async function registerDeepLinkWiring(): Promise<() => void> {
  const { App } = await import('@capacitor/app')

  const handle = await App.addListener('appUrlOpen', ({ url }) => {
    if (!url) return
    dispatchDeepLink(url)
  })

  // Also honour a link that launched the app, in case the event fired before
  // this listener existed.
  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) setPendingDeepLink(launch.url)
  } catch {
    /* nothing pending */
  }

  return () => void handle.remove()
}
