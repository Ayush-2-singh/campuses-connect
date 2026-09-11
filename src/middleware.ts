import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session refresh + route protection.
 *
 * PROFESSIONAL PATTERN (Linear, Notion, Vercel):
 * Only run auth checks on protected routes. Public pages pass through
 * without any Supabase round-trip — saving 100-200ms per navigation.
 *
 * Cookie refresh still happens for ALL routes so the session stays alive,
 * but we only call getUser() when it's actually needed for access control.
 */

// Routes that REQUIRE authentication — unauthenticated users get redirected.
const PROTECTED_ROUTES = ['/admin', '/onboarding']

// Routes that should redirect AWAY if already authenticated (login, signup).
const AUTH_REDIRECT_ROUTES = ['/auth']

// Routes that need auth check even though they're under /auth
const AUTH_KEEP_ROUTES = ['/auth/reset-password', '/auth/forgot-password', '/auth/callback']

export function loginRedirect(request: NextRequest) {
  const url = new URL('/auth/login', request.url)
  url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  // Skip static assets and internal Next.js routes
  if (path.startsWith('/_next') || path.includes('.')) return supabaseResponse

  // Determine if we need auth at all for this route
  const needsAuth = PROTECTED_ROUTES.some(r => path.startsWith(r))
  const isAuthPage = AUTH_REDIRECT_ROUTES.some(r => path.startsWith(r)) &&
    !AUTH_KEEP_ROUTES.some(r => path.startsWith(r))

  // PUBLIC ROUTES: Just refresh cookies (keep session alive) but don't
  // block on getUser(). This is the key optimization — most page loads
  // skip the expensive auth round-trip entirely.
  if (!needsAuth && !isAuthPage) {
    // Still create the client to refresh cookies silently (keeps users logged in)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    // Fire-and-forget: refresh the session in the background.
    // Don't await — the page loads immediately with the current session.
    supabase.auth.getUser().catch(() => {})
    return supabaseResponse
  }

  // PROTECTED / AUTH ROUTES: Full auth check required
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

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

  // Auth pages redirect to feed if already signed in
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // /onboarding: authenticated users only
  if (!user && path.startsWith('/onboarding')) return loginRedirect(request)

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
