'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'

// ── Types ────────────────────────────────────────────────────
interface Integration {
  platform: string
  username: string
  display_name: string | null
  profile_url: string | null
  avatar_url: string | null
  is_verified: boolean
  stats: any
  synced_at: string | null
}

const PLATFORMS = [
  { key: 'github', name: 'GitHub', icon: '🐙', color: '#333', desc: 'Showcase your repos, contributions & languages' },
  { key: 'leetcode', name: 'LeetCode', icon: '🧩', color: '#FFA116', desc: 'Display solved problems, contest rating & streak' },
]

export default function IntegrationsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [usernameInput, setUsernameInput] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // ── Load data ────────────────────────────────────────────
  const loadIntegrations = useCallback(async (userId: string) => {
    const { data } = await supabase.rpc('get_user_integrations', { p_user_id: userId })
    setIntegrations((data as any[]) || [])
  }, [supabase])

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/auth/login?redirect=/integrations'); return }
      setUser(authUser)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(prof)
      await loadIntegrations(authUser.id)
      setLoading(false)
    }
    load()
  }, [])

  const getInteg = (platform: string) => integrations.find(i => i.platform === platform)

  // ── Connect platform ─────────────────────────────────────
  const connectPlatform = async (platform: string) => {
    const username = usernameInput[platform]?.trim()
    if (!username) { setError('Please enter your username'); return }
    setConnecting(platform)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/integrations/${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to connect')

      setSuccess(`${platform === 'github' ? 'GitHub' : 'LeetCode'} connected successfully!`)
      setUsernameInput(prev => ({ ...prev, [platform]: '' }))
      if (user) await loadIntegrations(user.id)
    } catch (err: any) {
      setError(err.message)
    }
    setConnecting(null)
    // Clear success after 5 seconds
    setTimeout(() => setSuccess(''), 5000)
  }

  // ── Disconnect platform ──────────────────────────────────
  const disconnectPlatform = async (platform: string) => {
    if (!confirm(`Disconnect your ${platform === 'github' ? 'GitHub' : 'LeetCode'} account?`)) return
    setConnecting(platform)
    try {
      await fetch(`/api/integrations/${platform}`, { method: 'DELETE', credentials: 'include' })
      setSuccess('Disconnected successfully')
      if (user) await loadIntegrations(user.id)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    }
    setConnecting(null)
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Integrations</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px', marginLeft: 34 }}>
          Connect your coding profiles to unlock the enhanced leaderboard
        </p>

        {/* Messages */}
        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'var(--success-light)', border: '1px solid var(--success-border, #16a34a33)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--success-text)', marginBottom: 16 }}>
            ✅ {success}
          </div>
        )}

        {/* Integration cards */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {PLATFORMS.map(p => {
              const integ = getInteg(p.key)
              const isConnected = !!integ
              const stats = integ?.stats || {}

              return (
                <div key={p.key}
                  style={{ background: 'var(--bg)', border: isConnected ? `2px solid ${p.color}` : '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>

                  {/* Platform header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                        {p.name}
                        {isConnected && (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600, marginLeft: 8, verticalAlign: 'middle' }}>
                            ✅ Connected
                          </span>
                        )}
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{p.desc}</p>
                    </div>
                  </div>

                  {/* Stats display (if connected) */}
                  {isConnected && p.key === 'github' && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                        {[
                          { label: 'Repos', value: stats.public_repos || 0, emoji: '📦' },
                          { label: 'Contributions', value: stats.total_contributions || 0, emoji: '💻' },
                          { label: 'Followers', value: stats.followers || 0, emoji: '👥' },
                        ].map(s => (
                          <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>{s.value.toLocaleString()}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{s.emoji} {s.label}</p>
                          </div>
                        ))}
                      </div>
                      {/* Top languages */}
                      {stats.top_languages?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {stats.top_languages.map((l: any) => (
                            <span key={l.language} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {l.language} ({l.repos})
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Top repos */}
                      {stats.top_repos?.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Top Repositories:</p>
                          {stats.top_repos.slice(0, 3).map((r: any) => (
                            <div key={r.name} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{r.name}</span>
                              {r.stars > 0 && <span style={{ color: 'var(--yellow-text)' }}>⭐ {r.stars}</span>}
                              {r.language && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-secondary)' }}>{r.language}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                        Last synced: {integ.synced_at ? new Date(integ.synced_at).toLocaleString() : 'Never'}
                      </p>
                    </div>
                  )}

                  {isConnected && p.key === 'leetcode' && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                        {[
                          { label: 'Total Solved', value: stats.total_solved || 0, emoji: '✅' },
                          { label: 'Easy', value: stats.easy_solved || 0, emoji: '🟢', color: '#00b8a3' },
                          { label: 'Medium', value: stats.medium_solved || 0, emoji: '🟡', color: '#ffc01e' },
                          { label: 'Hard', value: stats.hard_solved || 0, emoji: '🔴', color: '#ff375f' },
                          { label: 'Rating', value: stats.rating || 0, emoji: '🏆' },
                          { label: 'Contests', value: stats.contest_total || 0, emoji: '🎯' },
                        ].map(s => (
                          <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                            <p style={{ fontSize: 20, fontWeight: 800, color: (s as any).color || 'var(--text-primary)', margin: '0 0 2px' }}>{s.value.toLocaleString()}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{s.emoji} {s.label}</p>
                          </div>
                        ))}
                      </div>
                      {stats.recent_solved?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Recently Solved:</p>
                          {stats.recent_solved.slice(0, 3).map((s: any) => (
                            <div key={s.slug} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>
                              <a href={`https://leetcode.com/problems/${s.slug}/`} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                {s.title}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                        Last synced: {integ.synced_at ? new Date(integ.synced_at).toLocaleString() : 'Never'}
                      </p>
                    </div>
                  )}

                  {/* Connect / Disconnect */}
                  {isConnected ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => connectPlatform(p.key)} disabled={connecting === p.key}
                        style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        🔄 {connecting === p.key ? 'Syncing...' : 'Re-sync Stats'}
                      </button>
                      <button onClick={() => disconnectPlatform(p.key)} disabled={connecting === p.key}
                        style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={usernameInput[p.key] || ''}
                          onChange={e => setUsernameInput(prev => ({ ...prev, [p.key]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && connectPlatform(p.key)}
                          placeholder={`Enter your ${p.name} username`}
                          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: p.key === 'github' ? 'monospace' : 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        />
                        <button onClick={() => connectPlatform(p.key)} disabled={connecting === p.key}
                          style={{ width: '100%', padding: '12px 20px', borderRadius: 10, border: 'none', background: connecting === p.key ? 'var(--disabled)' : p.color, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {connecting === p.key ? 'Connecting...' : `🔗 Connect ${p.name}`}
                        </button>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        💡 Your {p.name} profile must be public to connect
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Info card */}
            <div style={{ background: 'var(--accent-light)', borderRadius: 14, padding: '16px 18px', marginTop: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-text)', margin: '0 0 8px' }}>🏆 Enhanced Leaderboard</h4>
              <p style={{ fontSize: 12.5, color: 'var(--accent-text)', margin: 0, lineHeight: 1.7 }}>
                Connecting your profiles boosts your leaderboard ranking! The combined score considers:
                <strong> Karma</strong> (platform activity) +
                <strong> GitHub contributions</strong> (coding activity) +
                <strong> LeetCode solved</strong> (DSA practice) +
                <strong> Contest rating</strong> (competitive coding) +
                <strong> Streak</strong> (consistency).
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
