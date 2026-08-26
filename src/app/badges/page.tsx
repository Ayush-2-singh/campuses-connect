'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', diamond: '👑' }
const TIER_COLOR: Record<string, string> = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2', diamond: '#B9F2FF' }

export default function BadgesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [badges, setBadges] = useState<any[]>([])
  const [userBadges, setUserBadges] = useState<any[]>([])
  const [streakDays, setStreakDays] = useState(0)
  const [karmaPoints, setKarmaPoints] = useState(0)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'badges' | 'streak' | 'calendar'>('badges')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/auth/login?redirect=/badges'); return }
      setUser(authUser)
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(data)

      const res = await fetch('/api/badges')
      if (res.ok) {
        const d = await res.json()
        setBadges(d.badges || [])
        setUserBadges(d.user_badges || [])
        setStreakDays(d.streak_days || 0)
        setKarmaPoints(d.karma_points || 0)
        setRecentActivity(d.recent_activity || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const earnedCount = badges.filter((b: any) => b.earned).length
  const totalCount = badges.length

  // Build 30-day activity calendar
  const calendarDays = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86400000)
    const dateStr = date.toISOString().split('T')[0]
    const activity = recentActivity.find((a: any) => a.activity_date === dateStr)
    const total = activity ? (activity.posts_created + activity.comments_made + activity.reactions_given) : 0
    return { date, dateStr, total, day: date.getDate(), month: date.toLocaleString('default', { month: 'short' }) }
  })

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🏆 Badges & Streaks</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Earn badges, maintain streaks, unlock features
        </p>

        {/* Stats overview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', margin: '0 0 2px' }}>🔥 {streakDays}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Day Streak</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--yellow-text)', margin: '0 0 2px' }}>⭐ {karmaPoints}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Karma</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--success-text)', margin: '0 0 2px' }}>🏅 {earnedCount}/{totalCount}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Badges</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {(['badges', 'streak', 'calendar'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '10px 18px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, fontFamily: 'inherit' }}>
              {tab === 'badges' ? '🏅 Badges' : tab === 'streak' ? '🔥 Streak' : '📅 Calendar'}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : (
          <>
            {/* Badges tab */}
            {activeTab === 'badges' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {badges.map((badge: any) => (
                  <div key={badge.key}
                    style={{ background: 'var(--bg)', border: badge.earned ? `2px solid ${TIER_COLOR[badge.tier]}` : '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)', opacity: badge.earned ? 1 : 0.6 }}>
                    <span style={{ fontSize: 36 }}>{badge.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{badge.name}</p>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${TIER_COLOR[badge.tier]}33`, color: TIER_COLOR[badge.tier], fontWeight: 700 }}>
                          {TIER_EMOJI[badge.tier]} {badge.tier}
                        </span>
                        {badge.earned && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600 }}>✅ Earned</span>}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{badge.description}</p>
                      {badge.unlock_key && (
                        <p style={{ fontSize: 11, color: 'var(--accent)', margin: '4px 0 0' }}>🔓 Unlocks: {badge.unlock_key}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Streak tab */}
            {activeTab === 'streak' && (
              <div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 48, margin: '0 0 8px' }}>🔥</p>
                  <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', margin: '0 0 4px' }}>{streakDays} Days</p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Current Activity Streak</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    Log in, post, comment, or react daily to maintain your streak!
                  </p>
                </div>

                {/* Next milestone */}
                {(() => {
                  const milestones = [3, 7, 14, 30, 100]
                  const nextMilestone = milestones.find(m => m > streakDays) || 100
                  const progress = Math.min((streakDays / nextMilestone) * 100, 100)
                  return (
                    <div style={{ background: 'var(--accent-light)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: '0 0 8px' }}>
                        Next milestone: {nextMilestone} days ({nextMilestone - streakDays} to go)
                      </p>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: 'var(--accent)', width: `${progress}%`, transition: 'width 0.3s' }} />
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--accent-text)', margin: '6px 0 0' }}>{Math.round(progress)}% complete</p>
                    </div>
                  )
                })()}

                {/* How to maintain */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>💡 How to maintain your streak</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { emoji: '📝', text: 'Create a post' },
                      { emoji: '💬', text: 'Write a comment' },
                      { emoji: '❤️', text: 'React to a post' },
                      { emoji: '📚', text: 'Upload notes' },
                      { emoji: '🏢', text: 'Apply to a job' },
                    ].map(item => (
                      <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span>{item.emoji}</span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Calendar tab */}
            {activeTab === 'calendar' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>📅 Last 30 Days Activity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0', fontWeight: 600 }}>{d}</div>
                  ))}
                  {/* Empty cells for alignment */}
                  {Array.from({ length: calendarDays[0]?.date.getDay() || 0 }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {calendarDays.map((day, i) => {
                    const intensity = day.total === 0 ? 0 : day.total <= 2 ? 1 : day.total <= 5 ? 2 : 3
                    const colors = ['var(--bg-secondary)', 'var(--success-light)', 'var(--success-text)', 'var(--accent)']
                    const isToday = day.dateStr === new Date().toISOString().split('T')[0]
                    return (
                      <div key={i}
                        title={`${day.dateStr}: ${day.total} activities`}
                        style={{ aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: colors[intensity], border: isToday ? '2px solid var(--accent)' : 'none',
                          fontSize: 10, color: intensity >= 2 ? '#fff' : 'var(--text-muted)', fontWeight: isToday ? 700 : 400,
                          cursor: 'pointer', transition: 'transform 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                        {day.day}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Less</span>
                  {['var(--bg-secondary)', 'var(--success-light)', 'var(--success-text)', 'var(--accent)'].map((c, i) => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c }} />
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>More</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
