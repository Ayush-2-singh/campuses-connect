'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'

type Tab = 'overall' | 'github' | 'leetcode' | 'karma'

const TABS: { key: Tab; label: string; icon: string; color: string }[] = [
  { key: 'overall', label: 'Overall', icon: '🏆', color: 'var(--accent)' },
  { key: 'github', label: 'GitHub', icon: '🐙', color: '#333' },
  { key: 'leetcode', label: 'LeetCode', icon: '🧩', color: '#FFA116' },
  { key: 'karma', label: 'Karma', icon: '⭐', color: '#eab308' },
]

// ── Scoring formula display ──────────────────────────────
const FORMULA = [
  { label: 'Karma', multiplier: '×1', emoji: '⭐', color: '#eab308' },
  { label: 'Contributions', multiplier: '×0.5', emoji: '💻', color: '#333' },
  { label: 'LC Solved', multiplier: '×0.3', emoji: '✅', color: '#00b8a3' },
  { label: 'Rating', multiplier: '×0.2', emoji: '🏆', color: '#FFA116' },
  { label: 'Streak', multiplier: '×2', emoji: '🔥', color: '#f97316' },
]

export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overall')
  const [showFormula, setShowFormula] = useState(false)
  const [showUserDetail, setShowUserDetail] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // ── Load enhanced leaderboard ────────────────────────────
  const loadLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(prof)
      }

      const { data, error } = await supabase.rpc('get_enhanced_leaderboard', {
        p_campus_id: profile?.campus_id || null,
        p_limit: 20,
      })

      if (error) {
        const { data: basicData } = await supabase
          .from('profiles')
          .select('*, departments(short_name)')
          .eq('is_public', true)
          .order('karma_points', { ascending: false })
          .limit(50)
        setLeaders((basicData || []).map((p: any) => ({
          user_id: p.id, full_name: p.full_name, username: p.username,
          avatar_url: p.avatar_url, department: p.departments?.short_name,
          karma_points: p.karma_points || 0, streak_days: p.streak_days || 0,
          github_repos: 0, github_contributions: 0, leetcode_solved: 0,
          leetcode_rating: 0, combined_score: p.karma_points || 0,
        })))
      } else {
        setLeaders((data as any[]) || [])
      }
    } catch {
      const { data: basicData } = await supabase
        .from('profiles')
        .select('*, departments(short_name)')
        .eq('is_public', true)
        .order('karma_points', { ascending: false })
        .limit(50)
      setLeaders((basicData || []).map((p: any) => ({
        user_id: p.id, full_name: p.full_name, username: p.username,
        avatar_url: p.avatar_url, department: p.departments?.short_name,
        karma_points: p.karma_points || 0, streak_days: p.streak_days || 0,
        github_repos: 0, github_contributions: 0, leetcode_solved: 0,
        leetcode_rating: 0, combined_score: p.karma_points || 0,
      })))
    }
    setLoading(false)
  }, [supabase, profile?.campus_id])

  useEffect(() => { loadLeaderboard() }, [activeTab])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const { data } = await supabase.rpc('get_enhanced_leaderboard', {
        p_campus_id: profile?.campus_id || null,
        p_limit: leaders.length + 20,
      })
      if (data && (data as any[]).length > leaders.length) {
        setLeaders(data as any[])
      } else {
        setHasMore(false)
      }
    } catch { setHasMore(false) }
    setLoadingMore(false)
  }

  // ── Sort by tab ──────────────────────────────────────────
  const sorted = [...leaders].sort((a, b) => {
    switch (activeTab) {
      case 'github': return (b.github_contributions || 0) - (a.github_contributions || 0)
      case 'leetcode': return (b.leetcode_solved || 0) - (a.leetcode_solved || 0)
      case 'karma': return (b.karma_points || 0) - (a.karma_points || 0)
      default: return (b.combined_score || 0) - (a.combined_score || 0)
    }
  })

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
  const medalBg = (i: number) => i === 0 ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : i === 1 ? 'linear-gradient(135deg, #f3f4f6, #d1d5db)' : i === 2 ? 'linear-gradient(135deg, #fed7aa, #fdba74)' : 'none'

  // ── Compute combined score breakdown ────────────────────
  const computeBreakdown = (l: any) => {
    const karma = (l.karma_points || 0) * 1
    const contrib = (l.github_contributions || 0) * 0.5
    const solved = (l.leetcode_solved || 0) * 0.3
    const rating = (l.leetcode_rating || 0) * 0.2
    const streak = (l.streak_days || 0) * 2
    return { karma, contrib, solved, rating, streak, total: Math.round(karma + contrib + solved + rating + streak) }
  }

  const topScore = sorted.length > 0 ? Math.max(...sorted.slice(0, 10).map(l => computeBreakdown(l).total), 1) : 1

  // ── Get max values for bar scaling ─────────────────────
  const maxVals = {
    github: Math.max(...sorted.slice(0, 10).map(l => l.github_contributions || 0), 1),
    leetcode: Math.max(...sorted.slice(0, 10).map(l => l.leetcode_solved || 0), 1),
    karma: Math.max(...sorted.slice(0, 10).map(l => l.karma_points || 0), 1),
    overall: topScore,
  }

  // ── Stats ─────────────────────────────────────────────
  const totalGitHub = leaders.reduce((s, l) => s + (l.github_contributions || 0), 0)
  const totalLC = leaders.reduce((s, l) => s + (l.leetcode_solved || 0), 0)
  const withGitHub = leaders.filter(l => (l.github_contributions || 0) > 0).length
  const withLC = leaders.filter(l => (l.leetcode_solved || 0) > 0).length

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Header ──────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>🏆</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Leaderboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Karma + GitHub + LeetCode — combined ranking
          </p>
        </div>

        {/* ── Connect CTA ─────────────────────────────── */}
        <button onClick={() => router.push('/integrations')}
          style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent), var(--accent-hover, #2563eb))', border: 'none', borderRadius: 14, padding: '14px 18px', marginBottom: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }}>
          <span style={{ fontSize: 24 }}>🔗</span>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>Boost Your Rank</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Connect GitHub & LeetCode to climb the leaderboard</p>
          </div>
          <span style={{ color: '#fff', fontSize: 18 }}>→</span>
        </button>

        {/* ── Stats Cards ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#333', margin: '0 0 2px' }}>🐙 {withGitHub}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>GitHub · {totalGitHub.toLocaleString()} commits</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#FFA116', margin: '0 0 2px' }}>🧩 {withLC}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>LeetCode · {totalLC.toLocaleString()} solved</p>
          </div>
        </div>

        {/* ── Formula Toggle ──────────────────────────── */}
        <button onClick={() => setShowFormula(!showFormula)}
          style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}>
          <span style={{ fontSize: 16 }}>📐</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>
            Scoring Formula
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transform: showFormula ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showFormula && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>How Score is Calculated</p>
            {/* Formula visual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
              {FORMULA.map((f, i) => (
                <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: f.color, fontWeight: 700 }}>{f.emoji} {f.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'var(--accent-light)' }}>{f.multiplier}</span>
                  {i < FORMULA.length - 1 && <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px' }}>+</span>}
                </span>
              ))}
            </div>
            {/* Example */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 4px' }}><strong>Example:</strong> 500 karma + 200 contributions + 100 solved + 1500 rating + 7 streak</p>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent)' }}>
                = 500×1 + 200×0.5 + 100×0.3 + 1500×0.2 + 7×2 = <strong>951 points</strong>
              </p>
            </div>
            {/* Bar breakdown */}
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Weight Breakdown:</p>
              {FORMULA.map(f => {
                const weight = f.multiplier === '×2' ? 35 : f.multiplier === '×1' ? 25 : f.multiplier === '×0.5' ? 15 : f.multiplier === '×0.3' ? 12 : 13
                return (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 80, textAlign: 'right' }}>{f.emoji} {f.label}</span>
                    <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 5, background: f.color, width: `${weight}%`, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 30 }}>{f.multiplier}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', borderRadius: 20,
                border: activeTab === tab.key ? 'none' : '1px solid var(--border)',
                background: activeTab === tab.key ? tab.color : 'var(--bg)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── Top 3 Podium ────────────────────────────── */}
        {sorted.length >= 3 && activeTab === 'overall' && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, marginBottom: 20, padding: '0 10px' }}>
            {/* 2nd place */}
            <div onClick={() => router.push(`/profile/${sorted[1].username}`)}
              style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              <Avatar name={sorted[1].full_name} avatarUrl={sorted[1].avatar_url} size={44} />
              <p style={{ fontSize: 24, margin: '4px 0 2px' }}>🥈</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sorted[1].full_name?.split(' ')[0] || 'Anon'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                {Math.round(computeBreakdown(sorted[1]).total)}
              </p>
              <div style={{ height: 60, background: 'linear-gradient(180deg, #d1d5db, #9ca3af)', borderRadius: '8px 8px 0 0', marginTop: 4 }} />
            </div>
            {/* 1st place */}
            <div onClick={() => router.push(`/profile/${sorted[0].username}`)}
              style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              <Avatar name={sorted[0].full_name} avatarUrl={sorted[0].avatar_url} size={52} />
              <p style={{ fontSize: 32, margin: '4px 0 2px' }}>🥇</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sorted[0].full_name?.split(' ')[0] || 'Anon'}
              </p>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
                {Math.round(computeBreakdown(sorted[0]).total)}
              </p>
              <div style={{ height: 80, background: 'linear-gradient(180deg, #fde68a, #f59e0b)', borderRadius: '8px 8px 0 0', marginTop: 4 }} />
            </div>
            {/* 3rd place */}
            <div onClick={() => router.push(`/profile/${sorted[2].username}`)}
              style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              <Avatar name={sorted[2].full_name} avatarUrl={sorted[2].avatar_url} size={40} />
              <p style={{ fontSize: 22, margin: '4px 0 2px' }}>🥉</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sorted[2].full_name?.split(' ')[0] || 'Anon'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                {Math.round(computeBreakdown(sorted[2]).total)}
              </p>
              <div style={{ height: 45, background: 'linear-gradient(180deg, #fed7aa, #ea580c)', borderRadius: '8px 8px 0 0', marginTop: 4 }} />
            </div>
          </div>
        )}

        {/* ── Leaderboard List ────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8, animation: 'pulse 1s infinite' }}>⏳</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading rankings...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 36, margin: '0 0 8px' }}>🏆</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No rankings yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Connect your profiles to get ranked!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((leader, i) => {
              const breakdown = computeBreakdown(leader)
              const maxForTab = activeTab === 'github' ? maxVals.github : activeTab === 'leetcode' ? maxVals.leetcode : activeTab === 'karma' ? maxVals.karma : maxVals.overall
              const valForTab = activeTab === 'github' ? (leader.github_contributions || 0) : activeTab === 'leetcode' ? (leader.leetcode_solved || 0) : activeTab === 'karma' ? (leader.karma_points || 0) : breakdown.total
              const barWidth = Math.max((valForTab / maxForTab) * 100, 2)
              const isExpanded = showUserDetail === leader.user_id
              const barColor = activeTab === 'github' ? '#333' : activeTab === 'leetcode' ? '#FFA116' : activeTab === 'karma' ? '#eab308' : 'var(--accent)'

              return (
                <div key={leader.user_id}
                  onClick={() => setShowUserDetail(isExpanded ? null : leader.user_id)}
                  style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    borderRadius: 14, padding: 0, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>

                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                    {/* Rank */}
                    <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                      {medal(i) ? (
                        <span style={{ fontSize: 22 }}>{medal(i)}</span>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>{i + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar name={leader.full_name} avatarUrl={leader.avatar_url} size={40} />
                      {leader.github_contributions > 0 && (
                        <span style={{ position: 'absolute', bottom: -2, right: -4, fontSize: 12, background: 'var(--bg)', borderRadius: 10, padding: '0 2px' }}>🐙</span>
                      )}
                      {leader.leetcode_solved > 0 && (
                        <span style={{ position: 'absolute', top: -2, right: -4, fontSize: 12, background: 'var(--bg)', borderRadius: 10, padding: '0 2px' }}>🧩</span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {leader.full_name || 'Anonymous'}
                        </p>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                        @{leader.username} {leader.department && `· ${leader.department}`}
                      </p>
                      {/* Progress bar */}
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${barWidth}%`, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: barColor, margin: 0 }}>
                        {valForTab.toLocaleString()}
                      </p>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: 0 }}>
                        {activeTab === 'overall' ? 'score' : activeTab === 'github' ? 'contributions' : activeTab === 'leetcode' ? 'solved' : 'karma'}
                      </p>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                      {/* Score breakdown */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>
                        {[
                          { label: 'Karma', value: leader.karma_points || 0, emoji: '⭐', color: '#eab308', calc: breakdown.karma },
                          { label: 'Contrib', value: leader.github_contributions || 0, emoji: '💻', color: '#333', calc: breakdown.contrib },
                          { label: 'Solved', value: leader.leetcode_solved || 0, emoji: '✅', color: '#00b8a3', calc: breakdown.solved },
                          { label: 'Rating', value: leader.leetcode_rating || 0, emoji: '🏆', color: '#FFA116', calc: breakdown.rating },
                          { label: 'Streak', value: leader.streak_days || 0, emoji: '🔥', color: '#f97316', calc: breakdown.streak },
                        ].map(item => (
                          <div key={item.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                            <p style={{ fontSize: 14, margin: '0 0 2px' }}>{item.emoji}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: item.color, margin: '0 0 1px' }}>{item.value.toLocaleString()}</p>
                            <p style={{ fontSize: 8, color: 'var(--text-muted)', margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: 9, fontWeight: 600, color: 'var(--accent)', margin: '2px 0 0' }}>→ {Math.round(item.calc)}</p>
                          </div>
                        ))}
                      </div>
                      {/* Total */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>🏆 Combined Score</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{breakdown.total}</span>
                      </div>
                      {/* View profile */}
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/profile/${leader.username}`) }}
                        style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        👤 View Full Profile →
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Load More */}
        {!loading && hasMore && leaders.length >= 20 && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={loadMore} disabled={loadingMore}
              style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loadingMore ? '⏳ Loading...' : `📋 Load More (${leaders.length} shown)`}
            </button>
          </div>
        )}

        {/* ── Bottom CTA ──────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 20, padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Want to rank higher?</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>Connect your coding profiles and stay active!</p>
          <button onClick={() => router.push('/integrations')}
            style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            🔗 Connect Profiles
          </button>
        </div>
      </div>
    </Layout>
  )
}
