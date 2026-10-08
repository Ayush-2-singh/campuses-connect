'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /tournaments — public list. LIVE first, then upcoming, then completed.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons'

interface TournamentRow {
  id: string
  name: string
  game: string
  status: string
  start_date: string | null
  end_date: string | null
  team_count: number
}

const GAME_LABEL: Record<string, string> = {
  FREE_FIRE: 'Free Fire',
  BGMI: 'BGMI',
  VALORANT: 'Valorant',
  CHESS: 'Chess',
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  LIVE: { bg: 'var(--success-light)', fg: 'var(--success-text)' },
  UPCOMING: { bg: 'var(--accent-light)', fg: 'var(--accent-text)' },
  COMPLETED: { bg: 'var(--bg-secondary, var(--bg))', fg: 'var(--text-muted)' },
}

export default function TournamentsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState<TournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'LIVE' | 'UPCOMING' | 'COMPLETED'>('all')

  const loadTournaments = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase.rpc('get_tournaments_list')
      setRows((data as TournamentRow[]) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tournaments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTournaments()
  }, [supabase])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 60px' }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }} aria-hidden="true">
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </span>
          Tournaments
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Campus esports — raw match data, verified results, live standings.
        </p>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'LIVE', label: 'Live' },
            { key: 'UPCOMING', label: 'Upcoming' },
            { key: 'COMPLETED', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as typeof filter)}
              aria-pressed={filter === f.key}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: 999,
                border: filter === f.key ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                background: filter === f.key ? 'var(--accent-light)' : 'var(--bg)',
                color: filter === f.key ? 'var(--accent-text)' : 'var(--text-muted)',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {f.key === 'LIVE' && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--danger)',
                    display: 'inline-block',
                  }}
                />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: 10 }}
          >
            <div className="skeleton" style={{ width: 200, height: 14, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 8, marginTop: 8 }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', margin: '0 0 4px' }}>
              Unable to load tournaments
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Something went wrong while loading tournaments.
            </p>
            <button
              onClick={loadTournaments}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Icon name="trophy" size={32} strokeWidth={1.6} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              {filter === 'all' ? 'No tournaments yet' : `No ${filter.toLowerCase()} tournaments`}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {filter === 'all'
                ? 'The first Free Fire cup is coming soon. Check back later!'
                : `Check back later for ${filter.toLowerCase()} tournaments.`}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => router.push('/tournaments/admin')}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Create Tournament
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredRows.map((t) => {
              const st = STATUS_STYLE[t.status] || STATUS_STYLE.COMPLETED
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/tournaments/${t.id}`)}
                  className="card-hover"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: 'var(--shadow-sm)',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--bg-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--accent-text)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon name="gamepad" size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {GAME_LABEL[t.game] || t.game} · {t.team_count} teams
                      {t.start_date ? ` · ${t.start_date}` : ''}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: st.bg,
                      color: st.fg,
                      flexShrink: 0,
                    }}
                  >
                    {t.status}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
