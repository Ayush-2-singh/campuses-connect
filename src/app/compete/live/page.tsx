import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Layout from '@/components/Layout'
import LiveHub from '@/components/live-battle/LiveHub'

export const metadata: Metadata = {
  title: 'Live Battle — ConnectToCampus',
  description: 'Host a live quiz for your stream and let students compete in real time.',
}

export default async function LiveBattlePage({ searchParams }: { searchParams: Promise<{ quiz?: string }> }) {
  const { quiz } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?redirect=/compete/live')

  // The hub is a Compete section page, so it keeps the same shell as the
  // rest of the app (top nav, avatar menu, section nav inside the hub).
  const profile = (await supabase.from('profiles').select('*').eq('id', user.id).single()).data

  return (
    <Layout user={user} profile={profile}>
      <LiveHub user={{ id: user.id, email: user.email }} initialQuizId={quiz} />
    </Layout>
  )
}
