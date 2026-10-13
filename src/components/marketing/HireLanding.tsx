'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandName from '@/components/BrandName'
import { getLogoSrc } from '@/components/LogoToggle'
import { Icon } from '@/components/icons'

/**
 * HireLanding — the public landing (V5).
 *
 * Information architecture follows the assessment-verified hiring model:
 *   1. Nav
 *   2. Hero + recruiter-dashboard preview
 *   3. Workflow: Assessment → Verification → Ranking → Shortlisting
 *   4. Candidate discovery preview (filters + ranked table)
 *   5. Assessment methodology
 *   6. Candidate profile & project evidence
 *   7. Trust metrics — GENUINE counts only, passed in from the server
 *   8. Final CTA (the lead form) + footer
 *
 * ── Honesty rules (enforced, not aspirational) ──────────────────────────────
 * Everything that looks like real product data is a UI preview and is labelled
 * "Demo data" on the panel itself. The trust strip shows only counts read from
 * the live database, and hides itself if they cannot be read. There are no
 * invented candidates, employer logos, testimonials or outcome statistics.
 */

type Stats = { students: number; campuses: number; companies: number } | null

/** Demo candidate rows — labelled "Demo data" wherever they are rendered. */
const DEMO_CANDIDATES = [
  {
    initials: 'AS',
    name: 'Aarav S.',
    role: 'Backend Engineer',
    campus: 'BBD University · 2027',
    skills: ['Node', 'PostgreSQL', 'DSA'],
    score: 86,
    rank: '#3 of 214',
    status: 'Assessed',
    when: 'Sep 2026',
  },
  {
    initials: 'DM',
    name: 'Diya M.',
    role: 'Full-stack Developer',
    campus: 'HBTU Kanpur · 2026',
    skills: ['React', 'TypeScript'],
    score: 79,
    rank: '#12 of 214',
    status: 'Assessed',
    when: 'Sep 2026',
  },
  {
    initials: 'RK',
    name: 'Rohan K.',
    role: 'Backend Engineer',
    campus: 'NIT Patna · 2027',
    skills: ['Java', 'Spring'],
    score: 0,
    rank: '—',
    status: 'Awaiting assessment',
    when: 'Registered',
  },
]

/** Demo skill breakdown for the candidate-evidence panel. */
const DEMO_SKILLS = [
  { label: 'Correctness (tests passed)', value: '88%' },
  { label: 'Topic coverage', value: '76%' },
  { label: 'Code efficiency', value: '71%' },
  { label: 'Assessment consistency', value: '83%' },
]

const WORKFLOW = [
  {
    n: '1',
    title: 'Assessment',
    body: 'Candidates take a standardised, timed coding and technical assessment on the platform.',
  },
  {
    n: '2',
    title: 'Verification',
    body: 'Results are graded automatically, then corroborated with connected GitHub and LeetCode signals.',
  },
  {
    n: '3',
    title: 'Ranking',
    body: 'Each candidate is scored per problem and ranked against the cohort that took the same assessment.',
  },
  {
    n: '4',
    title: 'Shortlisting',
    body: 'You filter by role, skills, minimum score and assessment status — and shortlist in one click.',
  },
]

const METHODOLOGY = [
  {
    icon: 'target',
    title: 'Correctness first',
    body: 'Every problem is graded on the test cases it passes, so a score reflects code that runs — not how confident someone sounded in an interview.',
  },
  {
    icon: 'zap',
    title: 'Efficiency matters',
    body: 'Passing solutions are timed. Candidates who solve the same problem with a better approach score higher than a brute-force pass.',
  },
  {
    icon: 'layers',
    title: 'Topic breadth',
    body: 'Assessments span data structures and algorithms plus core CS fundamentals, so a single lucky question cannot carry a candidate.',
  },
  {
    icon: 'shield',
    title: 'Corroborated, not self-reported',
    body: 'Connected GitHub and LeetCode profiles add public evidence — commits, repositories and problems solved — beside the assessment result.',
  },
]

