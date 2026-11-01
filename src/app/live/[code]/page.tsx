import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoomPlayer from '@/components/live-battle/RoomPlayer'

export const metadata: Metadata = {
  title: 'Live quiz room — ConnectToCampus',
  description: 'Answer the live questions and follow the leaderboard in real time.',
}

/**
 * `/live/<code>` — the link hosts paste on the stream.
 *
 * The code is the only public input; everything else (joining, the question,
 * the countdown, scoring) happens through SECURITY DEFINER RPCs, so this page
 * needs no browser-side table access.
 */
export default async function LiveRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = (code ?? '').replace(/\D/g, '').slice(0, 6)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/auth/login?redirect=/live/${clean}`)

  return <RoomPlayer code={clean} />
}
