'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const ALL_FEATURES = [
  { icon: '🧠', title: 'AI Brain', desc: 'Upload your notes & ask anything — unlimited, powered by Grok AI' },
  { icon: '📊', title: 'Advanced Analytics', desc: 'Detailed insights into your activity, growth, and engagement' },
  { icon: '🏅', title: 'Badges & Streaks', desc: 'Earn badges and maintain streaks — all tiers unlocked' },
  { icon: '⚡', title: 'Unlimited Usage', desc: 'No throttling, no limits — use every feature as much as you want' },
  { icon: '🎨', title: 'Custom Themes', desc: 'Personalize your experience with dark and light themes' },
  { icon: '🚀', title: 'Priority Features', desc: 'Early access to every new feature we ship' },
  { icon: '💬', title: 'Communities', desc: 'Access all study groups and communities' },
  { icon: '📝', title: 'Notes Library', desc: 'Upload, share, and download unlimited study materials' },
]

export default function PremiumPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
    }
    load()
  }, [])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 40%, var(--accent-purple)) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
            boxShadow: 'var(--accent-glow)',
          }}>
            🎉
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Everything is Free!
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            All features on ConnectToCampus are completely free. No subscriptions, no paywalls — ever.
          </p>
          <div style={{
            marginTop: 12, padding: '8px 16px', borderRadius: 20,
            background: 'var(--success-light)', color: 'var(--success-text)',
            fontSize: 13, fontWeight: 600, display: 'inline-block',
          }}>
            ✅ All features unlocked for everyone
          </div>
        </div>

        {/* Features grid */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', textAlign: 'center' }}>
            All features — free for everyone
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {ALL_FEATURES.map(f => (
              <div key={f.title}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <p style={{ fontSize: 24, margin: 0 }}>{f.icon}</p>
                  <span style={{ fontSize: 10, background: 'var(--success-light)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>FREE</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{f.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <button onClick={() => router.push('/feed')}
            style={{
              padding: '12px 32px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: 'var(--on-accent)',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: 'var(--accent-glow)',
            }}>
            Start Exploring →
          </button>
        </div>
      </div>
    </Layout>
  )
}
