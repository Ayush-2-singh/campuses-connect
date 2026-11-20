'use client'

// ═══════════════════════════════════════════════════════════════════════════
// RankingsTab — the Compete leaderboard, computed from matches only.
//
// Every point on this board comes from a finished match (live battle room,
// typing battle, quick-maths battle) through `match_leaderboard`:
//
//   match_points = round(100 × mode × (0.6 × accuracy + 0.4 × 1/place))
//
// Live rooms score every participant on their real accuracy and placement;
// typing / quick-maths record the winner, so a win is 100 / 90. Profile
// counters (karma, aura), GitHub and LeetCode stats are not read here at all.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import type { LeaderEntry, SeasonInfo, RankScope } from './types'

// ── Inline SVG glyphs (no emoji anywhere in this tab) ──────────────────────
const BoltGlyph = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ verticalAlign: '-1px' }}
  >
    <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
  </svg>
)

const GlobeGlyph = ({ size = 11 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ verticalAlign: '-1px' }}
  >
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
)

const CampusGlyph = ({ size = 11 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ verticalAlign: '-1px' }}
  >
    <path d="M4 21V6a1 1 0 0 1 1-1h8v16M13 10h6a1 1 0 0 1 1 1v10M8 9h.01M8 13h.01M8 17h.01M16 14h.01M16 18h.01M2 21h20" />
  </svg>
)

const UsersGlyph = ({ size = 11 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ verticalAlign: '-1px' }}
  >
    <path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c0-3 3-4.5 6-4.5s6 1.5 6 4.5M16 4.6a3.5 3.5 0 0 1 0 6.8M17 15.6c2.4.4 5 1.7 5 4.4" />
  </svg>
)

// Podium metals follow the section accent instead of fixed gold/silver/bronze:
// first is the accent itself, second a neutral, third a blend of the two. That
// keeps the podium correct in both themes and on any section accent.
const MEDAL_COLORS = [
  'var(--accent)',
  'color-mix(in srgb, var(--text-secondary) 55%, white)',
  'color-mix(in srgb, var(--accent) 42%, white)',
]

/** Podium medal — SVG circle + ribbon with rank number (replaces 🥇🥈🥉 emoji). */
function RankGlyph({ pos, size = 22 }: { pos: number; size?: number }) {
  const c = MEDAL_COLORS[pos] || 'var(--text-muted)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: '-4px' }}>
      <path d="M8 1h8l-2.5 7.5h-3L8 1Z" fill={c} opacity={0.75} />
      <circle cx="12" cy="15" r="7.5" fill={c} />
      <text x="12" y="18.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="var(--on-accent)">
        {pos + 1}
      </text>
    </svg>
  )
}

type Zone = 'overall' | 'live' | 'typing' | 'maths'
type MeRow = { rank: number; points: number; wins: number; played: number; accuracy: number }

/** A compact per-mode dashboard: my standing plus who is leading that mode. */
type Dash = { top: LeaderEntry[]; me: MeRow | null }

const ZONES: { key: Zone; label: string; hint: string }[] = [
  { key: 'overall', label: 'Combined', hint: 'Live battle quiz + typing + maths' },
  { key: 'live', label: 'Live battle quiz', hint: 'Points from finished live rooms' },
  { key: 'typing', label: 'Typing battle', hint: '100 per typing battle won' },
  { key: 'maths', label: 'Quick maths', hint: '90 per maths battle or daily set won' },
]

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

