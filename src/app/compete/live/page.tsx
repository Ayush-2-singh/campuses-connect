import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LiveHub from '@/components/live-battle/LiveHub'

export const metadata: Metadata = {
  title: 'Live Battle — ConnectToCampus',
  description: 'Host a live quiz for your stream and let students compete in real time.',
}

export default async function LiveBattlePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?redirect=/compete/live')

  return (
    <>
      <LiveHub user={{ id: user.id, email: user.email }} />
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '0 16px 24px' }}>
        Need more questions first? <Link href="/compete/live/questions">Open the question bank →</Link>
      </p>
    </>
  )
}
