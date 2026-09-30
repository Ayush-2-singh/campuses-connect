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
  FREE_FIRE: '🔥 Free Fire',
  BGMI: '🪖 BGMI',
  VALORANT: '🎯 Valorant',
  CHESS: '♟️ Chess',
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          🏆 Tournaments
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
