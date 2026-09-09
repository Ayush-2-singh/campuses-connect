import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSafeRedirect } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const requestedNext = requestUrl.searchParams.get('next')
  const next = requestedNext === '/auth/reset-password'
    ? requestedNext
    : getSafeRedirect(requestedNext, '/feed')

  if (!code) {
    const errorUrl = new URL('/auth/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'oauth_failed')
    return NextResponse.redirect(errorUrl)
  }

  let sessionCookies: any[] = []
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
          sessionCookies = cookiesToSet
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const errorUrl = new URL('/auth/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'oauth_failed')
    const response = NextResponse.redirect(errorUrl)
    sessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    return response
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const errorUrl = new URL('/auth/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'oauth_failed')
    return NextResponse.redirect(errorUrl)
  }

  let target = next
  if (next === '/feed') {
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
