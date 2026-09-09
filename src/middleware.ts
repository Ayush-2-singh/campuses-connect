import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function loginRedirect(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (path.startsWith('/admin')) {
    if (!user) return loginRedirect(request)
    const { data: grants } = await supabase.rpc('my_admin_grants')
    const isAdmin = (grants as any[])?.some(
      (grant: any) => grant.admin_type === 'platform_admin' || grant.admin_type === 'campus_admin'
    )
    if (!isAdmin) return NextResponse.redirect(new URL('/feed', request.url))
  }

  if (user && path.startsWith('/auth') &&
      !path.startsWith('/auth/reset-password') &&
      !path.startsWith('/auth/forgot-password') &&
      !path.startsWith('/auth/callback')) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  if (!user && path.startsWith('/onboarding')) return loginRedirect(request)

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
