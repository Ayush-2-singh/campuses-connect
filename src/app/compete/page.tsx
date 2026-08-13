'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'

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

type Submission = { verdict: string; passed: number; total: number; first_fail_input: string | null; runtime_ms?: number }

const LANGUAGES = [
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'cpp', label: 'C++' },
  { key: 'java', label: 'Java' },
]

const diffColor: Record<string, string> = {
  easy: 'var(--success-text)', medium: 'var(--warning-text)', hard: 'var(--danger)',
}

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
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function CompetePage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [tab, setTab] = useState<'challenge' | 'clash' | 'rankings'>('challenge')

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

  // clash state
  const [contest, setContest] = useState<any>(null)
  const [registered, setRegistered] = useState(false)
  const now = useNow()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: sum } = await supabase.rpc('my_karma_summary')
      if (sum && sum[0]) setKarma(sum[0])

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

      // problem list + solved status (test_cases stays server-side)
      const { data: all } = await supabase
        .from('dsa_problems')
        .select('id, slug, title, difficulty, topics, description, constraints, examples, starter_code')
        .eq('is_active', true)
        .order('difficulty')
      setProblems(all || [])
      const { data: subs } = await supabase
        .from('dsa_submissions').select('problem_id').eq('user_id', user.id).eq('verdict', 'accepted')
      const solvedMap: Record<string, boolean> = {}
      ;(subs || []).forEach(s => { solvedMap[s.problem_id] = true })
      setSolved(solvedMap)

      // upcoming / live contest
      const { data: contests } = await supabase
        .from('contests').select('*').order('starts_at', { ascending: true }).limit(5)
      const next = (contests || []).find(c => new Date(c.ends_at).getTime() > Date.now())
      if (next) {
        setContest(next)
        const { data: regs } = await supabase.from('contest_registrations').select('user_id').eq('contest_id', next.id).eq('user_id', user.id).maybeSingle()
        setRegistered(!!regs)
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
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/compete/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: daily.id, code, language: lang, contest_id: null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Submission failed')
      } else {
        setResult(data)
        if (data.verdict === 'accepted') {
          setSolved(s => ({ ...s, [daily.id]: true }))
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
      await supabase.from('contest_registrations').insert({ contest_id: contest.id, user_id: user.id })
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
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>⚔️ Compete</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Solve. Climb. Earn Aura.</p>
          </div>
          {karma && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>⭐ {karma.aura}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Aura · {karma.season || 'Season 1'}</p>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>🏆 {karma.lifetime}</p>
                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Karma · lifetime</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="compete-tabs">
          {(['challenge', 'clash', 'rankings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '9px 16px', fontSize: 13.5, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'inherit', whiteSpace: 'nowrap',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
              }}>
              {t === 'challenge' ? 'Daily Challenge' : t === 'clash' ? 'Campus Clash' : 'Rankings'}
            </button>
          ))}
        </div>

        {/* ── DAILY CHALLENGE ── */}
        {tab === 'challenge' && (
          <div>
            {!daily ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, margin: '0 0 8px' }}>🧩</p>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No challenge scheduled for today yet — check back soon.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Problem card */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{daily.title}</h3>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--accent-light)', color: diffColor[daily.difficulty] }}>{daily.difficulty}</span>
                    {solved[daily.id] && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--success-light)', color: 'var(--success-text)' }}>✓ Solved</span>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{daily.description}</p>
                  {(daily.topics || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {daily.topics.map(t => (
                        <span key={t} style={{ fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '3px 9px', borderRadius: 20 }}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Editor */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {LANGUAGES.map(l => (
                      <button key={l.key} onClick={() => changeLang(l.key)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          border: lang === l.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                          background: lang === l.key ? 'var(--accent-light)' : 'var(--bg)', color: lang === l.key ? 'var(--accent-text)' : 'var(--text-secondary)',
                        }}>{l.label}</button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={submit} disabled={running || !code.trim()}
                      style={{
                        padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                        background: running || !code.trim() ? 'var(--disabled)' : 'var(--accent)', color: running || !code.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
                      }}>
                      {running ? 'Judging…' : '▶ Submit'}
                    </button>
                  </div>
                  <textarea
                    value={code}
                    onChange={e => { setCode(e.target.value); setResult(null) }}
                    spellCheck={false}
                    placeholder="# Write your solution — reads from stdin, prints to stdout"
                    style={{
                      width: '100%', minHeight: 260, background: '#0B0D11', color: '#D6DBE4', border: 'none', outline: 'none',
                      padding: '14px 16px', fontSize: 13, fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace', lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                  {error && (
                    <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)', background: 'var(--danger-light)', borderTop: '1px solid var(--danger-border)' }}>{error}</div>
                  )}
                  {result && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', fontSize: 13, background: result.verdict === 'accepted' ? 'var(--success-light)' : 'var(--bg-tertiary)' }}>
                      {result.verdict === 'accepted' ? (
                        <p style={{ margin: 0, color: 'var(--success-text)', fontWeight: 700 }}>✅ Accepted — {result.passed}/{result.total} hidden cases passed{result.runtime_ms ? ` · ${result.runtime_ms}ms` : ''} · karma awarded</p>
                      ) : (
                        <p style={{ margin: 0, color: result.verdict === 'time_limit' ? 'var(--warning-text)' : 'var(--danger)' }}>
                          {result.verdict === 'wrong_answer' ? `❌ Wrong answer on a hidden case: ${result.first_fail_input || ''}` :
                           result.verdict === 'time_limit' ? '⏱ Time limit exceeded' :
                           result.verdict === 'compile_error' ? '⚠️ Compile error' : '💥 Runtime error'} — {result.passed}/{result.total} passed
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Problem list */}
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>All problems</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {problems.map(p => (
                      <button key={p.id}
                        onClick={() => { setDaily(p); setCode(p.starter_code?.[lang] || ''); setResult(null) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{solved[p.id] ? '✅' : p.difficulty === 'easy' ? '🟢' : p.difficulty === 'medium' ? '🟠' : '🔴'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{p.title}</p>
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>{p.difficulty}</p>
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

        {/* ── CAMPUS CLASH ── */}
        {tab === 'clash' && (
          <div>
            {!contest ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, margin: '0 0 8px' }}>🏆</p>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No contest scheduled yet. Check back for the next Campus Clash!</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--accent-border)', borderRadius: 16, padding: '22px 20px', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>⚡ Campus Clash</p>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>{contest.name}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>{fmtDate(contest.starts_at)} — {fmtDate(contest.ends_at)}</p>
                <p style={{ fontSize: 32, fontWeight: 800, color: isLive ? 'var(--danger)' : 'var(--accent)', margin: '14px 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                  {isLive ? '🔴 ' : '⏳ '}{clashCountdown}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                  {isLive ? 'Contest is LIVE — problems are open now!' : now < new Date(contest.starts_at).getTime() ? 'Starts when the timer hits zero.' : 'Contest finished.'}
                </p>
                {registered ? (
                  <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: 'var(--success-text)', background: 'var(--success-light)', padding: '9px 20px', borderRadius: 10 }}>✓ Registered</span>
                ) : (
                  <button onClick={register}
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Register for {contest.name}
                  </button>
                )}
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 0', lineHeight: 1.6 }}>
                  Every Saturday 9 PM IST · 60 minutes · Solve problems, earn Aura, climb the national + campus boards.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── RANKINGS ── */}
        {tab === 'rankings' && (
          <RankingsTab />
        )}
      </div>
    </Layout>
  )
}

function RankingsTab() {
  const supabase = createClient()
  const [mode, setMode] = useState<'aura' | 'karma'>('aura')
  const [leaders, setLeaders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const col = mode === 'aura' ? 'aura_points' : 'karma_points'
      const { data } = await supabase
        .from('profiles')
        .select(`full_name, username, avatar_url, ${col}`)
        .eq('is_public', true)
        .order(col, { ascending: false })
        .limit(25)
      setLeaders(data || [])
      setLoading(false)
    }
    load()
  }, [mode])

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['aura', 'karma'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: mode === m ? 'none' : '1px solid var(--border)',
              background: mode === m ? 'var(--accent)' : 'var(--bg)',
              color: mode === m ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}>
            {m === 'aura' ? '⚡ Aura (season)' : '⭐ Karma (lifetime)'}
          </button>
        ))}
      </div>
      {loading ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leaders.map((l, i) => (
            <div key={l.username} style={{ background: 'var(--bg)', border: i < 3 ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 17, width: 26, textAlign: 'center', flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <Avatar name={l.full_name} avatarUrl={l.avatar_url} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{l.full_name || 'Anonymous'}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>@{l.username}</p>
              </div>
              <p style={{ fontSize: 15, fontWeight: 800, color: mode === 'aura' ? 'var(--accent-text)' : 'var(--yellow-text)', margin: 0, flexShrink: 0 }}>
                {mode === 'aura' ? '⚡ ' : '⭐ '}{l[mode === 'aura' ? 'aura_points' : 'karma_points'] || 0}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
