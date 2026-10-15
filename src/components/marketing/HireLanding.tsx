'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandName from '@/components/BrandName'
import ThemeToggle from '@/components/ThemeToggle'
import { getLogoSrc } from '@/components/LogoToggle'
import { Icon } from '@/components/icons'

/**
 * HireLanding — the public landing (V6).
 *
 * Visual language is a deliberate port of leetquery.com: warm off-white canvas,
 * a single blue brand accent, a display grotesque for the promise and a serif
 * italic for the one accent phrase. Information architecture is unchanged:
 *   1. Nav (product links + theme + login + Get Started)
 *   2. Hero: display headline, pillars, primary CTA, orbit stage
 *   3. Companies hiring here — GENUINE rows from public.companies
 *   4. Trust metrics — GENUINE counts only, passed in from the server
 *   5. Workflow: Assessment → Verification → Ranking → Shortlisting
 *   6. Candidate discovery preview (filters + ranked table)
 *   7. Assessment methodology
 *   8. Candidate profile & project evidence
 *   9. Final CTA (the lead form) + footer
 *
 * ── Honesty rules (enforced, not aspirational) ──────────────────────────────
 * Everything that looks like real product data is a UI preview and is labelled
 * "Demo data" on the panel itself (or captioned directly under it). The
 * company strip and the metrics strip show only rows read from the live
 * database, and hide themselves when they cannot be read. There are no
 * invented candidates, employer logos, testimonials or outcome statistics.
 */

type Stats = { students: number; campuses: number; companies: number } | null
type Company = { name: string; slug: string; logo_url: string | null }

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
  {
    initials: 'SN',
    name: 'Sneha N.',
    role: 'Data Analyst',
    campus: 'PW IOI · 2026',
    skills: ['Python', 'SQL'],
    score: 74,
    rank: '#21 of 214',
    status: 'Assessed',
    when: 'Aug 2026',
  },
]

/**
 * The chips that circle the hero preview.
 *
 * Honesty: the candidate chips are the SAME demo candidates the panel renders
 * (that panel carries its own "Demo data" label), plus the signals that qualify
 * them. The orbit invents no new names, employers or outcomes.
 *
 * Geometry lives in CSS: slots 1/3/5/7 ride the inner ring (the candidate
 * chips), slots 2/4/6/8 the outer ring (the compact signal tiles).
 */
type OrbitChip =
  | { slot: number; kind: 'candidate'; initials: string; name: string; meta: string; value: string }
  | { slot: number; kind: 'tile'; icon: string }

const ORBIT: OrbitChip[] = [
  { slot: 1, kind: 'candidate', initials: 'AS', name: 'Aarav S.', meta: 'Assessed', value: '86/100' },
  { slot: 3, kind: 'candidate', initials: 'DM', name: 'Diya M.', meta: 'Assessed', value: '79/100' },
  { slot: 5, kind: 'candidate', initials: 'SN', name: 'Sneha N.', meta: 'Assessed', value: '74/100' },
  { slot: 7, kind: 'candidate', initials: 'RK', name: 'Rohan K.', meta: 'Registered', value: 'Sep 2026' },
  { slot: 2, kind: 'tile', icon: 'github' },
  { slot: 4, kind: 'tile', icon: 'code' },
  { slot: 6, kind: 'tile', icon: 'trophy' },
  { slot: 8, kind: 'tile', icon: 'shield' },
]

/** The three pillars, summarised the way the reference does. */
const PILLARS = [
  { icon: 'book', label: 'Learn' },
  { icon: 'zap', label: 'Compete' },
  { icon: 'briefcase', label: 'Get Hired' },
]

/**
 * Landing nav — the six destinations the front door offers. Five are product
 * surfaces a student can open right away; the last one jumps to the recruiter
 * block on this page (the only recruiter entry point that exists).
 */
const NAV = [
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Jobs', href: '/jobs', icon: 'briefcase' },
  { label: 'Companies', href: '/companies', icon: 'building' },
  { label: 'Experiences', href: '/experiences', icon: 'pencil' },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'trophy' },
  { label: 'For Recruiters', href: '#recruiters', icon: 'users' },
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

