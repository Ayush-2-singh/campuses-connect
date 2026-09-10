import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSafeRedirect } from '@/lib/auth'

/**
 * OAuth / recovery callback.
 *
 * Flow: Google (or recovery email) → Supabase auth server → this route with
 * ?code=... → exchangeCodeForSession() → session persisted as SSR cookies →
 * redirect straight to the destination. The user never sees another login
 * screen or confirmation page.
 *
 * Request-scoped client only (created per GET call) — never at module scope,
 * to avoid cross-user cookie/session leakage.
 *
 * Security: `code`, access/refresh tokens are never logged. Only non-secret
 * error codes/descriptions are logged for debugging.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeRedirect(requestUrl.searchParams.get('next'), '/feed')

  // Supabase forwards the provider's failure reason on the callback URL
  // (e.g. ?error=redirect_url_mismatch&error_description=...). Surface it on
  // the login page instead of a generic failure.
  const oauthError = requestUrl.searchParams.get('error')
  const oauthErrorDescription = requestUrl.searchParams.get('error_description')

  const loginErrorUrl = (reason: string) => {
    const url = new URL('/auth/login', requestUrl.origin)
    url.searchParams.set('error', reason)
    return url
  }

  if (oauthError) {
    console.error('[auth/callback] provider error:', oauthError, oauthErrorDescription || '')
    // Forward the raw description (truncated, non-sensitive) so the login
    // page can show exactly WHY the provider blocked the flow.
    const errUrl = loginErrorUrl(oauthError)
    if (oauthErrorDescription) {
      errUrl.searchParams.set('ed', oauthErrorDescription.slice(0, 200))
    }
    return NextResponse.redirect(errUrl)
  }

  if (!code) {
    console.error('[auth/callback] missing code — flow never started or link already used.')
    return NextResponse.redirect(loginErrorUrl('oauth_failed'))
  }

  // Captured session cookies (Set-Cookie payloads from exchangeCodeForSession).
  let sessionCookies: { name: string; value: string; options?: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write to the request (for reads later in this handler) and stash
          // for the redirect response — that is what actually persists the
          // session in the browser's SSR cookie jar.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          sessionCookies = cookiesToSet
        },
      },
    }
  )

  // PKCE: exchange the one-time authorization code for the Supabase session
  // (access JWT + refresh token live ONLY in httpOnly SSR cookies).
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    const errUrl = loginErrorUrl('oauth_failed')
    errUrl.searchParams.set('ed', error.message.slice(0, 200))
    const response = NextResponse.redirect(errUrl)
    sessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    return response
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    console.error('[auth/callback] code exchanged but no user returned.')
    return NextResponse.redirect(loginErrorUrl('oauth_failed'))
  }

  // Route: onboarding not finished → /onboarding (the DB trigger
  // handle_new_user() has already created the profile row — nothing to
  // create here). Otherwise → the intended destination.
  let target = next
  if (target === '/feed') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, campus_id')
      .eq('id', user.id)
      .maybeSingle()
    target = profile?.username && profile?.campus_id ? '/feed' : '/onboarding'
  }

  const response = NextResponse.redirect(new URL(target, requestUrl.origin))
  sessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}
