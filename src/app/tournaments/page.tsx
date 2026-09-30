'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /tournaments — public list. LIVE first, then upcoming, then completed.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useRouter } from 'next/navigation'

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

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('get_tournaments_list')
      setRows((data as TournamentRow[]) || [])
      setLoading(false)
    })()
  }, [supabase])

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
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Campus esports — raw match data, verified results, live standings.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tournaments yet — stay tuned.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((t) => {
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
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{GAME_LABEL[t.game] || '🎮'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {t.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t.team_count} teams
                      {t.start_date ? ` · ${t.start_date}` : ''}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 10px',
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
