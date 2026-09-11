'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useRouter, useSearchParams } from 'next/navigation'
import RankingsTab from './RankingsTab'
import ChallengeTab from './ChallengeTab'
import ClashTab from './ClashTab'
import type { Tab, Problem, Submission, SeasonInfo } from './types'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'rankings', label: 'Rankings', icon: '🏆' },
  { key: 'challenge', label: 'Daily Challenge', icon: '🧩' },
  { key: 'clash', label: 'Games & Clash', icon: '🎮' },
]

const TAB_FROM_URL: Record<string, Tab> = {
  rankings: 'rankings', daily: 'challenge', 'daily-challenge': 'challenge',
  clash: 'clash', 'campus-clash': 'clash',
}

const TAB_URL: Record<Tab, string> = { rankings: 'rankings', challenge: 'daily', clash: 'clash' }

function CompetePageInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
  const [now, setNow] = useState(Date.now())

  // Countdown timer — only runs when clash tab is active
  useEffect(() => {
    if (tab !== 'clash' || !contest) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [tab, contest])

  const changeTab = useCallback((t: Tab) => {
    setTab(t)
    router.replace(`/compete?tab=${TAB_URL[t]}`, { scroll: false })
  }, [router])

  // PROFESSIONAL PATTERN: ALL queries in parallel (Vercel/Linear style)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        // Fire auth + all data queries SIMULTANEOUSLY
        const [authRes, seasonRes, dcRes, problemsRes, subsRes, contestsRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('seasons').select('id, name, starts_at, ends_at, is_active').eq('is_active', true).maybeSingle(),
          supabase.from('daily_challenges').select('problem_id, day').eq('day', new Date().toISOString().slice(0, 10)).maybeSingle(),
          supabase.from('dsa_problems').select('id, slug, title, difficulty, topics, description, constraints, examples, starter_code').eq('is_active', true).order('difficulty'),
          // We'll load submissions after auth
          Promise.resolve({ data: null }),
          supabase.from('contests').select('*').order('starts_at', { ascending: true }).limit(5),
        ])

        if (cancelled) return

        const user = authRes.data.user
        if (!user) { setUser(null); setLoading(false); return }
        setUser(user)

        setSeason((seasonRes.data as SeasonInfo) || null)
        setProblems(problemsRes.data || [])

        // Load daily challenge problem if exists
        const dc = dcRes.data
        if (dc) {
          const p = problemsRes.data?.find(prob => prob.id === dc.problem_id)
          if (p) { setDaily(p); setCode(p.starter_code?.['python'] || '') }
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
        ;(subsRes2.data || []).forEach((s: any) => { solvedMap[s.problem_id] = true })
        setSolved(solvedMap)

        const sum = rest[0]?.data
        if (sum && sum[0]) setKarma(sum[0])

        // Contest
        const next = (contestsRes.data || []).find((c: any) => new Date(c.ends_at).getTime() > Date.now())
        if (next) {
          setContest(next)
          const { data: regs } = await supabase.from('contest_registrations')
            .select('user_id').eq('contest_id', next.id).eq('user_id', user.id).maybeSingle()
          if (!cancelled) setRegistered(!!regs)
        }
      } catch { /* empty state */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!daily || running) return
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/compete/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: daily.id, code, language: lang, contest_id: null }),
      })
      const data = await res.json()
      if (!res.ok) setError(data?.error || 'Submission failed')
      else {
        setResult(data)
        if (data.verdict === 'accepted') {
          setSolved(s => ({ ...s, [daily.id]: true }))
          const { data: sum } = await supabase.rpc('my_karma_summary')
          if (sum && sum[0]) setKarma(sum[0])
        }
      }
    } catch { setError('Network error — try again') }
    finally { setRunning(false) }
  }

  const register = async () => {
    if (!contest) return
    try { await supabase.from('contest_registrations').insert({ contest_id: contest.id, user_id: user?.id }) } catch {}
    setRegistered(true)
  }

  const selectProblem = (p: Problem) => {
    setDaily(p)
    setCode(p.starter_code?.[lang] || '')
    setResult(null)
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="compete">
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 48px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>⚔️ Compete</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Rank. Play. Win. Earn Aura.</p>
            </div>
            {karma && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>⚡ {karma.aura}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Aura · Game wins</p>
                </div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>⭐ {karma.lifetime}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Karma · lifetime</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="compete-tabs chip-scroll">
            {TABS.map(t => (
              <button key={t.key} onClick={() => changeTab(t.key)} role="tab" aria-selected={tab === t.key} style={{
                padding: '9px 16px', fontSize: 13.5, fontWeight: 600, border: 'none', background: 'none',
                cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Loading skeleton */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
              ))}
            </div>
          ) : (
            <>
              {tab === 'rankings' && <RankingsTab user={user} profile={profile} season={season} karma={karma} />}
              {tab === 'challenge' && (
                <ChallengeTab
                  daily={daily} problems={problems} solved={solved} lang={lang} setLang={setLang}
                  code={code} setCode={setCode} running={running} result={result} error={error}
                  onSubmit={submit} onSelectProblem={selectProblem}
                />
              )}
              {tab === 'clash' && <ClashTab contest={contest} registered={registered} now={now} onRegister={register} />}
            </>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}

export default function CompetePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <CompetePageInner />
    </Suspense>
  )
}
