'use client'

// ═══════════════════════════════════════════════════════════════════════════
// RankingsTab — Leaderboard with podium, filters, parallel metadata
// Extracted from compete/page.tsx for maintainability
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import type { LeaderEntry, SeasonInfo, RankScope } from './types'

const RANK_SORTS = ['aura', 'karma'] as const
const LEADERBOARD_LIMIT = 50

function seasonWeek(season: SeasonInfo | null): string | null {
  if (!season?.starts_at || !season?.ends_at) return null
  const start = new Date(season.starts_at).getTime()
  const end = new Date(season.ends_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const totalDays = Math.ceil((end - start) / 86400000)
  const elapsed = Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), totalDays)
  const totalWeeks = Math.ceil(totalDays / 7)
  return `Week ${Math.ceil(elapsed / 7)} of ${totalWeeks}`
}

export default function RankingsTab({
  user, profile, season, karma,
}: {
  user: any; profile: any; season: SeasonInfo | null;
  karma: { lifetime: number; aura: number; daily: number; season: string } | null;
}) {
  const supabase = createClient()
  const router = useRouter()
  const [leaders, setLeaders] = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'aura' | 'karma'>('aura')
  const [filterScope, setFilterScope] = useState<RankScope>('global')
  const [totalRanked, setTotalRanked] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)

  const loadRankings = useCallback(async () => {
    setLoading(true)
    try {
      const campusId = filterScope === 'campus' ? profile?.campus_id || null : null
      const { data, error } = await supabase.rpc('get_enhanced_leaderboard', {
        p_campus_id: campusId, p_limit: LEADERBOARD_LIMIT, p_sort: sortBy,
      })
      if (error || !data || (data as any[]).length === 0) {
        let query = supabase.from('profiles')
          .select('id, full_name, username, avatar_url, karma_points, aura_points, streak_days, departments(short_name)')
          .eq('is_public', true).eq('status', 'active')
        if (filterScope === 'campus' && profile?.campus_id) query = query.eq('campus_id', profile.campus_id)
        if (filterScope === 'friends' && user) {
          const { data: conns } = await supabase.from('connections')
            .select('requester_id, receiver_id')
            .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
            .eq('status', 'accepted')
          const friendIds = (conns || []).map((c: any) => c.requester_id === user.id ? c.receiver_id : c.requester_id)
          query = friendIds.length > 0 ? query.in('id', friendIds) : query.in('id', [user.id])
        }
        const col = sortBy === 'aura' ? 'aura_points' : 'karma_points'
        const { data: rows } = await query.order(col, { ascending: false }).limit(LEADERBOARD_LIMIT)
        setLeaders((rows || []).map((r: any) => ({
          user_id: r.id, full_name: r.full_name, username: r.username, avatar_url: r.avatar_url,
          karma_points: r.karma_points || 0, aura_points: r.aura_points || 0, streak_days: r.streak_days || 0,
          department: r.departments?.short_name, combined_score: 0,
          github_contributions: 0, leetcode_solved: 0, leetcode_rating: 0,
        })))
      } else {
        setLeaders(data as any[])
      }
    } catch { setLeaders([]) }
    setLoading(false)
  }, [sortBy, filterScope, profile?.campus_id, user, supabase])

  useEffect(() => { loadRankings() }, [loadRankings])

  // PROFESSIONAL PATTERN: Parallel metadata queries
  useEffect(() => {
    if (!user) return
    const loadMeta = async () => {
      try {
        const meCol = sortBy === 'aura' ? 'aura_points' : 'karma_points'
        // Fire count + my value + ahead count in parallel
        const [countRes, meRes, aheadRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_public', true).eq('status', 'active'),
          supabase.from('profiles').select(meCol).eq('id', user.id).single(),
          // We'll compute ahead after getting my value
          Promise.resolve(null),
        ])
        setTotalRanked(countRes.count || 0)
        const myVal = (meRes.data as any)?.[meCol] || 0
        const { count: ahead } = await supabase.from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_public', true).eq('status', 'active').gt(meCol, myVal)
        setMyRank((ahead || 0) + 1)
      } catch { /* best-effort */ }
    }
    loadMeta()
  }, [user, sortBy, supabase])

  const sorted = leaders
  const myPosition = useMemo(() => user ? sorted.findIndex(l => l.user_id === user.id) : -1, [sorted, user])
  const myEntry = myPosition >= 0 ? sorted[myPosition] : null
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div className="skeleton" style={{ width: 200, height: 20, borderRadius: 8, margin: '0 auto 12px' }} />
      <div className="skeleton" style={{ width: 160, height: 14, borderRadius: 6, margin: '0 auto' }} />
    </div>
  )

  if (sorted.length === 0) {
    const scopeMsg = filterScope === 'friends' ? 'Add connections to see where you stand.'
      : filterScope === 'campus' ? 'No ranked students from your campus yet — be the first!'
      : 'Be the first to win a Compete game and earn Aura!'
    return (
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '50px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <p style={{ fontSize: 40, margin: '0 0 10px' }}>🏆</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Rankings are getting ready</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{scopeMsg}</p>
      </div>
    )
  }

  const scopeLabel = filterScope === 'campus' ? 'Your campus' : filterScope === 'friends' ? 'Your connections' : 'All of ConnectToCampus'

  return (
    <div>
      {/* Season banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-light), var(--bg))', border: '1px solid var(--border)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex',
        alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 24 }}>🗓️</div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {season?.name || 'Season 1'} · {scopeLabel}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {seasonWeek(season) ? `${seasonWeek(season)} · ` : ''}
            {sortBy === 'aura' ? 'Aura = points from winning games' : 'Karma = lifetime earned points'}
          </p>
        </div>
        {myRank !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>#{myRank}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>your rank</p>
          </div>
        )}
      </div>

      {/* Your Position */}
      {user && (myEntry || myRank !== null) && (
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-light), var(--bg))', border: '2px solid var(--accent)',
          borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex',
          alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 800, color: 'var(--on-accent)', flexShrink: 0,
          }}>
            #{myEntry ? myPosition + 1 : (myRank ?? '—')}
          </div>
          <Avatar name={profile?.full_name || 'You'} avatarUrl={profile?.avatar_url} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{profile?.full_name || 'You'}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {sortBy === 'aura' ? 'Game rank · Aura from wins' : 'Lifetime rank · all-time Karma'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              @{profile?.username || 'you'}{myEntry?.department ? ` · ${myEntry.department}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>⚡ {myEntry ? myEntry.aura_points : (karma?.aura ?? 0)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Aura</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#eab308', margin: 0 }}>⭐ {myEntry ? myEntry.karma_points : (karma?.lifetime ?? 0)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Karma</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ranking metric">
          {RANK_SORTS.map(m => (
            <button key={m} onClick={() => setSortBy(m)} aria-pressed={sortBy === m} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              border: sortBy === m ? 'none' : '1px solid var(--border)',
              background: sortBy === m ? 'var(--accent)' : 'var(--bg)',
              color: sortBy === m ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}>
              {m === 'aura' ? '⚡ Aura' : '⭐ Karma'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Leaderboard scope">
          {(['global', 'campus', 'friends'] as const).map(s => {
            if (s === 'campus' && !profile?.campus_id) return null
            if (s === 'friends' && !user) return null
            return (
              <button key={s} onClick={() => setFilterScope(s)} aria-pressed={filterScope === s} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                border: filterScope === s ? 'none' : '1px solid var(--border)',
                background: filterScope === s ? 'var(--accent)' : 'var(--bg)',
                color: filterScope === s ? 'var(--on-accent)' : 'var(--text-secondary)',
              }}>
                {s === 'global' ? '🌐 Global' : s === 'campus' ? '🏫 Campus' : '🤝 Friends'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Top 3 Podium — proper stepped podium design */}
      {top3.length >= 3 && (
        <div style={{ marginBottom: 24, padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0 }}>
            {[1, 0, 2].map(pos => {
              const p = top3[pos]
              const isChampion = pos === 0
              const barH = isChampion ? 100 : pos === 1 ? 72 : 52
              const avatarSize = isChampion ? 60 : 48
              const medalSize = isChampion ? 36 : 28
              const grad = isChampion
                ? 'linear-gradient(180deg, #fde68a 0%, #f59e0b 60%, #d97706 100%)'
                : pos === 1
                  ? 'linear-gradient(180deg, #e5e7eb 0%, #9ca3af 60%, #6b7280 100%)'
                  : 'linear-gradient(180deg, #fed7aa 0%, #f97316 60%, #c2410c 100%)'
              const shadow = isChampion
                ? '0 0 20px rgba(245, 158, 11, 0.3), 0 -4px 12px rgba(245, 158, 11, 0.15)'
                : pos === 1
                  ? '0 0 12px rgba(156, 163, 175, 0.2)'
                  : '0 0 12px rgba(249, 115, 22, 0.2)'

              return (
                <div
                  key={p.user_id}
                  onClick={() => router.push(`/profile/${p.username}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && router.push(`/profile/${p.username}`)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    maxWidth: 140,
                  }}
                >
                  {/* Person info — sits ON TOP of the bar */}
                  <div style={{ textAlign: 'center', marginBottom: 8, padding: '0 4px' }}>
                    <Avatar name={p.full_name} avatarUrl={p.avatar_url} size={avatarSize} />
                    <p style={{
                      fontSize: medalSize, margin: '2px 0', lineHeight: 1,
                    }}>{medal(pos)}</p>
                    <p style={{
                      fontSize: isChampion ? 13 : 12,
                      fontWeight: isChampion ? 700 : 600,
                      color: 'var(--text-primary)',
                      margin: '0 0 1px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 110,
                    }}>
                      {p.full_name?.split(' ')[0] || 'Anon'}
                    </p>
                    <p style={{
                      fontSize: 10, color: isChampion ? 'var(--accent)' : 'var(--text-muted)',
                      margin: 0, fontWeight: isChampion ? 600 : 400,
                    }}>
                      @{p.username}
                    </p>
                    <p style={{
                      fontSize: isChampion ? 15 : 13, fontWeight: 800,
                      color: 'var(--accent-text)', margin: '3px 0 0',
                    }}>
                      {sortBy === 'aura' ? `⚡ ${p.aura_points}` : `⭐ ${p.karma_points}`}
                    </p>
                  </div>

                  {/* Podium bar — the stepped platform */}
                  <div style={{
                    width: '100%',
                    height: barH,
                    background: grad,
                    borderRadius: isChampion ? '12px 12px 4px 4px' : '8px 8px 4px 4px',
                    boxShadow: shadow,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Shine effect on the bar */}
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0,
                      height: '40%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                      borderRadius: 'inherit',
                    }} />
                    {/* Rank number on the bar */}
                    <div style={{
                      position: 'absolute',
                      bottom: 8,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: isChampion ? 22 : 18,
                      fontWeight: 900,
                      color: 'rgba(0,0,0,0.25)',
                      letterSpacing: '-0.02em',
                    }}>
                      {pos === 0 ? '#1' : pos === 1 ? '#2' : '#3'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leaderboard Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list" aria-label="Leaderboard">
        {rest.map((entry, idx) => {
          const rank = idx + 4
          const isMe = user && entry.user_id === user.id
          return (
            <div key={entry.user_id} role="listitem" onClick={() => router.push(`/profile/${entry.username}`)} style={{
              background: isMe ? 'var(--accent-light)' : 'var(--bg)',
              border: isMe ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 12, padding: '12px 14px', display: 'flex',
              alignItems: 'center', gap: 10, cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{rank}</span>
              </div>
              <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.full_name || 'Anonymous'}
                  {isMe && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 700 }}>(you)</span>}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  @{entry.username}{entry.department ? ` · ${entry.department}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>⚡ {entry.aura_points}</p>
                <p className="hide-mobile-soft" style={{ fontSize: 12, fontWeight: 600, color: '#eab308', margin: 0 }}>⭐ {entry.karma_points}</p>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && filterScope === 'global' && totalRanked > sorted.length && sorted.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 14 }}>
          Top {sorted.length} of {totalRanked} ranked students
        </p>
      )}

      {!user && (
        <div style={{ textAlign: 'center', marginTop: 20, padding: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Join the competition!</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>Sign up to earn Aura and climb the rankings.</p>
          <button onClick={() => router.push('/auth/login')} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)',
            color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Get Started →</button>
        </div>
      )}
    </div>
  )
}
