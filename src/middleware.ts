import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session refresh + route protection.
 *
 * Every matched request creates a REQUEST-SCOPED Supabase server client
 * (never module scope — cross-user session leakage) and calls getUser(),
 * which refreshes the access token via the httpOnly refresh-token cookie
 * when needed. Both getAll and setAll must be implemented for the refresh
 * rotation to work; the updated cookies are written to the response.
 */
export function loginRedirect(request: NextRequest) {
  // Preserve the original destination so post-login we can return there.
  const url = new URL('/auth/login', request.url)
  url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  if (path.startsWith('/_next') || path.includes('.')) return supabaseResponse

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Request cookies (for downstream reads)…
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // …and response cookies (what the browser actually stores) on a
          // mutable response, so the refreshed session isn't lost.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refresh session on every request — keeps users logged in (TEST 7/8).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // /admin: authenticated platform_admin / campus_admin only.
  if (path.startsWith('/admin')) {
    if (!user) return loginRedirect(request)
    const { data: grants } = await supabase.rpc('my_admin_grants')
    const isAdmin = (grants as any[])?.some(
      (grant: any) => grant.admin_type === 'platform_admin' || grant.admin_type === 'campus_admin'
    )
    if (!isAdmin) return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Auth pages redirect to feed if already signed in — except the
  // password-recovery pages (email-link targets) and the OAuth callback.
  if (
    user &&
    path.startsWith('/auth') &&
    !path.startsWith('/auth/reset-password') &&
    !path.startsWith('/auth/forgot-password') &&
    !path.startsWith('/auth/callback')
  ) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // /onboarding: authenticated users only; unauthenticated visitors go to
  // login with ?redirect=/onboarding so they land back here post-login.
  if (!user && path.startsWith('/onboarding')) return loginRedirect(request)

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
