import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Admin panel: platform_admin or campus_admin grant only
  if (path.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const { data: grants } = await supabase
      .rpc('my_admin_grants')
    const isAdmin = (grants as any[])?.some(
      (g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin'
    )
    if (!isAdmin) return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Auth pages redirect to feed if logged in — except the password-recovery
  // pages, which must load even for signed-in users clicking an email link.
  if (user && path.startsWith('/auth') && !path.startsWith('/auth/reset-password') && !path.startsWith('/auth/forgot-password') && !path.startsWith('/auth/callback')) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Onboarding protection
  if (!user && path.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
