import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HostPanel from '@/components/live-battle/HostPanel'

export const metadata: Metadata = {
  title: 'Host controls — ConnectToCampus',
  description: 'Start, advance and close a live quiz room.',
}

export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/auth/login?redirect=/compete/live/host/${id}`)

  return <HostPanel competitionId={id} />
}
