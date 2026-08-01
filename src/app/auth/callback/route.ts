import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Check if profile is complete
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, campus_id')
          .eq('id', user.id)
          .single()

        // If profile has username and campus = onboarding done → feed
        // Otherwise → onboarding
        if (profile?.username && profile?.campus_id) {
          return NextResponse.redirect(`${origin}/feed`)
        } else {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`)
}
