/**
 * Deep-link registry for the CampusConnect Android shell.
 *
 * Android delivers custom-scheme links (`connecttocampus://...`) to the app
 * instead of the WebView. This module is the single place that receives them,
 * lets interested modules claim one, and otherwise forwards the link into the
 * running web app as a normal in-app navigation.
 *
 * Deliberately framework-free: no React, no Supabase. `oauth.ts` claims auth
 * callbacks, everything else falls through to `navigateInApp`.
 */

const DEEP_LINK_SCHEME = 'connecttocampus:'

/**
 * A handler receives the parsed deep link.
 * Return `true` to claim it and stop propagation.
 */
export type DeepLinkHandler = (url: URL) => boolean | void

const handlers = new Set<DeepLinkHandler>()

/**
 * A link that arrived before any handler registered (cold start from a link,
 * or a backgrounded app resuming straight into the auth callback). Held here
 * so `onDeepLink` can replay it instead of dropping it.
 */
let pending: string | null = null

/** True for links our Android manifest is configured to receive. */
export function isDeepLink(raw: string): boolean {
  return typeof raw === 'string' && raw.startsWith(DEEP_LINK_SCHEME)
}

/** Parse a deep link, tolerating anything malformed. */
export function parseDeepLink(raw: string): URL | null {
  if (!isDeepLink(raw)) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * Navigate the WebView to a deep link's path on the current origin.
 *
 * We resolve against `window.location.origin` rather than an env var: in
 * remote mode the WebView's origin *is* the deployed app, so this stays
 * correct for production, preview and LAN development targets alike.
 */
function navigateInApp(url: URL): void {
  if (typeof window === 'undefined') return
  const target = `${url.pathname}${url.search}${url.hash}`
  if (!target || target === '/' + '#') return
  window.location.assign(target)
}

/** Route a raw deep link to a claiming handler, else navigate in-app. */
export function dispatchDeepLink(raw: string): void {
  const url = parseDeepLink(raw)
  if (!url) return

  for (const handler of handlers) {
    try {
      if (handler(url) === true) return
    } catch (err) {
      console.error('[native] deep-link handler threw:', err)
    }
  }

  navigateInApp(url)
}

/**
 * Subscribe to deep links. Returns an unsubscribe function.
 * A pending cold-start link is replayed immediately on first subscribe.
 */
export function onDeepLink(handler: DeepLinkHandler): () => void {
  handlers.add(handler)

  if (pending) {
    const replay = pending
    pending = null
    // Defer so the subscriber finishes its own setup before handling the link.
    setTimeout(() => {
      if (handlers.has(handler)) dispatchDeepLink(replay)
    }, 0)
  }

  return () => {
    handlers.delete(handler)
  }
}

/**
 * Hold a link that arrived before handlers existed and no handler claimed it
 * at dispatch time. Only used for cold starts.
 */
export function setPendingDeepLink(raw: string | null | undefined): void {
  if (!raw || !isDeepLink(raw)) return
  if (handlers.size > 0) {
    dispatchDeepLink(raw)
    return
  }
  pending = raw
}

/** Build an absolute deep link for a path, e.g. `/auth/callback` → `connecttocampus://auth/callback`. */
export function buildDeepLink(path: string): string {
  return `${DEEP_LINK_SCHEME}//${path.replace(/^\/+/, '')}`
}