export default function RankingsTab({ user, profile, season }: { user: any; profile: any; season: SeasonInfo | null }) {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState<LeaderEntry[]>([])
  const [me, setMe] = useState<MeRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [zone, setZone] = useState<Zone>('overall')
  const [scope, setScope] = useState<RankScope>('global')
  const [dash, setDash] = useState<Partial<Record<Zone, Dash>>>({})

  // The dashboard tiles depend on scope + campus + season, not on which zone is
  // open, so they are cached and reused when only the zone changes. Before
  // this, every tap on a mode tile refetched all four boards (6 RPCs).
  const dashCache = useRef<{ key: string; data: Partial<Record<Zone, Dash>> } | null>(null)
  // Latest request wins: a slow board for a zone the reader already left must
  // not overwrite the one on screen.
  const requestId = useRef(0)
  const scopeKey = `${scope}|${profile?.campus_id ?? ''}|${season?.starts_at ?? ''}`

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      // Friends is a set of ids, not a board the database knows about.
      let friendIds: string[] | null = null
      if (scope === 'friends' && user) {
        const { data: conns } = await supabase
          .from('connections')
          .select('requester_id, receiver_id')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted')
        friendIds = [
          ...new Set([
            ...(conns || []).map((c: any) => (c.requester_id === user.id ? c.receiver_id : c.requester_id)),
            user.id,
          ]),
        ]
      }

      const params = (z: Zone, limit: number) => ({
        p_zone: z,
        p_campus_id: scope === 'campus' ? profile?.campus_id || null : null,
        p_friend_ids: friendIds,
        p_since: season?.starts_at || null,
        p_limit: limit,
      })

      const unpack = (res: any): Dash => {
        const payload = res?.data as { ok?: boolean; rows?: LeaderEntry[]; me?: MeRow | null } | null
        if (res?.error || !payload?.ok) return { top: [], me: null }
        return { top: payload.rows ?? [], me: payload.me ?? null }
      }

      // The open mode's full board is the only thing a zone change needs. Its
      // three-row dashboard entry is derived from that same response, and the
      // other modes are fetched once per scope instead of on every tap.
      const boardRes = await supabase.rpc('match_leaderboard', params(zone, LEADERBOARD_LIMIT))
      if (id !== requestId.current) return

      const board = unpack(boardRes)
      setRows(board.top)
      setMe(board.me)
      setLoading(false)

      if (dashCache.current?.key === scopeKey) return

      const others = ZONES.filter((z) => z.key !== zone)
      const zoneRes = await Promise.all(others.map((z) => supabase.rpc('match_leaderboard', params(z.key, 3))))
      if (id !== requestId.current) return

      const next: Partial<Record<Zone, Dash>> = {
        [zone]: { top: board.top.slice(0, 3), me: board.me },
      }
      others.forEach((z, i) => {
        next[z.key] = unpack(zoneRes[i])
      })
      dashCache.current = { key: scopeKey, data: next }
      setDash(next)
    } catch {
      if (id !== requestId.current) return
      setRows([])
      setMe(null)
      setDash({})
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [supabase, zone, scope, scopeKey, profile?.campus_id, season?.starts_at, user])

  useEffect(() => {
    load()
  }, [load])

  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)
  const zoneLabel = ZONES.find((z) => z.key === zone)?.label ?? 'Overall'

  if (loading)
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="skeleton" style={{ width: 200, height: 20, borderRadius: 8, margin: '0 auto 12px' }} />
        <div className="skeleton" style={{ width: 160, height: 14, borderRadius: 6, margin: '0 auto' }} />
      </div>
    )

  const scopeLabel =
    scope === 'campus' ? 'Your campus' : scope === 'friends' ? 'Your connections' : 'All of ConnectToCampus'

  return (
    <div>
      {/* Season banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <svg
          width={26}
          height={26}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        </svg>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {season?.name || 'Season 1'} · {scopeLabel}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {seasonWeek(season) ? `${seasonWeek(season)} · ` : ''}
            {zoneLabel} points from finished matches only
          </p>
        </div>
        {me && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>#{me.rank}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>your rank</p>
          </div>
        )}
      </div>

      {/* One dashboard per mode — typing, maths, live battle quiz, and combined */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {ZONES.map((z) => {
          const mine = dash[z.key]?.me ?? null
          const leader = dash[z.key]?.top?.[0]
          const isActive = zone === z.key
          return (
            <button
              key={z.key}
              type="button"
              onClick={() => setZone(z.key)}
              aria-pressed={isActive}
              title={z.hint}
              style={{
                textAlign: 'left',
                fontFamily: 'inherit',
                cursor: 'pointer',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isActive ? 'var(--accent-light)' : 'var(--bg)',
                boxShadow: isActive
                  ? '0 0 0 1px var(--accent), 0 6px 18px -12px color-mix(in srgb, var(--accent) 70%, transparent)'
                  : 'var(--shadow-sm)',
                transition: 'border-color .18s ease, box-shadow .18s ease, background .18s ease',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{z.label}</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--accent-text)', lineHeight: 1.15 }}>
                {(mine?.points ?? 0).toLocaleString()}
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}> pts</span>
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                {mine ? `#${mine.rank} · ${mine.wins}W/${mine.played} · ${mine.accuracy}%` : 'No matches yet'}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {leader ? `Top: @${leader.username} · ${leader.points.toLocaleString()}` : '—'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Your position */}
      {user && me && (
        <div
          style={{
            background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
            border: '1px solid var(--accent-border)',
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            boxShadow: '0 8px 24px -18px color-mix(in srgb, var(--accent) 80%, transparent)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              fontWeight: 800,
              color: 'var(--on-accent)',
              flexShrink: 0,
            }}
          >
            #{me.rank}
          </div>
          <Avatar name={profile?.full_name || 'You'} avatarUrl={profile?.avatar_url} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {profile?.full_name || 'You'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              @{profile?.username || 'you'} · {me.wins} {me.wins === 1 ? 'win' : 'wins'} in {me.played}{' '}
              {me.played === 1 ? 'match' : 'matches'} · {me.accuracy}% accuracy
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
              <BoltGlyph /> {me.points.toLocaleString()}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{zoneLabel} points</p>
          </div>
        </div>
      )}

      {/* Zone + scope filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)' }}>
          Pick a dashboard above to open its full board
        </p>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Leaderboard scope">
          {(['global', 'campus', 'friends'] as const).map((s) => {
            if (s === 'campus' && !profile?.campus_id) return null
            if (s === 'friends' && !user) return null
            return (
              <button
                key={s}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: scope === s ? 'none' : '1px solid var(--border)',
                  background: scope === s ? 'var(--accent)' : 'var(--bg)',
                  color: scope === s ? 'var(--on-accent)' : 'var(--text-secondary)',
                }}
              >
                {s === 'global' ? (
                  <>
                    <GlobeGlyph /> Global
                  </>
                ) : s === 'campus' ? (
                  <>
                    <CampusGlyph /> Campus
                  </>
                ) : (
                  <>
                    <UsersGlyph /> Friends
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="hc-empty hc-reveal">
          <div className="hc-empty-ic">
            <svg
              width={40}
              height={40}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 19h16M4 19 2.5 8l5.5 4L12 4l4 8 5.5-4L20 19" />
            </svg>
          </div>
          <p className="hc-empty-t">No {zoneLabel.toLowerCase()} points yet</p>
          <p className="hc-empty-s">
            {scope === 'friends'
              ? 'Play a match with your connections to start this board.'
              : scope === 'campus'
                ? 'Nobody from your campus has finished a match here yet — be the first.'
                : 'Finish a live room, typing battle or quick-maths battle and your result lands here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length >= 3 && (
            <div style={{ marginBottom: 24, padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0 }}>
                {[1, 0, 2].map((pos) => {
                  const p = top3[pos]
                  const isChampion = pos === 0
                  const barH = isChampion ? 100 : pos === 1 ? 72 : 52
                  const avatarSize = isChampion ? 60 : 48
                  const medalSize = isChampion ? 36 : 28
                  // Winner bar wears the accent; second is a neutral surface,
                  // third a muted accent. No fixed metals, so the podium sits
                  // in the same palette as the rest of the section.
                  const grad = isChampion
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 72%, white) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 72%, black) 100%)'
                    : pos === 1
                      ? 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-tertiary) 100%)'
                      : 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 26%, var(--bg-tertiary)) 0%, var(--bg-tertiary) 100%)'
                  const shadow = isChampion
                    ? '0 12px 26px -14px color-mix(in srgb, var(--accent) 75%, transparent)'
                    : 'var(--shadow-sm)'

                  return (
                    <div
                      key={p.user_id}
                      onClick={() => router.push(`/profile/${p.username}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push(`/profile/${p.username}`)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer',
                        maxWidth: 140,
                      }}
                    >
                      <div style={{ textAlign: 'center', marginBottom: 8, padding: '0 4px' }}>
                        <Avatar name={p.display_name} avatarUrl={p.avatar_url} size={avatarSize} />
                        <p style={{ fontSize: medalSize, margin: '2px 0', lineHeight: 1 }}>
                          <RankGlyph pos={pos} size={medalSize} />
                        </p>
                        <p
                          style={{
                            fontSize: isChampion ? 13 : 12,
                            fontWeight: isChampion ? 700 : 600,
                            color: 'var(--text-primary)',
                            margin: '0 0 1px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 110,
                          }}
                        >
                          {p.display_name?.split(' ')[0] || 'Anon'}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: isChampion ? 'var(--accent)' : 'var(--text-muted)',
                            margin: 0,
                            fontWeight: isChampion ? 600 : 400,
                          }}
                        >
                          @{p.username}
                        </p>
                        <p
                          style={{
                            fontSize: isChampion ? 15 : 13,
                            fontWeight: 800,
                            color: 'var(--accent-text)',
                            margin: '3px 0 0',
                          }}
                        >
                          <BoltGlyph /> {p.points.toLocaleString()}
                        </p>
                        <p style={{ fontSize: 9.5, color: 'var(--text-muted)', margin: 0 }}>
                          {p.wins}W · {p.played} played
                        </p>
                      </div>

                      <div
                        style={{
                          width: '100%',
                          height: barH,
                          background: grad,
                          borderRadius: isChampion ? '12px 12px 4px 4px' : '8px 8px 4px 4px',
                          border: `1px solid ${isChampion ? 'var(--accent-border)' : 'var(--border)'}`,
                          boxShadow: shadow,
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '40%',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                            borderRadius: 'inherit',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: isChampion ? 22 : 18,
                            fontWeight: 900,
                            color: isChampion
                              ? 'color-mix(in srgb, var(--on-accent) 45%, transparent)'
                              : 'var(--text-muted)',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {pos === 0 ? '#1' : pos === 1 ? '#2' : '#3'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Rows */}
          <div className="hc-grid hc-grid--list" style={{ gap: 6 }} role="list" aria-label="Leaderboard">
            {rest.map((entry) => {
              const isMe = user && entry.user_id === user.id
              return (
                <div
                  key={entry.user_id}
                  role="listitem"
                  onClick={() => router.push(`/profile/${entry.username}`)}
                  className="hc-card hc-card--link"
                  style={{
                    flexDirection: 'row',
                    background: isMe ? 'var(--accent-light)' : 'var(--bg)',
                    border: `1px solid ${isMe ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 24,
                        padding: '2px 5px',
                        borderRadius: 7,
                        fontSize: 12.5,
                        fontWeight: 700,
                        background: entry.rank <= 10 ? 'var(--accent-light)' : 'transparent',
                        color: entry.rank <= 10 ? 'var(--accent-text)' : 'var(--text-muted)',
                      }}
                    >
                      {entry.rank}
                    </span>
                  </div>
                  <Avatar name={entry.display_name} avatarUrl={entry.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.display_name || 'Anonymous'}
                      {isMe && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 700 }}>
                          (you)
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      @{entry.username}
                      {entry.department ? ` · ${entry.department}` : ''} · {entry.wins}W · {entry.played} played ·{' '}
                      {entry.accuracy}%
                    </p>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-text)', margin: 0, flexShrink: 0 }}>
                    <BoltGlyph /> {entry.points.toLocaleString()}
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}

      <p className="hc-note" style={{ marginTop: 14 }}>
        Points come from finished matches only: <strong>100 × mode × (0.6 × accuracy + 0.4 × 1/place)</strong>. Live
        battle and typing are ×1.0, quick maths ×0.9 — so a perfect live win is 100, a second place is 70 and a maths
        win is 90. A Daily Quick Math set counts in the maths zone, placed against everyone who played that day. Nothing
        else on your profile affects this board.
      </p>

      {!user && (
        <div
          className="hc-card hc-reveal"
          style={{ textAlign: 'center', alignItems: 'center', marginTop: 20, padding: 16 }}
        >
          <p className="hc-title">Join the competition!</p>
          <p className="hc-sub">Sign up, finish a match and climb the rankings.</p>
          <button className="hc-btn hc-btn--primary" onClick={() => router.push('/auth/login')}>
            Get started
          </button>
        </div>
      )}
    </div>
  )
}
