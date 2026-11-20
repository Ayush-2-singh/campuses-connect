'use client'

import { useEffect, useState, useCallback } from 'react'
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
import CompeteNav from '@/components/compete/CompeteNav'
import type { Tab, Problem, RunResult, Submission, SeasonInfo } from './types'

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

// ─── Drafts ────────────────────────────────────────────────────────────────
// Each problem keeps a draft per language, so switching language (or opening a
// different problem and coming back) restores what was typed instead of the
// starter snippet. Keyed by problem id, not title, so renames don't orphan it.
// v2: the workspace grades a function now. Drafts saved against the old
// stdin/stdout starter would run as broken programs, so they are retired
// (and pruned) instead of silently restored.
const DRAFT_PREFIX = 'cc.draft.v2.'
const draftKey = (problemId: string, language: string) => `${DRAFT_PREFIX}${problemId}.${language}`

function readDraft(problemId: string, language: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(problemId, language))
  } catch {
    return null
  }
}

function writeDraft(problemId: string, language: string, value: string) {
  try {
    const key = draftKey(problemId, language)
    if (value.trim()) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* private mode / quota — the in-memory draft still works */
  }
}

function CompetePageInner() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Games is the landing panel: opening Compete should offer something to
  // play first. Rankings is one click away (and `?tab=rankings` still wins).
  const [tab, setTab] = useState<Tab>('games')

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
    // Any explicit tab in the URL wins over the Games landing default.
    const fromUrl = TAB_FROM_URL[urlTab]
    if (fromUrl) setTab(fromUrl)
  }, [router])

  // challenge state
  const [daily, setDaily] = useState<Problem | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [solved, setSolved] = useState<Record<string, boolean>>({})
  const [lang, setLang] = useState('python')
  const [code, setCode] = useState('')
  // Badge on the Submissions tab; refreshed when a submit is recorded.
  const [submissionCount, setSubmissionCount] = useState(0)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Submission | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Run vs Submit: Run only ever touches the public examples, so it gets its
  // own result state and never counts as a submission.
  const [runningRun, setRunningRun] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<'run' | 'submit' | null>(null)
  // Bumped after every recorded submission so the Submissions tab refetches.
  const [submissionNonce, setSubmissionNonce] = useState(0)
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
          setCode(readDraft(dailyProblem.id, 'python') ?? dailyProblem.starter_code?.['python'] ?? '')
        }

        // Now load user-specific data in parallel
        const [profRes, subsRes2] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('dsa_submissions').select('problem_id').eq('user_id', user.id).eq('verdict', 'accepted'),
        ])

        if (cancelled) return

        setProfile(profRes.data)
        const solvedMap: Record<string, boolean> = {}
        ;(subsRes2.data || []).forEach((s: any) => {
          solvedMap[s.problem_id] = true
        })
        setSolved(solvedMap)
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

  const run = async () => {
    if (!daily || runningRun) return
    setRunningRun(true)
    setRunError(null)
    setRunResult(null)
    setLastAction('run')
    try {
      const res = await fetch('/api/compete/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', credentials: 'include' },
        body: JSON.stringify({ problem_id: daily.id, code, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) setRunError(data?.error || 'Run failed')
      else setRunResult(data)
    } catch {
      setRunError('Network error — try again')
    } finally {
      setRunningRun(false)
    }
  }

  const submit = async () => {
    if (!daily || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    setLastAction('submit')
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
        setSubmissionNonce((n) => n + 1)
        if (data.verdict === 'accepted') {
          setSolved((s) => ({ ...s, [daily.id]: true }))
        }
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setRunning(false)
    }
  }

  const changeLang = (next: string) => {
    // Park the current edits before swapping languages. Without this, the
    // starter snippet for the new language would overwrite unsaved work.
    if (daily) writeDraft(daily.id, lang, code)
    setLang(next)
    if (daily) setCode(readDraft(daily.id, next) ?? daily.starter_code?.[next] ?? '')
    // A verdict for the previous language would be misleading here.
    setRunResult(null)
    setRunError(null)
    setResult(null)
    setError(null)
    setLastAction(null)
  }

  /** Load a past attempt back into the editor without resetting to starter code. */
  const loadSubmission = (nextCode: string, nextLanguage: string) => {
    const nextLang = ['python', 'javascript', 'cpp', 'java'].includes(nextLanguage) ? nextLanguage : 'python'
    setLang(nextLang)
    setCode(nextCode)
    // A loaded attempt becomes the working draft for that language.
    if (daily) writeDraft(daily.id, nextLang, nextCode)
    setResult(null)
    setRunResult(null)
    setRunError(null)
    setError(null)
    setLastAction(null)
  }

  /** Drop this language's draft and put the starter snippet back. */
  const clearDraft = () => {
    if (!daily) return
    try {
      window.localStorage.removeItem(draftKey(daily.id, lang))
    } catch {
      /* nothing stored to clear */
    }
    setCode(daily.starter_code?.[lang] ?? '')
    setResult(null)
    setRunResult(null)
    setRunError(null)
    setError(null)
    setLastAction(null)
  }

  const selectProblem = (p: Problem) => {
    if (daily) writeDraft(daily.id, lang, code)
    setDaily(p)
    setCode(readDraft(p.id, lang) ?? p.starter_code?.[lang] ?? '')
    setResult(null)
    setRunResult(null)
    setRunError(null)
    setError(null)
    setLastAction(null)
  }

  // Keep the draft current while typing, without a localStorage write per key.
  useEffect(() => {
    if (!daily) return
    const timer = window.setTimeout(() => writeDraft(daily.id, lang, code), 400)
    return () => window.clearTimeout(timer)
  }, [code, daily, lang])

  // Drop drafts for problems that no longer exist so the key space doesn't
  // grow forever across seeds/renames. Keys are `cc.draft.<uuid>.<language>`.
  useEffect(() => {
    if (!problems.length) return
    const liveIds = new Set(problems.map((p) => p.id))
    try {
      const stale: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (!key || !key.startsWith('cc.draft.')) continue
        if (!key.startsWith(DRAFT_PREFIX)) {
          stale.push(key)
          continue
        }
        const problemId = key.slice(DRAFT_PREFIX.length).split('.')[0]
        if (!liveIds.has(problemId)) stale.push(key)
      }
      stale.forEach((key) => window.localStorage.removeItem(key))
    } catch {
      /* storage unavailable — nothing to prune */
    }
  }, [problems])

  // Count for the Submissions tab badge. head:true means no rows travel.
  useEffect(() => {
    if (!user || !daily) {
      setSubmissionCount(0)
      return
    }
    let cancelled = false
    const loadCount = async () => {
      try {
        const { count } = await supabase
          .from('dsa_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('problem_id', daily.id)
          .eq('user_id', user.id)
        if (!cancelled) setSubmissionCount(count ?? 0)
      } catch {
        /* badge is optional — never break the workspace over it */
      }
    }
    loadCount()
    return () => {
      cancelled = true
    }
  }, [daily, user, submissionNonce]) // eslint-disable-line react-hooks/exhaustive-deps

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
                Rank. Play. Win. <em className="hc-em">Climb the board.</em>
              </h1>
              <p className="ss-sub">
                A daily DSA challenge, the quiz library, live battles, typing and maths games, a creator board and the
                season rankings — every score graded on the server, so it means the same thing for everyone.
              </p>
            </div>
            <div className="ss-actions">
              <button className="hc-btn hc-btn--primary" type="button" onClick={() => router.push('/compete/live')}>
                <Icon name="gamepad" size={14} /> Live Battle
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

          {/* One nav for the whole section: the four panels below plus the
              Quiz library, Live Battle and question bank routes. Real anchors,
              so every destination is reachable (and crawlable) from here; the
              four panels switch in place through `onSelect`. */}
          <CompeteNav active={tab} onSelect={changeTab} />

          {/* Only the two metrics that belong to Compete: season rating and XP.
              Aura and contribution (karma) live on the profile and the global
              leaderboard, not on this section's scoreboard. */}
          <ScoreHeader userId={user?.id} />

          {/* Loading skeleton */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
              ))}
            </div>
          ) : (
            <>
              {tab === 'rankings' && <RankingsTab user={user} profile={profile} season={season} />}
              {tab === 'contributors' && <ContributorsTab user={user} profile={profile} />}
              {tab === 'challenge' && (
                <ChallengeTab
                  daily={daily}
                  problems={problems}
                  solved={solved}
                  lang={lang}
                  setLang={changeLang}
                  code={code}
                  setCode={setCode}
                  running={running}
                  result={result}
                  error={error}
                  onSubmit={submit}
                  onSelectProblem={selectProblem}
                  runResult={runResult}
                  runError={runError}
                  runningRun={runningRun}
                  onRun={run}
                  lastAction={lastAction}
                  userId={user?.id ?? null}
                  onLoadSubmission={loadSubmission}
                  submissionNonce={submissionNonce}
                  submissionCount={submissionCount}
                  onClearDraft={clearDraft}
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
