'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'

type Tab = 'overall' | 'github' | 'leetcode' | 'karma'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overall', label: '🏆 Overall', icon: '🏆' },
  { key: 'github', label: '🐙 GitHub', icon: '🐙' },
  { key: 'leetcode', label: '🧩 LeetCode', icon: '🧩' },
  { key: 'karma', label: '⭐ Karma', icon: '⭐' },
]

export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overall')
  const router = useRouter()
  const supabase = createClient()

  // ── Load enhanced leaderboard ────────────────────────────
  const loadLeaderboard = useCallback(async (tab: Tab) => {
    setLoading(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(prof)
      }

      // Use the enhanced RPC function
      const { data, error } = await supabase.rpc('get_enhanced_leaderboard', {
        p_campus_id: profile?.campus_id || null,
        p_limit: 50,
      })

      if (error) {
        // Fallback to basic leaderboard if RPC doesn't exist yet
        const { data: basicData } = await supabase
          .from('profiles')
          .select('*, departments(short_name)')
          .eq('is_public', true)
          .order('karma_points', { ascending: false })
          .limit(50)
        setLeaders((basicData || []).map((p: any) => ({
          user_id: p.id,
          full_name: p.full_name,
          username: p.username,
          avatar_url: p.avatar_url,
          department: p.departments?.short_name,
          karma_points: p.karma_points || 0,
          streak_days: p.streak_days || 0,
          github_repos: 0,
          github_contributions: 0,
          leetcode_solved: 0,
          leetcode_rating: 0,
          combined_score: p.karma_points || 0,
        })))
      } else {
        setLeaders((data as any[]) || [])
      }
    } catch {
      // Fallback
      const { data: basicData } = await supabase
        .from('profiles')
        .select('*, departments(short_name)')
        .eq('is_public', true)
        .order('karma_points', { ascending: false })
        .limit(50)
      setLeaders((basicData || []).map((p: any) => ({
        user_id: p.id,
        full_name: p.full_name,
        username: p.username,
        avatar_url: p.avatar_url,
        department: p.departments?.short_name,
        karma_points: p.karma_points || 0,
        streak_days: p.streak_days || 0,
        github_repos: 0,
        github_contributions: 0,
        leetcode_solved: 0,
        leetcode_rating: 0,
        combined_score: p.karma_points || 0,
      })))
    }
    setLoading(false)
  }, [supabase, profile?.campus_id])

  useEffect(() => {
    loadLeaderboard(activeTab)
  }, [activeTab])

  // ── Sort by tab ──────────────────────────────────────────
  const sorted = [...leaders].sort((a, b) => {
    switch (activeTab) {
      case 'github': return (b.github_contributions || 0) - (a.github_contributions || 0)
      case 'leetcode': return (b.leetcode_solved || 0) - (a.leetcode_solved || 0)
      case 'karma': return (b.karma_points || 0) - (a.karma_points || 0)
      default: return (b.combined_score || 0) - (a.combined_score || 0)
    }
  })

  // ── Medal ────────────────────────────────────────────────
  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

  // ── Get display value for current tab ────────────────────
  const getDisplayValue = (leader: any) => {
    switch (activeTab) {
      case 'github': return { value: leader.github_contributions || 0, label: 'contributions', emoji: '💻' }
      case 'leetcode': return { value: leader.leetcode_solved || 0, label: 'solved', emoji: '✅' }
      case 'karma': return { value: leader.karma_points || 0, label: 'karma', emoji: '⭐' }
      default: return { value: Math.round(leader.combined_score || 0), label: 'score', emoji: '🏆' }
    }
  }

  // ── Stats summary ────────────────────────────────────────
  const totalGitHub = leaders.reduce((s, l) => s + (l.github_contributions || 0), 0)
  const totalLC = leaders.reduce((s, l) => s + (l.leetcode_solved || 0), 0)
  const withGitHub = leaders.filter(l => (l.github_contributions || 0) > 0).length
  const withLC = leaders.filter(l => (l.leetcode_solved || 0) > 0).length

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Leaderboard</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Top contributors — karma + GitHub + LeetCode combined
        </p>

        {/* Connect integrations CTA */}
        <button onClick={() => router.push('/integrations')}
          style={{ width: '100%', background: 'var(--accent-light)', border: 'none', borderRadius: 12, padding: '12px 16px', marginBottom: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ fontSize: 20 }}>🔗</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>Connect GitHub & LeetCode</p>
            <p style={{ fontSize: 11, color: 'var(--accent-text)', margin: '2px 0 0' }}>Boost your leaderboard rank with your coding stats</p>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 16 }}>→</span>
        </button>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#333', margin: '0 0 2px' }}>🐙 {withGitHub}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>GitHub connected · {totalGitHub.toLocaleString()} contributions</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#FFA116', margin: '0 0 2px' }}>🧩 {withLC}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>LeetCode connected · {totalLC.toLocaleString()} solved</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Leaderboard list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : sorted.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>🏆</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No leaders yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to connect your profiles!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((leader, i) => {
              const display = getDisplayValue(leader)
              const hasIntegrationData = leader.github_contributions > 0 || leader.leetcode_solved > 0
              return (
                <div key={leader.user_id}
                  onClick={() => leader.username && router.push(`/profile/${leader.username}`)}
                  style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>

                  <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>
                    {medal(i) || `${i + 1}`}
                  </span>

                  <Avatar name={leader.full_name} avatarUrl={leader.avatar_url} size={36} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {leader.full_name || 'Anonymous'}
                      </p>
                      {leader.github_contributions > 0 && <span title="GitHub connected" style={{ fontSize: 12 }}>🐙</span>}
                      {leader.leetcode_solved > 0 && <span title="LeetCode connected" style={{ fontSize: 12 }}>🧩</span>}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      @{leader.username} {leader.department && `· ${leader.department}`}
                    </p>
                    {/* Mini stats bar */}
                    {hasIntegrationData && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {leader.github_contributions > 0 && (
                          <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>
                            💻 {leader.github_contributions} contributions
                          </span>
                        )}
                        {leader.leetcode_solved > 0 && (
                          <span style={{ fontSize: 10, color: '#FFA116', fontWeight: 600 }}>
                            ✅ {leader.leetcode_solved} solved
                          </span>
                        )}
                        {leader.leetcode_rating > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--purple-text)', fontWeight: 600 }}>
                            🏆 {leader.leetcode_rating} rating
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', margin: '0 0 2px' }}>
                      {display.emoji} {display.value.toLocaleString()}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{display.label}</p>
                    {leader.streak_days > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--orange-text)', margin: '2px 0 0' }}>🔥 {leader.streak_days} streak</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
