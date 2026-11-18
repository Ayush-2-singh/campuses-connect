'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useRouter } from 'next/navigation'
import ScoreHeader from '@/components/ScoreHeader'
import { Icon } from '@/components/icons'
import RankingsTab from './RankingsTab'
import ContributorsTab from './ContributorsTab'
import ChallengeTab from './ChallengeTab'
import GamesTab from './GamesTab'
import type { Tab, Problem, Submission, SeasonInfo } from './types'

const TABS: { key: Tab | 'quizzes'; label: string; icon: string; d: string; href?: string }[] = [
  { key: 'rankings', label: 'Rankings', icon: 'trophy', d: 'M4 19h16M4 19 2.5 8l5.5 4L12 4l4 8 5.5-4L20 19' },
  {
    key: 'contributors',
    label: 'Contributors',
    icon: 'pencil',
    d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  },
  { key: 'challenge', label: 'Daily Challenge', icon: 'code', d: 'm16 18 6-6-6-6M8 6l-6 6 6 6' },
  // Quizzes takes the slot Campus Clash used to occupy: the quiz library is
  // where the section's question content lives, so it belongs in the tab row
  // rather than in its own top-level destination. The tab opens the library's
  // own route under this section (/compete/quizzes) — one implementation of
  // the library, not a second copy inside this page.
  {
    key: 'quizzes',
    label: 'Quizzes',
    icon: 'notebook',
    d: 'M4 19.5V6a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z',
    href: '/compete/quizzes',
  },
  // Typing Battle and Quick Math, played here rather than on the retired
  // /games routes. Same components the voice rooms use for in-call games.
  { key: 'games', label: 'Games', icon: 'gamepad', d: 'M6 12h4M8 10v4M15 11h.01M18 13h.01' },
]

const TAB_FROM_URL: Record<string, Tab> = {
  rankings: 'rankings',
  contributors: 'contributors',
  creators: 'contributors',
  daily: 'challenge',
  'daily-challenge': 'challenge',
  games: 'games',
}

const TAB_URL: Record<Tab, string> = {
  rankings: 'rankings',
  contributors: 'contributors',
  challenge: 'daily',
  games: 'games',
}

