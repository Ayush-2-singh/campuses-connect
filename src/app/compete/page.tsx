'use client'

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useRouter, useSearchParams } from 'next/navigation'

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type Tab = 'rankings' | 'challenge' | 'clash'

type Problem = {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  description: string
  constraints: string
  examples: { input: string; output: string; explanation?: string }[]
  starter_code: Record<string, string>
}

type Submission = {
  verdict: string
  passed: number
  total: number
  first_fail_input: string | null
  runtime_ms?: number
}

type LeaderEntry = {
  user_id: string
  full_name: string
  username: string
  avatar_url: string | null
  karma_points: number
  aura_points: number
  streak_days: number
  department?: string
  combined_score: number
  github_contributions: number
  leetcode_solved: number
  leetcode_rating: number
}

type SeasonInfo = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  is_active: boolean
}

type RankScope = 'global' | 'campus' | 'friends'

/**
 * Weeks elapsed since the season started → "Week 2 of 13".
 * Returns null for seasons without usable dates (nothing invented).
 */
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

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'rankings', label: 'Rankings', icon: '🏆' },
  { key: 'challenge', label: 'Daily Challenge', icon: '🧩' },
  { key: 'clash', label: 'Campus Clash', icon: '⚔️' },
]

const TAB_FROM_URL: Record<string, Tab> = {
  rankings: 'rankings',
  daily: 'challenge',
  'daily-challenge': 'challenge',
  clash: 'clash',
  'campus-clash': 'clash',
}

const LANGUAGES = [
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'cpp', label: 'C++' },
  { key: 'java', label: 'Java' },
]

const diffColor: Record<string, string> = {
  easy: 'var(--success-text)',
  medium: 'var(--warning-text)',
  hard: 'var(--danger)',
}

const TAB_URL: Record<Tab, string> = {
  rankings: 'rankings',
  challenge: 'daily',
  clash: 'clash',
}

/** Aura is the season score — the default ranking metric. */
const RANK_SORTS = ['aura', 'karma'] as const

