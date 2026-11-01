'use client'

/**
 * `/compete/live/questions` — the host's question bank.
 *
 * Signed-in only: every row here belongs to its creator (enforced by RLS), so
 * the route simply sends a visitor without a session to the login page with a
 * redirect back here rather than rendering an empty editor.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import QuestionBank from '@/components/live-battle/QuestionBank'

export default function QuestionBankPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!authUser) {
        router.replace('/auth/login?redirect=' + encodeURIComponent('/compete/live/questions'))
        return
      }
      setUser(authUser)
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      if (cancelled) return
      setProfile(data)
      setReady(true)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div style={{ minHeight: 'var(--app-vh)', display: 'grid', placeItems: 'center' }}>
        <div className="skeleton" style={{ width: 220, height: 18, borderRadius: 8 }} />
      </div>
    )
  }

  return (
    <Layout user={user} profile={profile}>
      <QuestionBank user={user} profile={profile} />
    </Layout>
  )
}