function CompetePageInner() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<Tab>('rankings')

  /**
   * Deep links (`/compete?tab=clash`) are read AFTER mount instead of through
   * `useSearchParams()`.`useSearchParams` opts the whole page out of
   * prerendering, which is why this route shipped to Google as a 10-word
   * shell with no heading. Reading `location.search` in an effect keeps the
   * same URLs working while the header, tabs and intro below are in the HTML
   * a crawler (or a signed-out visitor on a slow phone) receives.
   */
  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab') || ''
    // Quizzes is a route, not a panel. `?tab=clash` is the URL shape that used
    // to open the Campus Clash panel in this slot; those links now land on the
    // quiz library instead of falling through to Rankings.
    if (urlTab === 'quizzes' || urlTab === 'clash' || urlTab === 'campus-clash') {
      router.replace('/compete/quizzes')
      return
    }
    const fromUrl = TAB_FROM_URL[urlTab]
    if (fromUrl && fromUrl !== 'rankings') setTab(fromUrl)
  }, [router])

  // challenge state
  const [daily, setDaily] = useState<Problem | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [solved, setSolved] = useState<Record<string, boolean>>({})
  const [lang, setLang] = useState('python')
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Submission | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [karma, setKarma] = useState<{ lifetime: number; aura: number; daily: number; season: string } | null>(null)
  const [season, setSeason] = useState<SeasonInfo | null>(null)

  const changeTab = useCallback(
    (t: Tab) => {
      setTab(t)
      router.replace(`/compete?tab=${TAB_URL[t]}`, { scroll: false })
    },
    [router]
  )

  // PROFESSIONAL PATTERN: ALL queries in parallel (Vercel/Linear style)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        // Fire auth + all data queries SIMULTANEOUSLY
        const [authRes, seasonRes, dcRes, problemsRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('seasons')
            .select('id, name, starts_at, ends_at, is_active')
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('daily_challenges')
            .select('problem_id, day')
            .eq('day', new Date().toISOString().slice(0, 10))
            .maybeSingle(),
          supabase
            .from('dsa_problems')
            .select('id, slug, title, difficulty, topics, description, constraints, examples, starter_code')
            .eq('is_active', true)
            .order('difficulty'),
          // We'll load submissions after auth
          Promise.resolve({ data: null }),
        ])

        if (cancelled) return

        const user = authRes.data.user
        if (!user) {
          setUser(null)
          setLoading(false)
          return
        }
        setUser(user)

        setSeason((seasonRes.data as SeasonInfo) || null)
        setProblems(problemsRes.data || [])

        // Daily challenge. The schedule is normally kept full by
        // `ensure_daily_challenge` (daily cron), but a project without cron, a
        // day past the prefilled window or a deactivated problem would leave
        // this tab empty. Resolving once here heals it before the first paint,
        // so "No challenge scheduled today" only appears when there are truly
        // no active problems.
        const pickDaily = (row: { problem_id: string } | null) =>
          row ? ((problemsRes.data ?? []).find((prob) => prob.id === row.problem_id) ?? null) : null

        let dailyProblem = pickDaily(dcRes.data)

        if (!dailyProblem) {
          const { data: ensured } = await supabase.rpc('ensure_daily_challenge')
          if ((ensured as { ok?: boolean } | null)?.ok) {
            const { data: fresh } = await supabase
              .from('daily_challenges')
              .select('problem_id, day')
              .eq('day', new Date().toISOString().slice(0, 10))
              .maybeSingle()
            dailyProblem = pickDaily(fresh)
          }
        }

        if (dailyProblem) {
          setDaily(dailyProblem)
          setCode(dailyProblem.starter_code?.['python'] || '')
        }

        // Now load user-specific data in parallel
        const [profRes, subsRes2, ...rest] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('dsa_submissions').select('problem_id').eq('user_id', user.id).eq('verdict', 'accepted'),
          supabase.rpc('my_karma_summary'),
        ])

        if (cancelled) return

        setProfile(profRes.data)
        const solvedMap: Record<string, boolean> = {}
        ;(subsRes2.data || []).forEach((s: any) => {
          solvedMap[s.problem_id] = true
        })
        setSolved(solvedMap)

        const sum = rest[0]?.data
        if (sum && sum[0]) setKarma(sum[0])
      } catch {
        /* empty state */
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!daily || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/compete/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', credentials: 'include' },
        body: JSON.stringify({ problem_id: daily.id, code, language: lang, contest_id: null }),
      })
      const data = await res.json()
      if (!res.ok) setError(data?.error || 'Submission failed')
      else {
        setResult(data)
        if (data.verdict === 'accepted') {
          setSolved((s) => ({ ...s, [daily.id]: true }))
          const { data: sum } = await supabase.rpc('my_karma_summary')
          if (sum && sum[0]) setKarma(sum[0])
        }
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setRunning(false)
    }
  }

  const selectProblem = (p: Problem) => {
    setDaily(p)
    setCode(p.starter_code?.[lang] || '')
    setResult(null)
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="compete">
        <div className="ambient ss-wrap">
          {/* Header strip — the shared section-shell chrome (same frame the
              Jobs / Talent / Leaderboard pages use). */}
          <div className="ss-head hc-reveal">
            <span className="ss-icon">
              <Icon name="zap" size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              {/* The page's only H1 (the mobile top bar used to carry a brand
                  H1, which is what Google saw instead of this). */}
              <h1 className="ss-title">
                Rank. Play. Win. <em className="hc-em">Earn aura.</em>
              </h1>
              <p className="ss-sub">Timed DSA practice, quizzes and leaderboards — scored on the server.</p>
            </div>
            <div className="ss-actions">
              <button className="hc-btn hc-btn--primary" type="button" onClick={() => router.push('/compete/live')}>
                <Icon name="gamepad" size={14} /> Live Battle
              </button>
              <button className="hc-btn" type="button" onClick={() => router.push('/compete/live/questions')}>
                <Icon name="notebook" size={14} /> Question bank
              </button>
            </div>
            <span className="ss-spacer" />
            {problems.length > 0 && (
              <div className="ss-stats">
                <span className="ss-stat">
                  <span className="ss-stat-v">{problems.length}</span>
                  <span className="ss-stat-l">Problems</span>
                </span>
              </div>
            )}
          </div>

          {/* Crawlable intro + real <a> links. This is the content a search
              result can quote, and the links are how the crawler reaches the
              quiz library, games and Live Battle surfaces from /compete. */}
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
              margin: '0 0 10px',
              textAlign: 'left',
            }}
          >
            Compete is the practice side of ConnectToCampus: a daily DSA challenge scored on the server, a quiz library
            you can practise solo or run live with your campus, a contributor board for interview write-ups, and typing
            and quick-maths battles for a break. Every submission is timed and graded server-side, so a score means the
            same thing for everyone.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              fontSize: 13,
              fontWeight: 600,
              margin: '0 0 18px',
            }}
          >
            {[
              { href: '/compete?tab=daily', label: 'Daily DSA challenge' },
              { href: '/compete/quizzes', label: 'Quiz library' },
              { href: '/compete?tab=games', label: 'Typing & maths battles' },
              { href: '/compete/live', label: 'Host a live quiz' },
              { href: '/leaderboard', label: 'Leaderboard' },
            ].map((l) => (
              <Link key={l.href} href={l.href} style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* The four metrics, kept separate: Rating / Aura / XP / Karma.
              Replaces the old header tiles, which labelled a lifetime
              accumulator "Aura" — contradicting the daily definition. */}
          <ScoreHeader userId={user?.id} />

          {/* Tabs — SVG icons, accent underline follows the section green */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 20,
              borderBottom: '1px solid var(--border)',
              overflowX: 'auto',
            }}
            className="compete-tabs chip-scroll"
            role="tablist"
            aria-label="Compete sections"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => (t.href ? router.push(t.href) : changeTab(t.key as Tab))}
                role="tab"
                aria-selected={tab === t.key}
                style={{
                  padding: '9px 16px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: tab === t.key ? 'var(--accent-text)' : 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span style={{ display: 'inline-flex' }} aria-hidden="true">
                  <Icon name={t.icon} size={15} strokeWidth={2} />
                </span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Loading skeleton */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
              ))}
            </div>
          ) : (
            <>
              {tab === 'rankings' && <RankingsTab user={user} profile={profile} season={season} karma={karma} />}
              {tab === 'contributors' && <ContributorsTab user={user} profile={profile} />}
              {tab === 'challenge' && (
                <ChallengeTab
                  daily={daily}
                  problems={problems}
                  solved={solved}
                  lang={lang}
                  setLang={setLang}
                  code={code}
                  setCode={setCode}
                  running={running}
                  result={result}
                  error={error}
                  onSubmit={submit}
                  onSelectProblem={selectProblem}
                />
              )}
              {tab === 'games' && <GamesTab />}
            </>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}

export default function CompetePage() {
  // No <Suspense> wrapper: it only existed to satisfy useSearchParams, and it
  // is what made this route prerender as an empty fallback.
  return <CompetePageInner />
}
