import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  FALLBACK_ROUTE,
  JOBS_FALLBACK_ROUTE,
  SALES_FALLBACK_ROUTE,
  isHiddenJobsPath,
  isHiddenSalesPath,
  isRetiredPath,
} from '@/lib/featureGates'

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

function loginRedirect(request: NextRequest) {
  const url = new URL('/auth/login', request.url)
  url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  // Skip static assets and internal Next.js routes
  if (path.startsWith('/_next') || path.includes('.')) return supabaseResponse

  // ── Phase-1 feature gate (V4 pivot → campus hiring) ──────────────────────
  // Retired social routes redirect to a kept hub instead of dead-ending. This
  // is fully reversible — see src/lib/featureGates.ts (SOCIAL_LAYER_RETIRED).
  // API routes are never gated here, so backend contracts stay intact.
  if (!path.startsWith('/api/') && isRetiredPath(path)) {
    return NextResponse.redirect(new URL(FALLBACK_ROUTE, request.url))
  }

  // The recruiter storefront is hidden while the product is student-facing.
  // Only `/hire` is matched — delivered shortlist links (`/hire/b/...`) stay
  // reachable. Fully reversible: see RECRUITER_SALES_HIDDEN in featureGates.
  if (!path.startsWith('/api/') && isHiddenSalesPath(path)) {
    return NextResponse.redirect(new URL(SALES_FALLBACK_ROUTE, request.url))
  }

  // The job board and its tracker are hidden while the product is
  // placement information. Reversible: JOBS_BOARD_HIDDEN in featureGates.
  if (!path.startsWith('/api/') && isHiddenJobsPath(path)) {
    return NextResponse.redirect(new URL(JOBS_FALLBACK_ROUTE, request.url))
  }

  // Determine if we need auth at all for this route
  const needsAuth = PROTECTED_ROUTES.some((r) => path.startsWith(r))
  const isAuthPage =
    AUTH_REDIRECT_ROUTES.some((r) => path.startsWith(r)) && !AUTH_KEEP_ROUTES.some((r) => path.startsWith(r))

  // PUBLIC ROUTES: Refresh cookies (keep session alive).
  // API routes MUST await getUser() so the session is refreshed before
  // the route handler reads cookies. Page routes skip it for speed.
  if (!needsAuth && !isAuthPage) {
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
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
          },
        },
      }
    )

    const isApiRoute = path.startsWith('/api/')
    if (isApiRoute) {
      // API routes: await getUser() so cookies are refreshed before the handler runs
      await supabase.auth.getUser().catch(() => {})
    } else {
      // Page routes: fire-and-forget for speed (session refreshes in background)
      supabase.auth.getUser().catch(() => {})
    }
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
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
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
    if (!isAdmin) return NextResponse.redirect(new URL(JOBS_FALLBACK_ROUTE, request.url))
  }

  // Auth pages redirect to feed if already signed in
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL(JOBS_FALLBACK_ROUTE, request.url))
  }

  // /onboarding: authenticated users only
  if (!user && path.startsWith('/onboarding')) return loginRedirect(request)

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
