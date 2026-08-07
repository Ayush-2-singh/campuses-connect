'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

export default function InsightsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [insights, setInsights] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data } = await supabase.from('campus_insights').select('*').order('created_at', { ascending: false }).limit(20)
      setInsights(data || [])
    }
    init()
  }, [supabase])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/college')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Campus Insights</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          {admin.isPlatformAdmin || admin.isCampusAdmin ? 'Pulse of your campus — add insights below.' : 'Data-driven pulse of your campus.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {insights.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No insights yet</p>
          ) : insights.map((i: any) => (
            <div key={i.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{i.title}</p>
              {i.body && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{i.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