export default function HireLanding({ stats, companies }: { stats?: Stats; companies?: Company[] }) {
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
  const [menuOpen, setMenuOpen] = useState(false)
  // Theme-synced logo (dark variant on dark backgrounds, light on light) —
  // same behaviour as the app shell (see components/LogoToggle.tsx).
  const [logoSrc, setLogoSrc] = useState('/connect-to-campus-logo-dark.png')

  useEffect(() => {
    const sync = () => setLogoSrc(getLogoSrc())
    sync()
    window.addEventListener('cc-theme-change', sync)
    return () => window.removeEventListener('cc-theme-change', sync)
  }, [])

  // The mobile sheet is a modal-ish surface: Escape closes it, and the page
  // behind it must not scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

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

  const strip = (companies ?? []).filter((c) => c?.name).slice(0, 12)

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      {/* ── 1. Nav ── */}
      <header className="hl-nav">
        <div className="hl-wrap hl-nav-inner">
          <Link className="hl-brand" href="/" aria-label="ConnectToCampus home">
            <img className="hl-brand-logo" src={logoSrc} alt="" width={30} height={30} />
            <BrandName className="hl-brand-name" />
          </Link>

          <nav className="hl-nav-links" aria-label="Primary">
            {NAV.map((item) => (
              <Link className="hl-nav-link" href={item.href} key={item.href}>
                <Icon name={item.icon} size={18} className="hl-nav-ic" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hl-nav-right">
            <ThemeToggle mode="plain" />
            <Link className="hl-nav-signin" href="/auth/login">
              Login
            </Link>
            <Link className="hl-btn hl-btn--brand hl-btn--sm" href="/auth/signup">
              Get Started
            </Link>
            <button
              type="button"
              className="hl-nav-burger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="hl-nav-sheet"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="hl-nav-sheet" id="hl-nav-sheet">
            <div className="hl-wrap">
              {NAV.map((item) => (
                <Link className="hl-nav-sheet-link" href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
              <div className="hl-nav-sheet-cta">
                <Link className="hl-btn hl-btn--ghost" href="/auth/login" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link className="hl-btn hl-btn--brand" href="/auth/signup" onClick={() => setMenuOpen(false)}>
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── 2. Hero ── */}
      <section className="hl-hero hl-wrap">
        <div className="hl-hero-grid">
          <div className="hl-hero-copy">
            <h1 className="hl-h1 hl-rise hl-rise-1">
              Become the
              <br />
              <span className="hl-h1-accent">Top 1% Engineer.</span>
            </h1>
            <p className="hl-sub hl-rise hl-rise-2">
              <strong>ConnectToCampus has everything it takes to get hired.</strong> Notes, PYQs and DSA contests,
              hackathons and internships, plus verified assessments recruiters actually read.
            </p>
            <div className="hl-pill-row hl-rise hl-rise-3">
              {PILLARS.map((p) => (
                <span className="hl-pill" key={p.label}>
                  <span className="hl-pill-ic">
                    <Icon name={p.icon} size={18} />
                  </span>
                  {p.label}
                </span>
              ))}
            </div>
            <div className="hl-cta-row hl-rise hl-rise-4">
              <Link className="hl-btn hl-btn--brand hl-btn--lg hl-btn--shine" href="/auth/signup">
                Start free
                <Icon name="chevron" size={17} className="hl-arrow" />
              </Link>
            </div>
            <p className="hl-micro hl-rise hl-rise-4">
              <Icon name="check" size={13} />
              Free for every Indian CS student · No credit card
            </p>
          </div>

          {/* Recruiter shortlist preview — the app window sits at the centre of
              the orbit; the cohort and its signals ride the dashed rings. */}
          <div className="hl-stage hl-rise hl-rise-3">
            <div className="hl-orbit" aria-hidden="true">
              <div className="hl-orbit-scale">
                <span className="hl-orbit-ringline hl-orbit-ringline--inner" />
                <span className="hl-orbit-ringline" />
                <div className="hl-orbit-ring">
                  {ORBIT.map((o) => (
                    <span className={`hl-orbit-slot hl-orbit-slot--${o.slot}`} key={o.slot}>
                      <span className="hl-orbit-ccw">
                        <span className="hl-orbit-up">
                          {o.kind === 'candidate' ? (
                            <span className="hl-chip-card">
                              <span className="hl-chip-card-av">
                                {o.initials}
                                <span className="hl-chip-card-dot" />
                              </span>
                              <span className="hl-chip-card-tx">
                                <span className="hl-chip-card-name">{o.name}</span>
                                <span className="hl-chip-card-meta">
                                  <span className="hl-chip-card-label">{o.meta}</span>
                                  <span className="hl-chip-card-value">{o.value}</span>
                                </span>
                              </span>
                            </span>
                          ) : (
                            <span className="hl-orbit-tile">
                              <Icon name={o.icon} size={22} />
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="hl-window">
              <div className="hl-window-bar">
                <span className="hl-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="hl-window-pill">shortlist.json</span>
                <span className="hl-window-status">
                  <i className="hl-live-dot" />
                  Demo data
                </span>
              </div>
              <div className="hl-window-body">
                <div className="hl-panel-title">
                  <Icon name="layers" size={15} />
                  <span>Shortlist — Backend Engineer</span>
                </div>
                <div className="hl-panel-filters">
                  <span className="hl-chip hl-chip--on">Backend Engineer</span>
                  <span className="hl-chip">Score ≥ 70</span>
                  <span className="hl-chip">Assessed</span>
                </div>
                <div className="hl-rows hl-rows--tight">
                  {DEMO_CANDIDATES.slice(0, 3).map((c) => (
                    <div className="hl-row" key={c.name}>
                      <span className="hl-av">{c.initials}</span>
                      <div className="hl-row-main">
                        <p className="hl-row-name">{c.name}</p>
                        <div className="hl-row-meta">
                          <span>{c.role}</span>
                        </div>
                      </div>
                      <div className="hl-score">
                        {c.score > 0 ? (
                          <>
                            <span className="hl-score-val">{c.score}</span>
                            <span className="hl-score-den">/100</span>
                          </>
                        ) : (
                          <span className="hl-badge-status hl-badge-status--wait">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* The demo label lives INSIDE the window: it stays attached to
                  the preview, and it sits clear of the rings that sweep the
                  stage around it. */}
              <p className="hl-demo-note">
                Illustrative interface preview — these are not real candidates. Your shortlist shows real profiles from
                the platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Companies hiring here — GENUINE rows, hidden when unavailable ── */}
      {strip.length > 0 && (
        <section className="hl-strip">
          <div className="hl-wrap">
            <p className="hl-strip-eyebrow">Companies hiring here</p>
            <div className="hl-strip-row">
              {strip.map((c) => (
                <Link className="hl-strip-item" href={`/companies/${c.slug}`} key={c.slug} title={c.name}>
                  {c.logo_url ? (
                    <img className="hl-strip-logo" src={c.logo_url} alt={c.name} />
                  ) : (
                    <span className="hl-strip-word">{c.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Genuine platform metrics (hidden if unavailable) ── */}
      {stats && (
        <section className="hl-metrics-band">
          <div className="hl-wrap hl-metrics">
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
        </section>
      )}

      {/* ── 5. Workflow ── */}
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

      {/* ── 6. Candidate discovery preview ── */}
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

      {/* ── 7. Assessment methodology ── */}
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
                    <Icon name={m.icon} size={17} />
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
            <div className="hl-panel-pad">
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
              <p className="hl-demo-note hl-demo-note--bare">
                Illustrative breakdown of how a result is presented. Not a real candidate&rsquo;s scores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Candidate profile & project evidence ── */}
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
                  <Icon name="github" size={17} />
                </span>
                <span>
                  <strong>Connected GitHub &amp; LeetCode</strong>
                  <span>Public contributions, repositories and problems solved sit beside the assessment result.</span>
                </span>
              </li>
              <li className="hl-li">
                <span className="hl-li-ic">
                  <Icon name="code" size={17} />
                </span>
                <span>
                  <strong>Projects and repositories</strong>
                  <span>See what a candidate has actually built before you spend an interview slot on them.</span>
                </span>
              </li>
              <li className="hl-li">
                <span className="hl-li-ic">
                  <Icon name="briefcase" size={17} />
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
            <div className="hl-panel-pad">
              <div className="hl-profile">
                <span className="hl-av hl-av--lg">AS</span>
                <div className="hl-profile-tx">
                  <p className="hl-profile-name">Aarav S.</p>
                  <p className="hl-profile-meta">Backend Engineer · BBD University · 2027</p>
                </div>
                <span className="hl-badge-status">Verified</span>
              </div>
              <div className="hl-panel-filters hl-panel-filters--bare">
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

      {/* ── 9. Final CTA + the lead form ── */}
      <section id="demo" className="hl-wrap hl-section">
        <div className="hl-cta">
          <div className="hl-split">
            <div className="hl-split-copy">
              <p className="hl-eyebrow">Request candidates</p>
              <h2 className="hl-h2 hl-h2--tight">Tell us the role. We&rsquo;ll send the shortlist.</h2>
              <p className="hl-lead hl-lead--flush">
                Describe what you are hiring for and we prepare a matched batch of assessed candidates. Your first batch
                is free — pay only when you hire.
              </p>
              <p className="hl-micro hl-micro--spaced">
                <Icon name="check" size={13} />
                No retainer · No lock-in · Reply within 48 hours
              </p>
            </div>

            <div className="hl-card hl-rise">
              {status === 'success' ? (
                <div className="hl-success">
                  <span className="hl-li-ic hl-li-ic--lg">
                    <Icon name="check" size={22} />
                  </span>
                  <h2 className="hl-form-title">You&rsquo;re on the list</h2>
                  <p className="hl-success-line">
                    We&rsquo;ll email <strong>{form.email}</strong> a shortlist within 48 hours.
                  </p>
                  <p className="hl-success-sub">First batch is free — pay only when you hire.</p>
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
                      className="hl-honeypot"
                    />

                    {status === 'error' && <p className="hl-err">{error}</p>}

                    <button type="submit" disabled={status === 'submitting'} className="hl-btn hl-btn--brand">
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
            <BrandName /> · India&rsquo;s campus community for CS students
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

      {/* Floating feedback pill — the page's own contact form is the channel. */}
      <a className="hl-feedback" href="#demo">
        <span className="hl-feedback-ic">
          <Icon name="message" size={14} />
        </span>
        Feedback
      </a>

      {/* Sticky mobile CTA */}
      <div className="hl-mobilecta">
        <div className="hl-mobilecta-text">
          <strong>Free to start</strong>
          Contests, jobs &amp; internships
        </div>
        <Link className="hl-btn hl-btn--brand" href="/auth/signup">
          Get Started
        </Link>
      </div>
    </div>
  )
}