/** Rank-window size shown as rows below the podium. */
const LEADERBOARD_LIMIT = 50

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function computeScore(l: any) {
  const karma = (l.karma_points || 0) * 1
  const contrib = (l.github_contributions || 0) * 0.5
  const solved = (l.leetcode_solved || 0) * 0.3
  const rating = (l.leetcode_rating || 0) * 0.2
  const streak = (l.streak_days || 0) * 2
  return Math.round(karma + contrib + solved + rating + streak)
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

function CompetePageInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  // Determine default tab from URL
  const urlTab = searchParams.get('tab') || ''
  const initialTab: Tab = TAB_FROM_URL[urlTab] || 'rankings'
  const [tab, setTab] = useState<Tab>(initialTab)

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

  // clash state
  const [contest, setContest] = useState<any>(null)
  const [registered, setRegistered] = useState(false)
  const now = useNow()

  // Update URL when tab changes
  const changeTab = useCallback(
    (t: Tab) => {
      setTab(t)
      router.replace(`/compete?tab=${TAB_URL[t]}`, { scroll: false })
    },
    [router]
  )

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setUser(null)
          return
        }
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        const { data: sum } = await supabase.rpc('my_karma_summary')
        if (sum && sum[0]) setKarma(sum[0])

        // Season record with real dates for the Rankings header
        const { data: seasonRow } = await supabase
          .from('seasons')
          .select('id, name, starts_at, ends_at, is_active')
          .eq('is_active', true)
          .maybeSingle()
        setSeason((seasonRow as SeasonInfo) || null)

        // daily challenge
        const dcRes = await supabase
          .from('daily_challenges')
          .select('problem_id, day')
          .eq('day', new Date().toISOString().slice(0, 10))
          .maybeSingle()
        const dc = dcRes.data
        if (dc) {
          const { data: p } = await supabase
            .from('dsa_problems')
            .select('id, slug, title, difficulty, topics, description, constraints, examples, starter_code')
            .eq('id', dc.problem_id)
            .single()
          if (p) {
            setDaily(p)
            setCode(p.starter_code?.[lang] || '')
          }
        }

        // problem list + solved status
        const { data: all } = await supabase
          .from('dsa_problems')
          .select('id, slug, title, difficulty, topics, description, constraints, examples, starter_code')
          .eq('is_active', true)
          .order('difficulty')
        setProblems(all || [])
        const { data: subs } = await supabase
          .from('dsa_submissions')
          .select('problem_id')
          .eq('user_id', user.id)
          .eq('verdict', 'accepted')
        const solvedMap: Record<string, boolean> = {}
        ;(subs || []).forEach((s) => {
          solvedMap[s.problem_id] = true
        })
        setSolved(solvedMap)

        // upcoming contest
        const { data: contests } = await supabase
          .from('contests')
          .select('*')
          .order('starts_at', { ascending: true })
          .limit(5)
        const next = (contests || []).find((c) => new Date(c.ends_at).getTime() > Date.now())
        if (next) {
          setContest(next)
          const { data: regs } = await supabase
            .from('contest_registrations')
            .select('user_id')
            .eq('contest_id', next.id)
            .eq('user_id', user.id)
            .maybeSingle()
          setRegistered(!!regs)
        }
      } catch {
        /* empty state */
      }
    }
    load()
  }, [])

  const changeLang = (l: string) => {
    setLang(l)
    setResult(null)
    if (daily) setCode(daily.starter_code?.[l] || '')
  }

  const submit = async () => {
    if (!daily || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/compete/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const register = async () => {
    if (!contest) return
    try {
      await supabase.from('contest_registrations').insert({ contest_id: contest.id, user_id: user?.id })
    } catch {}
    setRegistered(true)
  }

  const isLive = contest && now >= new Date(contest.starts_at).getTime() && now <= new Date(contest.ends_at).getTime()
  const clashCountdown = useMemo(() => {
    if (!contest) return ''
    if (isLive) return fmtCountdown(new Date(contest.ends_at).getTime() - now)
    return fmtCountdown(new Date(contest.starts_at).getTime() - now)
  }, [contest, now, isLive])

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="compete">
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 48px' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                ⚔️ Compete
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Rank. Solve. Earn Aura.</p>
            </div>
            {karma && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '8px 14px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
                    ⚡ {karma.aura}
                  </p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>
                    Aura · {karma.season || 'Season 1'}
                  </p>
                </div>
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '8px 14px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    ⭐ {karma.lifetime}
                  </p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Karma · lifetime</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs — Rankings FIRST */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 20,
              borderBottom: '1px solid var(--border)',
              overflowX: 'auto',
            }}
            className="compete-tabs chip-scroll"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                role="tab"
                aria-selected={tab === t.key}
                style={{
                  padding: '9px 16px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ═══════════ RANKINGS (PRIMARY) ═══════════ */}
          {tab === 'rankings' && <RankingsTab user={user} profile={profile} season={season} karma={karma} />}

          {/* ═══════════ DAILY CHALLENGE ═══════════ */}
          {tab === 'challenge' && (
            <div>
              {!daily ? (
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 28, margin: '0 0 8px' }}>🧩</p>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                    No challenge scheduled for today yet — check back soon.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Problem card */}
                  <div
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '18px 20px',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {daily.title}
                      </h3>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: 'var(--accent-light)',
                          color: diffColor[daily.difficulty],
                        }}
                      >
                        {daily.difficulty}
                      </span>
                      {solved[daily.id] && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 20,
                            background: 'var(--success-light)',
                            color: 'var(--success-text)',
                          }}
                        >
                          ✓ Solved
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.7,
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {daily.description}
                    </p>
                    {(daily.topics || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {daily.topics.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10.5,
                              color: 'var(--text-muted)',
                              background: 'var(--bg-tertiary)',
                              padding: '3px 9px',
                              borderRadius: 20,
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Editor */}
                  <div
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        flexWrap: 'wrap',
                      }}
                    >
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.key}
                          onClick={() => changeLang(l.key)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            border: lang === l.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                            background: lang === l.key ? 'var(--accent-light)' : 'var(--bg)',
                            color: lang === l.key ? 'var(--accent-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {l.label}
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={submit}
                        disabled={running || !code.trim()}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          border: 'none',
                          background: running || !code.trim() ? 'var(--disabled)' : 'var(--accent)',
                          color: running || !code.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
                        }}
                      >
                        {running ? 'Judging…' : '▶ Submit'}
                      </button>
                    </div>
                    <textarea
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value)
                        setResult(null)
                      }}
                      spellCheck={false}
                      placeholder="# Write your solution — reads from stdin, prints to stdout"
                      style={{
                        width: '100%',
                        minHeight: 260,
                        background: '#0B0D11',
                        color: '#D6DBE4',
                        border: 'none',
                        outline: 'none',
                        padding: '14px 16px',
                        fontSize: 13,
                        fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
                        lineHeight: 1.7,
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                    {error && (
                      <div
                        style={{
                          padding: '10px 14px',
                          fontSize: 12.5,
                          color: 'var(--danger)',
                          background: 'var(--danger-light)',
                          borderTop: '1px solid var(--danger-border)',
                        }}
                      >
                        {error}
                      </div>
                    )}
                    {result && (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderTop: '1px solid var(--border)',
                          fontSize: 13,
                          background: result.verdict === 'accepted' ? 'var(--success-light)' : 'var(--bg-tertiary)',
                        }}
                      >
                        {result.verdict === 'accepted' ? (
                          <p style={{ margin: 0, color: 'var(--success-text)', fontWeight: 700 }}>
                            ✅ Accepted — {result.passed}/{result.total} hidden cases passed
                            {result.runtime_ms ? ` · ${result.runtime_ms}ms` : ''} · karma awarded
                          </p>
                        ) : (
                          <p
                            style={{
                              margin: 0,
                              color: result.verdict === 'time_limit' ? 'var(--warning-text)' : 'var(--danger)',
                            }}
                          >
                            {result.verdict === 'wrong_answer'
                              ? `❌ Wrong answer on a hidden case: ${result.first_fail_input || ''}`
                              : result.verdict === 'time_limit'
                                ? '⏱ Time limit exceeded'
                                : result.verdict === 'compile_error'
                                  ? '⚠️ Compile error'
                                  : '💥 Runtime error'}{' '}
                            — {result.passed}/{result.total} passed
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Problem list */}
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
                      All problems
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {problems.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setDaily(p)
                            setCode(p.starter_code?.[lang] || '')
                            setResult(null)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            textAlign: 'left',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '12px 16px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        >
                          <span style={{ fontSize: 16, flexShrink: 0 }}>
                            {solved[p.id]
                              ? '✅'
                              : p.difficulty === 'easy'
                                ? '🟢'
                                : p.difficulty === 'medium'
                                  ? '🟠'
                                  : '🔴'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                              {p.title}
                            </p>
                            <p
                              style={{
                                fontSize: 11.5,
                                color: 'var(--text-muted)',
                                margin: 0,
                                textTransform: 'capitalize',
                              }}
                            >
                              {p.difficulty}
                            </p>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                            {solved[p.id] ? 'Solved' : 'Solve →'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════ CAMPUS CLASH ═══════════ */}
          {tab === 'clash' && (
            <div>
              {!contest ? (
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 28, margin: '0 0 8px' }}>🏆</p>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                    No contest scheduled yet. Check back for the next Campus Clash!
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: 16,
                    padding: '22px 20px',
                    boxShadow: 'var(--shadow-sm)',
                    textAlign: 'center',
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--accent-text)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      margin: '0 0 6px',
                    }}
                  >
                    ⚡ Campus Clash
                  </p>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {contest.name}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    {fmtDate(contest.starts_at)} — {fmtDate(contest.ends_at)}
                  </p>
                  <p
                    style={{
                      fontSize: 32,
                      fontWeight: 800,
                      color: isLive ? 'var(--danger)' : 'var(--accent)',
                      margin: '14px 0 6px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isLive ? '🔴 ' : '⏳ '}
                    {clashCountdown}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                    {isLive
                      ? 'Contest is LIVE — problems are open now!'
                      : now < new Date(contest.starts_at).getTime()
                        ? 'Starts when the timer hits zero.'
                        : 'Contest finished.'}
                  </p>
                  {registered ? (
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--success-text)',
                        background: 'var(--success-light)',
                        padding: '9px 20px',
                        borderRadius: 10,
                      }}
                    >
                      ✓ Registered
                    </span>
                  ) : (
                    <button
                      onClick={register}
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        border: 'none',
                        padding: '10px 24px',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Register for {contest.name}
                    </button>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 0', lineHeight: 1.6 }}>
                    Every Saturday 9 PM IST · 60 minutes · Solve problems, earn Aura, climb the national + campus
                    boards.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}

// useSearchParams() in a client component requires a Suspense
// boundary for prerendering — otherwise `next build` fails on /compete.
export default function CompetePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <CompetePageInner />
    </Suspense>
  )
}

// ══════════════════════════════════════════════════════════════
// RANKINGS TAB — The primary experience
// ══════════════════════════════════════════════════════════════

function RankingsTab({
  user,
  profile,
  season,
  karma,
}: {
  user: any
  profile: any
  season: SeasonInfo | null
  karma: { lifetime: number; aura: number; daily: number; season: string } | null
}) {
  const supabase = createClient()
  const router = useRouter()

  const [leaders, setLeaders] = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'aura' | 'karma'>('aura')
  const [filterScope, setFilterScope] = useState<RankScope>('global')
  const [totalRanked, setTotalRanked] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)

  // ═════════ DATA — one ranking definition, computed in the DB ═════════
  const loadRankings = useCallback(async () => {
    setLoading(true)
    try {
      // RPC keeps its is_public + status='active' guards and returns
      // aura_points now; ordering happens server-side (indexed columns).
      const campusId = filterScope === 'campus' ? profile?.campus_id || null : null
      const { data, error } = await supabase.rpc('get_enhanced_leaderboard', {
        p_campus_id: campusId,
        p_limit: LEADERBOARD_LIMIT,
        p_sort: sortBy,
      })

      if (error || !data || (data as any[]).length === 0) {
        // Fallback: direct query honoring the same guards. Ordering is
        // still done by Postgres — never fetched-then-sorted client-side.
        let query = supabase
          .from('profiles')
          .select(
            'id, full_name, username, avatar_url, karma_points, aura_points, streak_days, departments(short_name)'
          )
          .eq('is_public', true)
          .eq('status', 'active')

        if (filterScope === 'campus' && profile?.campus_id) query = query.eq('campus_id', profile.campus_id)
        if (filterScope === 'friends' && user) {
          // Friends = accepted connections. RLS limits this query to
          // connections where the current user is either party.
          const { data: conns } = await supabase
            .from('connections')
            .select('requester_id, receiver_id')
            .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
            .eq('status', 'accepted')
          const friendIds = (conns || []).map((c: any) => (c.requester_id === user.id ? c.receiver_id : c.requester_id))
          query = friendIds.length > 0 ? query.in('id', friendIds) : query.in('id', [user.id])
        }

        const col = sortBy === 'aura' ? 'aura_points' : 'karma_points'
        const { data: rows } = await query.order(col, { ascending: false }).limit(LEADERBOARD_LIMIT)
        setLeaders(
          (rows || []).map((r: any) => ({
            user_id: r.id,
            full_name: r.full_name,
            username: r.username,
            avatar_url: r.avatar_url,
            karma_points: r.karma_points || 0,
            aura_points: r.aura_points || 0,
            streak_days: r.streak_days || 0,
            department: r.departments?.short_name,
            combined_score: computeScore(r),
            github_contributions: 0,
            leetcode_solved: 0,
            leetcode_rating: 0,
          }))
        )
      } else {
        setLeaders(data as any[])
      }
    } catch {
      setLeaders([])
    }
    setLoading(false)
  }, [sortBy, filterScope, profile?.campus_id, user, supabase])

  useEffect(() => {
    loadRankings()
  }, [loadRankings])

  // ═════ COUNTS + MY RANK — server-side, even outside the 50-row window ═════
  useEffect(() => {
    if (!user) return
    const loadMeta = async () => {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_public', true)
          .eq('status', 'active')
        setTotalRanked(count || 0)

        const meCol = sortBy === 'aura' ? 'aura_points' : 'karma_points'
        const { data: me } = await supabase.from('profiles').select(meCol).eq('id', user.id).single()
        if (!me) return
        const myVal = (me as any)[meCol] || 0

        // One ranking definition: under Aura the rank shown IS the season
        // rank (Aura resets with the season); under Karma it's lifetime.
        // Counted in the DB so it works far outside the top 50.
        const { count: ahead } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_public', true)
          .eq('status', 'active')
          .gt(meCol, myVal)
        setMyRank((ahead || 0) + 1)
      } catch {
        /* best-effort metadata */
      }
    }
    loadMeta()
  }, [user, sortBy, supabase])

  // DB returns the window already ordered — no client-side re-sort.
  const sorted = leaders

  // Current-user position inside the loaded window
  const myPosition = useMemo(() => {
    if (!user) return null
    return sorted.findIndex((l) => l.user_id === user.id)
  }, [sorted, user])

  const myEntry = myPosition !== null && myPosition >= 0 ? sorted[myPosition] : null
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p style={{ fontSize: 32, marginBottom: 8 }}>⏳</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading rankings…</p>
      </div>
    )
  }

  if (sorted.length === 0) {
    const scopeMsg =
      filterScope === 'friends'
        ? 'Add connections to see where you stand against your friends.'
        : filterScope === 'campus'
          ? 'No ranked students from your campus yet — be the first!'
          : 'Be the first to solve challenges, earn Aura, and climb the leaderboard!'
    return (
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '50px 20px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <p style={{ fontSize: 40, margin: '0 0 10px' }}>🏆</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Rankings are getting ready
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{scopeMsg}</p>
      </div>
    )
  }

  const scopeLabel =
    filterScope === 'campus' ? 'Your campus' : filterScope === 'friends' ? 'Your connections' : 'All of ConnectToCampus'

  return (
    <div>
      {/* Season banner — real name/dates from the seasons table */}
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
        <div style={{ fontSize: 24 }}>🗓️</div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {season?.name || 'Season 1'} · {scopeLabel}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {seasonWeek(season) ? `${seasonWeek(season)} · ` : ''}
            {sortBy === 'aura'
              ? 'Aura = season points from karma-earning activities'
              : 'Karma = lifetime earned points'}
          </p>
        </div>
        {myRank !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>#{myRank}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>your rank</p>
          </div>
        )}
      </div>

      {/* ═══════ YOUR POSITION — hero card, always visible ═══════ */}
      {user && (myEntry || myRank !== null) && (
        <div
          style={{
            background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
            border: '2px solid var(--accent)',
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
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
            #{myEntry ? myPosition! + 1 : (myRank ?? '—')}
          </div>
          <Avatar name={profile?.full_name || 'You'} avatarUrl={profile?.avatar_url} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {profile?.full_name || 'You'}
            </p>
            {/* Rank context: Aura view = season rank, Karma view = lifetime */}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {sortBy === 'aura' ? `Season rank · ${season?.name || 'Season 1'}` : 'Lifetime rank · all-time Karma'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              @{profile?.username || 'you'}
              {myEntry?.department ? ` · ${myEntry.department}` : ''}
            </p>
          </div>
          {/* Aura + Karma together — "Where do I stand?" at a glance */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
                ⚡ {myEntry ? myEntry.aura_points : (karma?.aura ?? 0)}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Aura</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#eab308', margin: 0 }}>
                ⭐ {myEntry ? myEntry.karma_points : (karma?.lifetime ?? 0)}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Karma</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ FILTERS — metric + scope ═══════ */}
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
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ranking metric">
          {RANK_SORTS.map((m) => (
            <button
              key={m}
              onClick={() => setSortBy(m)}
              aria-pressed={sortBy === m}
              style={{
                padding: '7px 16px',
                borderRadius: 20,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                border: sortBy === m ? 'none' : '1px solid var(--border)',
                background: sortBy === m ? 'var(--accent)' : 'var(--bg)',
                color: sortBy === m ? 'var(--on-accent)' : 'var(--text-secondary)',
              }}
            >
              {m === 'aura' ? '⚡ Aura' : '⭐ Karma'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Leaderboard scope">
          {(['global', 'campus', 'friends'] as const).map((s) => {
            // Campus needs a campus; Friends needs a session (connections
            // are RLS-scoped to the signed-in user).
            if (s === 'campus' && !profile?.campus_id) return null
            if (s === 'friends' && !user) return null
            return (
              <button
                key={s}
                onClick={() => setFilterScope(s)}
                aria-pressed={filterScope === s}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: filterScope === s ? 'none' : '1px solid var(--border)',
                  background: filterScope === s ? 'var(--accent)' : 'var(--bg)',
                  color: filterScope === s ? 'var(--on-accent)' : 'var(--text-secondary)',
                }}
              >
                {s === 'global' ? '🌐 Global' : s === 'campus' ? '🏫 Campus' : '🤝 Friends'}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══════ TOP 3 PODIUM ═══════ */}
      {top3.length >= 3 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 6,
            marginBottom: 24,
            padding: '0 8px',
          }}
        >
          {[1, 0, 2].map((pos) => {
            const p = top3[pos]
            const h = pos === 0 ? 76 : pos === 1 ? 56 : 40
            const grad =
              pos === 0
                ? 'linear-gradient(180deg, #fde68a, #f59e0b)'
                : pos === 1
                  ? 'linear-gradient(180deg, #d1d5db, #9ca3af)'
                  : 'linear-gradient(180deg, #fed7aa, #ea580c)'
            return (
              <div
                key={p.user_id}
                onClick={() => router.push(`/profile/${p.username}`)}
                role="link"
                tabIndex={0}
                aria-label={`Rank ${pos + 1}: ${p.full_name}, ${sortBy === 'aura' ? p.aura_points : p.karma_points} ${sortBy}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push(`/profile/${p.username}`)}
                style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
              >
                <Avatar name={p.full_name} avatarUrl={p.avatar_url} size={pos === 0 ? 52 : 44} />
                <p style={{ fontSize: pos === 0 ? 32 : 24, margin: '4px 0 2px' }}>{medal(pos)}</p>
                <p
                  style={{
                    fontSize: pos === 0 ? 13 : 12,
                    fontWeight: pos === 0 ? 700 : 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.full_name?.split(' ')[0] || 'Anon'}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>@{p.username}</p>
                <p
                  style={{ fontSize: pos === 0 ? 14 : 13, fontWeight: 800, color: 'var(--accent)', margin: '2px 0 0' }}
                >
                  {sortBy === 'aura' ? `⚡ ${p.aura_points}` : `⭐ ${p.karma_points}`}
                </p>
                <div
                  style={{
                    height: h,
                    background: grad,
                    borderRadius: '8px 8px 0 0',
                    marginTop: 4,
                  }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* ═══════ LEADERBOARD ROWS ═══════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list" aria-label="Leaderboard">
        {rest.map((entry, idx) => {
          const rank = idx + 4 // rows after the 3 podium spots; 1-based
          const isMe = user && entry.user_id === user.id

          return (
            <div
              key={entry.user_id}
              role="listitem"
              onClick={() => router.push(`/profile/${entry.username}`)}
              style={{
                background: isMe ? 'var(--accent-light)' : 'var(--bg)',
                border: isMe ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {/* Rank */}
              <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{rank}</span>
              </div>
              {/* Avatar */}
              <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} size={36} />
              {/* Info */}
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
                  {entry.full_name || 'Anonymous'}
                  {isMe && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 700 }}>(you)</span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  @{entry.username}
                  {entry.department ? ` · ${entry.department}` : ''}
                </p>
              </div>
              {/* Aura + Karma — Karma collapses on narrow screens */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
                  ⚡ {entry.aura_points}
                </p>
                <p className="hide-mobile-soft" style={{ fontSize: 12, fontWeight: 600, color: '#eab308', margin: 0 }}>
                  ⭐ {entry.karma_points}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Truncation note when more players exist beyond the window */}
      {!loading && filterScope === 'global' && totalRanked > sorted.length && sorted.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 14 }}>
          Top {sorted.length} of {totalRanked} ranked students
        </p>
      )}

      {/* Bottom CTA */}
      {!user && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 20,
            padding: '16px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Join the competition!
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Sign up to earn Aura and climb the rankings.
          </p>
          <button
            onClick={() => router.push('/auth/login')}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Get Started →
          </button>
        </div>
      )}
    </div>
  )
}