export default function HireLanding({ stats }: { stats?: Stats }) {
  const [form, setForm] = useState({
    company: '',
    contact_name: '',
    email: '',
    role_title: '',
    positions: '',
    notes: '',
    website: '', // honeypot — must stay empty
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  // Theme-synced logo (dark variant on dark backgrounds, light on light) —
  // same behaviour as the app shell (see components/LogoToggle.tsx).
  const [logoSrc, setLogoSrc] = useState('/connect-to-campus-logo-dark.png')

  useEffect(() => {
    const sync = () => setLogoSrc(getLogoSrc())
    sync()
    window.addEventListener('cc-theme-change', sync)
    return () => window.removeEventListener('cc-theme-change', sync)
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      const res = await fetch('/api/hire/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }
      setStatus('success')
    } catch {
      setError('Network error. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      {/* ── 1. Nav ── */}
      <nav className="hl-nav">
        <div className="hl-wrap hl-nav-inner">
          <div className="hl-nav-brand">
            <img
              src={logoSrc}
              alt="ConnectToCampus"
              width={30}
              height={30}
              style={{ borderRadius: 9, flexShrink: 0 }}
            />
            <BrandName />
          </div>
          <div className="hl-nav-links">
            <a className="hl-nav-link" href="#recruiters">
              For Recruiters
            </a>
            <Link className="hl-nav-link" href="/auth/signup">
              For Students
            </Link>
            <a className="hl-nav-link" href="#how">
              How It Works
            </a>
          </div>
          <div className="hl-nav-right">
            <Link className="hl-nav-signin" href="/auth/login">
              Sign in
            </Link>
            <a className="hl-btn hl-btn--primary hl-btn--sm" href="#demo">
              Request candidates
            </a>
          </div>
        </div>
      </nav>

      {/* ── 2. Hero ── */}
      <header className="hl-hero hl-wrap">
        <div className="hl-hero-grid">
          <div>
            <span className="hl-badge hl-rise">
              <span className="hl-badge-dot" />
              Assessment-verified hiring
            </span>
            <h1 className="hl-h1 hl-rise hl-rise-2">
              Hire freshers who have <em className="grad-brand">already proved their code.</em>
            </h1>
            <p className="hl-sub hl-rise hl-rise-3">
              We run standardised coding and technical assessments, then send you a shortlist of candidates whose{' '}
              <strong>skills, scores and projects are verified</strong> — not just self-reported on a résumé.
            </p>
            <div className="hl-cta-row hl-rise hl-rise-4">
              <a className="hl-btn hl-btn--primary hl-btn--lg" href="#demo">
                Request a shortlist
                <Icon name="chevron" size={17} className="hl-arrow" />
              </a>
              <a className="hl-btn hl-btn--ghost hl-btn--lg" href="#how">
                See how it works
              </a>
            </div>
            <p className="hl-micro hl-rise hl-rise-4">
              <Icon name="check" size={13} />
              First batch free · No retainer · Reply within 48 hours
            </p>
          </div>

          {/* Recruiter dashboard preview */}
          <div className="hl-preview hl-rise hl-rise-3">
            <div className="hl-panel">
              <div className="hl-panel-head">
                <div className="hl-panel-title">
                  <Icon name="layers" size={15} />
                  <span>Shortlist — Backend Engineer</span>
                </div>
                <span className="hl-demo">Demo data</span>
              </div>
              <div className="hl-panel-filters">
                <span className="hl-chip hl-chip--on">Backend Engineer</span>
                <span className="hl-chip">Score ≥ 70</span>
                <span className="hl-chip">Assessed</span>
                <span className="hl-chip">
                  <Icon name="check" size={10} /> GitHub linked
                </span>
              </div>
              <div className="hl-rows">
                {DEMO_CANDIDATES.map((c) => (
                  <div className="hl-row" key={c.name}>
                    <span className="hl-av">{c.initials}</span>
                    <div className="hl-row-main">
                      <p className="hl-row-name">{c.name}</p>
                      <div className="hl-row-meta">
                        <span>{c.role}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.campus}</span>
                      </div>
                    </div>
                    <div className="hl-score">
                      {c.score > 0 ? (
                        <>
                          <span className="hl-score-val">{c.score}</span>
                          <span className="hl-score-den"> /100</span>
                          <div className="hl-bar">
                            <div className="hl-bar-fill" style={{ width: `${c.score}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="hl-badge-status hl-badge-status--wait">{c.status}</span>
                      )}
                    </div>
                    {c.score > 0 && <span className="hl-badge-status">{c.rank}</span>}
                  </div>
                ))}
              </div>
              <p className="hl-demo-note">
                Illustrative interface preview — these are not real candidates. Your shortlist shows real profiles from
                the platform.
              </p>
            </div>
          </div>
        </div>

        {/* ── Genuine platform metrics (hidden if unavailable) ── */}
        {stats && (
          <div className="hl-metrics">
            <div>
              <p className="hl-metric-v">{stats.students.toLocaleString('en-IN')}</p>
              <p className="hl-metric-l">students on the platform</p>
            </div>
            <div>
              <p className="hl-metric-v">{stats.campuses.toLocaleString('en-IN')}</p>
              <p className="hl-metric-l">campuses represented</p>
            </div>
            <div>
              <p className="hl-metric-v">{stats.companies.toLocaleString('en-IN')}</p>
              <p className="hl-metric-l">companies hiring here</p>
            </div>
          </div>
        )}
      </header>

      {/* ── 3. Workflow ── */}
      <section id="how" className="hl-section hl-wrap">
        <p className="hl-eyebrow">How it works</p>
        <h2 className="hl-h2">From assessment to shortlist, in four steps.</h2>
        <p className="hl-lead">
          You never screen a stack of unqualified résumés. By the time a candidate reaches you, their ability has
          already been measured.
        </p>
        <div className="hl-flow">
          {WORKFLOW.map((s) => (
            <div className="hl-step" key={s.n}>
              <span className="hl-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Candidate discovery preview ── */}
      <section id="recruiters" className="hl-section hl-wrap">
        <p className="hl-eyebrow">Candidate discovery</p>
        <h2 className="hl-h2">Filter the pool. Shortlist on evidence.</h2>
        <p className="hl-lead hl-measure">
          Narrow candidates by role, verified skills, minimum assessment score and assessment status — then shortlist
          and move straight to interviews.
        </p>

        <div className="hl-panel">
          <div className="hl-panel-head">
            <div className="hl-panel-title">
              <Icon name="search" size={15} />
              <span>Candidate pool</span>
            </div>
            <span className="hl-demo">Demo data</span>
          </div>
          <div className="hl-panel-filters">
            <span className="hl-chip">Role: Backend Engineer</span>
            <span className="hl-chip">Skills: Node, PostgreSQL</span>
            <span className="hl-chip">Min score: 70</span>
            <span className="hl-chip hl-chip--on">Status: Assessed</span>
            <span className="hl-chip hl-chip--on">Verified only</span>
          </div>
          <div className="hl-rows">
            {DEMO_CANDIDATES.map((c) => (
              <div className="hl-row" key={c.name}>
                <span className="hl-av">{c.initials}</span>
                <div className="hl-row-main">
                  <p className="hl-row-name">{c.name}</p>
                  <div className="hl-row-meta">
                    {c.skills.map((s) => (
                      <span className="hl-chip" key={s}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="hl-score">
                  {c.score > 0 ? (
                    <>
                      <span className="hl-score-val">{c.score}</span>
                      <span className="hl-score-den"> /100</span>
                      <div className="hl-bar">
                        <div className="hl-bar-fill" style={{ width: `${c.score}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="hl-badge-status hl-badge-status--wait">{c.status}</span>
                  )}
                </div>
                <span className="hl-btn hl-btn--ghost hl-btn--sm">Shortlist</span>
              </div>
            ))}
          </div>
          <p className="hl-demo-note">
            Illustrative interface preview — these are not real candidates and no shortlist is created from this page.
          </p>
        </div>
      </section>

      {/* ── 5. Assessment methodology ── */}
      <section className="hl-section hl-wrap">
        <div className="hl-split">
          <div className="hl-split-copy">
            <p className="hl-eyebrow">Assessment methodology</p>
            <h2 className="hl-h2">What we actually measure.</h2>
            <p className="hl-lead hl-measure">
              No personality quizzes and no proxy signals. The assessment measures whether a candidate can write code
              that passes tests, and how well.
            </p>
            <ul className="hl-list">
              {METHODOLOGY.map((m) => (
                <li className="hl-li" key={m.title}>
                  <span className="hl-li-ic">
                    <Icon name={m.icon} size={16} />
                  </span>
                  <span>
                    <strong>{m.title}</strong>
                    <span>{m.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Skill-wise breakdown — sits inside the demo-labelled evidence panel */}
          <div className="hl-panel">
            <div className="hl-panel-head">
              <div className="hl-panel-title">
                <Icon name="target" size={15} />
                <span>Skill-wise breakdown</span>
              </div>
              <span className="hl-demo">Demo data</span>
            </div>
            <div style={{ padding: '18px' }}>
              <div className="hl-skills">
                {DEMO_SKILLS.map((s) => (
                  <div key={s.label}>
                    <div className="hl-skill-top">
                      <span>{s.label}</span>
                      <span>{s.value}</span>
                    </div>
                    <div className="hl-skill-bar">
                      <div className="hl-skill-fill" style={{ width: s.value }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="hl-demo-note" style={{ border: 'none', background: 'none', padding: '14px 0 0' }}>
                Illustrative breakdown of how a result is presented. Not a real candidate&rsquo;s scores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Candidate profile & project evidence ── */}
      <section className="hl-section hl-wrap">
        <div className="hl-split hl-split--reverse">
          <div className="hl-split-copy">
            <p className="hl-eyebrow">Candidate evidence</p>
            <h2 className="hl-h2">A profile backed by projects, not adjectives.</h2>
            <p className="hl-lead hl-measure">
              Every candidate profile carries the work behind the claims: linked repositories, connected developer
              profiles, preferred role, skills and — where the candidate supplies one — a résumé.
            </p>
            <ul className="hl-list">
              <li className="hl-li">
                <span className="hl-li-ic">
                  <Icon name="github" size={16} />
                </span>
                <span>
                  <strong>Connected GitHub &amp; LeetCode</strong>
                  <span>Public contributions, repositories and problems solved sit beside the assessment result.</span>
                </span>
              </li>
              <li className="hl-li">
                <span className="hl-li-ic">
                  <Icon name="code" size={16} />
                </span>
                <span>
                  <strong>Projects and repositories</strong>
                  <span>See what a candidate has actually built before you spend an interview slot on them.</span>
                </span>
              </li>
              <li className="hl-li">
                <span className="hl-li-ic">
                  <Icon name="briefcase" size={16} />
                </span>
                <span>
                  <strong>Preferred role</strong>
                  <span>Candidates state the role they are targeting, so you are not guessing at fit.</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="hl-panel">
            <div className="hl-panel-head">
              <div className="hl-panel-title">
                <Icon name="user" size={15} />
                <span>Candidate profile</span>
              </div>
              <span className="hl-demo">Demo data</span>
            </div>
            <div style={{ padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span className="hl-av" style={{ width: 44, height: 44, fontSize: 14 }}>
                  AS
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700 }}>Aarav S.</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Backend Engineer · BBD University · 2027
                  </p>
                </div>
                <span className="hl-badge-status" style={{ marginLeft: 'auto' }}>
                  Verified
                </span>
              </div>
              <div className="hl-panel-filters" style={{ border: 'none', padding: 0, marginBottom: 14 }}>
                {['Node', 'PostgreSQL', 'DSA', 'Docker'].map((s) => (
                  <span className="hl-chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>
              <div className="hl-skills">
                {DEMO_SKILLS.slice(0, 3).map((s) => (
                  <div key={s.label}>
                    <div className="hl-skill-top">
                      <span>{s.label}</span>
                      <span>{s.value}</span>
                    </div>
                    <div className="hl-skill-bar">
                      <div className="hl-skill-fill" style={{ width: s.value }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="hl-demo-note">
              Illustrative profile preview — not a real candidate. Real profiles show the candidate&rsquo;s own links.
            </p>
          </div>
        </div>
      </section>

      {/* ── 8. Final CTA + the lead form ── */}
      <section id="demo" className="hl-wrap">
        <div className="hl-cta">
          <div className="hl-split">
            <div className="hl-split-copy">
              <p className="hl-eyebrow">Request candidates</p>
              <h2 className="hl-h2" style={{ marginBottom: 12 }}>
                Tell us the role. We&rsquo;ll send the shortlist.
              </h2>
              <p className="hl-lead" style={{ marginBottom: 0 }}>
                Describe what you are hiring for and we prepare a matched batch of assessed candidates. Your first batch
                is free — pay only when you hire.
              </p>
              <p className="hl-micro" style={{ marginTop: 20 }}>
                <Icon name="check" size={13} />
                No retainer · No lock-in · Reply within 48 hours
              </p>
            </div>

            <div className="hl-card hl-rise">
              {status === 'success' ? (
                <div style={{ textAlign: 'center', padding: '18px 0' }}>
                  <span className="hl-li-ic" style={{ margin: '0 auto 14px', width: 44, height: 44 }}>
                    <Icon name="check" size={22} />
                  </span>
                  <h2 className="hl-form-title">You&rsquo;re on the list</h2>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.6 }}>
                    We&rsquo;ll email <strong>{form.email}</strong> a shortlist within 48 hours.
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                    First batch is free — pay only when you hire.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <h2 className="hl-form-title">Request your shortlist</h2>
                  <p className="hl-form-sub">Takes 30 seconds. We reply within 48 hours.</p>

                  <div className="hl-form-grid">
                    <div>
                      <label className="hl-label" htmlFor="company">
                        Company *
                      </label>
                      <input
                        id="company"
                        className="hl-input"
                        value={form.company}
                        onChange={set('company')}
                        required
                      />
                    </div>
                    <div className="hl-row-2">
                      <div>
                        <label className="hl-label" htmlFor="contact_name">
                          Your name *
                        </label>
                        <input
                          id="contact_name"
                          className="hl-input"
                          value={form.contact_name}
                          onChange={set('contact_name')}
                          required
                        />
                      </div>
                      <div>
                        <label className="hl-label" htmlFor="email">
                          Work email *
                        </label>
                        <input
                          id="email"
                          type="email"
                          className="hl-input"
                          value={form.email}
                          onChange={set('email')}
                          required
                        />
                      </div>
                    </div>
                    <div className="hl-row-3">
                      <div>
                        <label className="hl-label" htmlFor="role_title">
                          Role *
                        </label>
                        <input
                          id="role_title"
                          className="hl-input"
                          placeholder="e.g. Backend Engineer (Node)"
                          value={form.role_title}
                          onChange={set('role_title')}
                          required
                        />
                      </div>
                      <div>
                        <label className="hl-label" htmlFor="positions">
                          Openings
                        </label>
                        <input
                          id="positions"
                          type="number"
                          min={1}
                          className="hl-input"
                          value={form.positions}
                          onChange={set('positions')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="hl-label" htmlFor="notes">
                        Anything else?
                      </label>
                      <textarea
                        id="notes"
                        rows={3}
                        className="hl-input"
                        placeholder="Tech stack, minimum score, location…"
                        value={form.notes}
                        onChange={set('notes')}
                      />
                    </div>

                    {/* Honeypot — hidden from humans, catches bots */}
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      value={form.website}
                      onChange={set('website')}
                      style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
                    />

                    {status === 'error' && <p className="hl-err">{error}</p>}

                    <button type="submit" disabled={status === 'submitting'} className="hl-btn hl-btn--primary">
                      {status === 'submitting' ? 'Sending…' : 'Request my shortlist'}
                    </button>
                    <p className="hl-note">No retainer. No lock-in. Pay only when you hire.</p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="hl-footer hl-wrap">
        <div className="hl-footer-inner">
          <span>
            <BrandName /> · Assessment-verified campus hiring
          </span>
          <span className="hl-footer-links">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/refund">Refunds</Link>
          </span>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="hl-mobilecta">
        <div className="hl-mobilecta-text">
          <strong>First batch free</strong>
          Assessed, verified candidates
        </div>
        <a className="hl-btn hl-btn--primary" href="#demo">
          Request
        </a>
      </div>
    </div>
  )
}
