/**
 * Google sign-in for the Capacitor Android shell.
 *
 * WHY THIS EXISTS — the web flow cannot be reused verbatim on Android:
 *
 * Google refuses to run its OAuth consent screen inside embedded WebViews and
 * fails with `disallowed_useragent`. The `GoogleSignInButton` on the web calls
 * `signInWithOAuth()` without `skipBrowserRedirect`, which navigates the page
 * straight to Google — inside the app that navigation lands in the WebView and
 * is rejected.
 *
 * The native flow therefore opens the consent screen in the system browser
 * (Chrome Custom Tabs, which Google accepts) and comes back to the app through
 * a custom-scheme deep link:
 *
 *   WebView  signInWithOAuth({ skipBrowserRedirect: true })
 *              └─ PKCE code verifier stored in the WebView's cookie jar
 *   Browser  Google consent → Supabase
 *   Deep link connecttocampus://auth/callback?code=...
 *              └─ back into the SAME WebView, where the verifier still lives
 *   WebView  exchangeCodeForSession(code) → session cookies set
 *
 * Everything else is untouched: same Supabase project, same auth users, same
 * profiles, same RLS. A session created here is a normal Supabase session, so
 * an account made on the web signs in here and vice versa.
 *
 * REQUIRED ONE-TIME SUPABASE CHANGE: add `connecttocampus://auth/callback` to
 * Authentication → URL Configuration → Redirect URLs. Without it Supabase
 * refuses the redirectTo value and users see the "oauth_failed" message the
 * login page already renders.
 */

import { isNativePlatform } from './platform'
import { buildDeepLink, onDeepLink } from './deeplink'

/** Redirect target registered for the Android deep link. */
export const NATIVE_AUTH_CALLBACK = buildDeepLink('auth/callback')

/** True while a sign-in is in flight, so a duplicate deep link is ignored. */
let inFlight = false

/** Where to land after a successful sign-in. Always an app-relative path. */
let destination = '/feed'

const LOGIN_PATH = '/auth/login'

/**
 * Send the user back to the login screen with an error the page already knows
 * how to explain (see the `?error=` + `?ed=` handling in app/auth/login).
 */
function failWith(errorCode: string, detail?: string): void {
  inFlight = false
  const params = new URLSearchParams({ error: errorCode })
  if (detail) params.set('ed', detail.slice(0, 300))
  // Full reload rather than router.push: it re-runs middleware with a clean
  // cookie state, which is what we want after a failed auth attempt.
  window.location.replace(`${LOGIN_PATH}?${params.toString()}`)
}

function isAuthCallback(url: URL): boolean {
  return url.protocol === 'connecttocampus:' && url.host === 'auth' && url.pathname.startsWith('/callback')
}

/**
 * Start Google sign-in in the system browser.
 *
 * Rejects only when the flow could not be started at all (no URL returned);
 * once the browser opens, the outcome arrives via the deep link.
 */
export async function signInWithGoogleNative(next: string = '/feed'): Promise<void> {
  if (!isNativePlatform()) {
    throw new Error('signInWithGoogleNative() can only be used on a native platform.')
  }
  if (inFlight) return

  const [{ Browser }, { createClient }] = await Promise.all([
    import('@capacitor/browser'),
    import('@/lib/supabase/client'),
  ])

  const supabase = createClient()

  // PKCE is the default for @supabase/ssr's browser client: the code verifier
  // is written to an origin-scoped cookie that the deep link handler reads
  // back in this same WebView.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK,
      skipBrowserRedirect: true, // we open the URL ourselves, in the system browser
    },
  })

  if (error) throw error
  if (!data?.url) throw new Error('Google sign-in could not be started.')

  inFlight = true
  destination = next.startsWith('/') ? next : '/feed'
  await Browser.open({ url: data.url })
}

/**
 * Finish the flow: exchange the authorization code for a session.
 * Runs inside the WebView, so the PKCE verifier cookie is available.
 */
async function completeSignIn(url: URL): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  await Browser.close().catch(() => {})

  const providerError = url.searchParams.get('error')
  if (providerError) {
    failWith(providerError, url.searchParams.get('error_description') ?? undefined)
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    failWith('oauth_failed', 'no_authorization_code')
    return
  }

  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    failWith('oauth_failed', error.message)
    return
  }

  inFlight = false
  // Full navigation so server components and middleware see the new session.
  window.location.replace(destination)
}

/**
 * Claim auth callbacks from the deep-link registry.
 * Returns the unsubscribe function.
 *
 * The registry decides synchronously whether a link was claimed, so this
 * handler must answer `true` before the async work finishes — otherwise the
 * registry would also treat the callback as a plain in-app navigation.
 */
export function registerNativeOAuth(): () => void {
  return onDeepLink((url) => {
    if (!isAuthCallback(url)) return false

    if (!inFlight) {
      // A callback with no flow in progress: stale link, or the app was killed
      // mid-sign-in. Surface it rather than silently doing nothing.
      failWith('oauth_failed', 'sign_in_not_in_progress')
      return true
    }

    void completeSignIn(url).catch((err: unknown) => {
      failWith('oauth_failed', err instanceof Error ? err.message : String(err))
    })
    return true
  })
}
