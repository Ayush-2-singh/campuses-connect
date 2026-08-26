'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'

// ── Types ────────────────────────────────────────────────────
interface Overview {
  users: { total: number; daily_new: number; weekly_new: number; monthly_new: number; suspended: number; banned: number }
  posts: { total: number; daily: number; weekly: number; monthly: number; active_posters: number; total_views: number; total_shares: number }
  engagement: { total_comments: number; weekly_comments: number; total_reactions: number }
  platform: { active_colleges: number; active_communities: number; total_notes: number; total_opportunities: number; total_events: number; open_mod_items: number }
}

type AnalyticsTab = 'overview' | 'growth' | 'heatmap' | 'top_posts' | 'top_colleges' | 'features'

const TABS: { key: AnalyticsTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'growth', label: 'Growth', icon: '📈' },
  { key: 'heatmap', label: 'Activity Heatmap', icon: '🔥' },
  { key: 'top_posts', label: 'Top Posts', icon: '📝' },
  { key: 'top_colleges', label: 'Top Colleges', icon: '🏫' },
  { key: 'features', label: 'Features', icon: '⚡' },
]

// ── Mini bar chart (pure CSS) ────────────────────────────────
function BarChart({ data, labels, colors, height = 140 }: { data: number[]; labels: string[]; colors?: string[]; height?: number }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 4px' }}>
      {data.map((val, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{val || ''}</span>
          <div style={{
            width: '100%', borderRadius: 4, minHeight: 2,
            height: `${(val / max) * (height - 30)}px`,
            background: colors?.[i] || 'var(--accent)',
            transition: 'height 0.3s ease',
          }} />
          <span style={{ fontSize: 8, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 40 }}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────
function StatCard({ emoji, label, value, sub, color }: { emoji: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <p style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--accent)', margin: 0 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

// ── Heatmap component ────────────────────────────────────────
function HeatmapGrid({ data }: { data: any[] }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const maxCount = Math.max(...data.map(d => d.count), 1)

  const getColor = (count: number) => {
    if (count === 0) return 'var(--bg-secondary)'
    const ratio = count / maxCount
    if (ratio > 0.75) return 'var(--accent)'
    if (ratio > 0.5) return 'var(--success-text)'
    if (ratio > 0.25) return 'var(--yellow-text)'
    return 'var(--orange-text)'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: 2, minWidth: 600 }}>
        {/* Hour labels */}
        <div />
        {hours.map(h => (
          <div key={h} style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', padding: '2px 0' }}>
            {h % 3 === 0 ? `${h}h` : ''}
          </div>
        ))}
        {/* Grid rows */}
        {days.map((day, di) => (
          <>
            <div key={`label-${di}`} style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              {day}
            </div>
            {hours.map(h => {
              const cell = data.find(d => d.day === di && d.hour === h)
              const count = cell?.count || 0
              return (
                <div key={`${di}-${h}`}
                  title={`${day} ${h}:00 — ${count} activities`}
                  style={{
                    aspectRatio: '1', borderRadius: 3, minHeight: 14,
                    background: getColor(count),
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              )
            })}
          </>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Less</span>
        {['var(--bg-secondary)', 'var(--orange-text)', 'var(--yellow-text)', 'var(--success-text)', 'var(--accent)'].map((c, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [grants, setGrants] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Data states
  const [overview, setOverview] = useState<Overview | null>(null)
  const [growth, setGrowth] = useState<any>(null)
  const [heatmap, setHeatmap] = useState<any[]>([])
  const [topPosts, setTopPosts] = useState<any[]>([])
  const [topColleges, setTopColleges] = useState<any[]>([])
  const [featureStats, setFeatureStats] = useState<any>(null)
  const [sectionLoading, setSectionLoading] = useState(false)

  // ── Auth check ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=/admin/analytics'); return }
      setProfile(user)
      const { data: grantData } = await supabase.rpc('my_admin_grants')
      const g = (grantData as any[]) || []
      setGrants(g)
      if (!g.some((x: any) => x.admin_type === 'platform_admin')) { router.push('/feed'); return }
      setLoading(false)
    }
    load()
  }, [])

  // ── Fetch analytics data ──────────────────────────────────
  const fetchData = useCallback(async (section: AnalyticsTab) => {
    setSectionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/analytics?section=${section}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch')
      }
      const data = await res.json()

      switch (section) {
        case 'overview': setOverview(data as Overview); break
        case 'growth': setGrowth(data); break
        case 'heatmap': setHeatmap(data.heatmap || []); break
        case 'top_posts': setTopPosts(data.posts || []); break
        case 'top_colleges': setTopColleges(data.colleges || []); break
        case 'features': setFeatureStats(data); break
      }
    } catch (err: any) {
      setError(err.message)
    }
    setSectionLoading(false)
  }, [])

  useEffect(() => {
    if (!loading) fetchData(activeTab)
  }, [activeTab, loading])

  // ── Growth chart data ─────────────────────────────────────
  const growthChartData = useMemo(() => {
    if (!growth?.labels) return null
    return {
      labels: growth.labels.map((d: string) => {
        const date = new Date(d)
        return `${date.getMonth() + 1}/${date.getDate()}`
      }),
      users: growth.users || [],
      posts: growth.posts || [],
    }
  }, [growth])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading analytics…</p>
    </div>
  )

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/admin')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '4px 8px' }}>
              ← Admin
            </button>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                📊 Analytics Dashboard
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Real-time platform metrics</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle mode="inline" />
            <button onClick={() => fetchData(activeTab)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '10px 18px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {sectionLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading data…</p>
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════
                OVERVIEW
            ═══════════════════════════════════════════════ */}
            {activeTab === 'overview' && overview && (
              <div>
                {/* Users */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>👥 Users</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <StatCard emoji="👥" label="Total Users" value={overview.users.total} color="var(--accent)" />
                  <StatCard emoji="🆕" label="Today" value={overview.users.daily_new} sub="new signups" color="var(--success-text)" />
                  <StatCard emoji="📅" label="This Week" value={overview.users.weekly_new} sub="new users" color="var(--accent)" />
                  <StatCard emoji="📆" label="This Month" value={overview.users.monthly_new} sub="new users" color="var(--purple-text)" />
                  <StatCard emoji="🚫" label="Suspended" value={overview.users.suspended} color="var(--danger)" />
                  <StatCard emoji="⛔" label="Banned" value={overview.users.banned} color="var(--danger)" />
                </div>

                {/* Posts & Engagement */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>📝 Content & Engagement</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <StatCard emoji="📝" label="Total Posts" value={overview.posts.total} />
                  <StatCard emoji="🆕" label="Posts Today" value={overview.posts.daily} />
                  <StatCard emoji="👁️" label="Total Views" value={overview.posts.total_views} color="var(--orange-text)" />
                  <StatCard emoji="🔄" label="Total Shares" value={overview.posts.total_shares} color="var(--purple-text)" />
                  <StatCard emoji="💬" label="Total Comments" value={overview.engagement.total_comments} color="var(--success-text)" />
                  <StatCard emoji="❤️" label="Total Reactions" value={overview.engagement.total_reactions} color="var(--danger)" />
                </div>

                {/* Platform */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🏫 Platform</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <StatCard emoji="🏫" label="Colleges" value={overview.platform.active_colleges} />
                  <StatCard emoji="🌐" label="Communities" value={overview.platform.active_communities} />
                  <StatCard emoji="📚" label="Notes" value={overview.platform.total_notes} />
                  <StatCard emoji="💼" label="Opportunities" value={overview.platform.total_opportunities} />
                  <StatCard emoji="🎪" label="Events" value={overview.platform.total_events} />
                  <StatCard emoji="🛡️" label="Mod Queue" value={overview.platform.open_mod_items} color={overview.platform.open_mod_items > 0 ? 'var(--danger)' : 'var(--success-text)'} />
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                GROWTH
            ═══════════════════════════════════════════════ */}
            {activeTab === 'growth' && growthChartData && (
              <div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>📈 User Growth (Last 30 Days)</h3>
                  <BarChart data={growthChartData.users} labels={growthChartData.labels} colors={growthChartData.users.map((v: number) => v > 0 ? 'var(--accent)' : 'var(--bg-secondary)')} />
                </div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>📝 Post Growth (Last 30 Days)</h3>
                  <BarChart data={growthChartData.posts} labels={growthChartData.labels} colors={growthChartData.posts.map((v: number) => v > 0 ? 'var(--success-text)' : 'var(--bg-secondary)')} />
                </div>
                {/* Growth summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>{growthChartData.users.reduce((a: number, b: number) => a + b, 0)}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>30-day new users</p>
                  </div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--success-text)', margin: 0 }}>{growthChartData.posts.reduce((a: number, b: number) => a + b, 0)}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>30-day new posts</p>
                  </div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange-text)', margin: 0 }}>
                      {growthChartData.users.length > 0 ? Math.round(growthChartData.users.reduce((a: number, b: number) => a + b, 0) / 30) : 0}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Avg daily signups</p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                HEATMAP
            ═══════════════════════════════════════════════ */}
            {activeTab === 'heatmap' && (
              <div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🔥 Activity Heatmap</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    Posts + Comments activity by day and hour (last 30 days). Hover for details.
                  </p>
                  {heatmap.length > 0 ? (
                    <HeatmapGrid data={heatmap} />
                  ) : (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No activity data yet</p>
                  )}
                </div>
                {/* Peak hours */}
                {heatmap.length > 0 && (() => {
                  const hourly = Array.from({ length: 24 }, (_, h) => ({
                    hour: h,
                    total: heatmap.filter(d => d.hour === h).reduce((s, d) => s + d.count, 0),
                  }))
                  const peakHours = hourly.sort((a, b) => b.total - a.total).slice(0, 3)
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                      {peakHours.map((p, i) => (
                        <div key={p.hour} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                          <p style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)', margin: 0 }}>
                            {p.hour}:00
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            {i === 0 ? '🏆 Peak hour' : `#${i + 1} busiest`}
                          </p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                            {p.total} activities
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                TOP POSTS
            ═══════════════════════════════════════════════ */}
            {activeTab === 'top_posts' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>📝 Top Performing Posts</h3>
                {topPosts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No posts yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topPosts.map((post: any, i: number) => (
                      <div key={post.id} style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0, color: 'var(--text-muted)' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.5 }}>
                              {post.body}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                              by @{post.author?.username || '—'} · {post.post_type} · {new Date(post.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👁️ {post.view_count || 0}</span>
                            <span style={{ fontSize: 12, color: 'var(--danger)' }}>❤️ {post.reactions || 0}</span>
                            <span style={{ fontSize: 12, color: 'var(--accent)' }}>💬 {post.comments || 0}</span>
                            <span style={{ fontSize: 12, color: 'var(--success-text)' }}>🔄 {post.share_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                TOP COLLEGES
            ═══════════════════════════════════════════════ */}
            {activeTab === 'top_colleges' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>🏫 Top Colleges by Activity</h3>
                {topColleges.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No college data yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topColleges.map((c: any, i: number) => {
                      const maxUsers = Math.max(...topColleges.map((x: any) => x.user_count || 0), 1)
                      return (
                        <div key={c.college_id} style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.name}</p>
                              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👥 {c.user_count || 0} users</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📝 {c.post_count || 0} posts</span>
                              </div>
                              {/* Progress bar */}
                              <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-secondary)', marginTop: 8 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: i < 3 ? 'var(--accent)' : 'var(--text-muted)', width: `${((c.user_count || 0) / maxUsers) * 100}%`, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                FEATURES
            ═══════════════════════════════════════════════ */}
            {activeTab === 'features' && featureStats && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>⚡ Feature Flags Overview</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  <StatCard emoji="⚡" label="Total Features" value={featureStats.total_flags} />
                  <StatCard emoji="✅" label="Enabled" value={featureStats.enabled_flags} color="var(--success-text)" />
                  <StatCard emoji="🚫" label="Disabled" value={featureStats.disabled_flags} color="var(--danger)" />
                </div>

                {featureStats.categories && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>By Category</h4>
                    {featureStats.categories.map((cat: any) => (
                      <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', width: 100 }}>
                          {cat.category}
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                          <div style={{ flex: cat.enabled, height: 20, borderRadius: 4, background: 'var(--success-text)', minWidth: cat.enabled > 0 ? 20 : 0 }} />
                          <div style={{ flex: cat.disabled, height: 20, borderRadius: 4, background: 'var(--danger)', minWidth: cat.disabled > 0 ? 20 : 0 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, textAlign: 'right' }}>
                          {cat.enabled} on / {cat.disabled} off
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
