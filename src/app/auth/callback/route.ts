import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    // Create a mutable response so cookie changes are captured
    const response = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Write to both the request (for subsequent reads) and the
            // response (so Set-Cookie headers are sent to the browser).
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Check if profile is complete
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, campus_id')
          .eq('id', user.id)
          .single()

        // If profile has username and campus = onboarding done → feed
        // Otherwise → onboarding
        const target = profile?.username && profile?.campus_id ? '/feed' : '/onboarding'
        const redirectResponse = NextResponse.redirect(`${origin}${target}`)

        // Propagate all session cookies to the redirect response
        response.cookies.getAll().forEach(({ name, value }) => redirectResponse.cookies.set(name, value))

        return redirectResponse
      }
    }
  }

  // Something went wrong — send user to login with error info
  return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`)
}
