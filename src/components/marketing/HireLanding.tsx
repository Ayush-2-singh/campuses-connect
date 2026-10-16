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
type Problem = { title: string; slug: string; difficulty: string | null; topics: string[] | null }
type Win = {
  id: string
  title: string
  role: string | null
  result: string | null
  difficulty: string | null
  upvotes: number | null
  excerpt: string
  company: string
  initials: string
}

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
 * The three-step path card on phones (hidden on wider screens, where the hero
 * shows the product preview instead). Mirrors the reference's mobile hero.
 */
const PATH = [
  { n: '1', icon: 'zap', label: 'Compete', sub: 'Timed DSA contests' },
  { n: '2', icon: 'briefcase', label: 'Get hired', sub: 'Jobs & internships' },
  { n: '3', icon: 'pencil', label: 'Go prepared', sub: 'Interview experiences' },
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

/**
 * Illustrative board rows for the Career block's preview. These are NOT real
 * listings (public.job_postings is empty today), and the panel says so on its
 * own footer. Once real posts exist they can replace this constant directly.
 */
const DEMO_OPENINGS = [
  { company: 'Razorpay', role: 'SDE Intern — Backend', location: 'Bangalore', type: 'Internship' },
  { company: 'Zerodha', role: 'Frontend Engineer', location: 'Bangalore', type: 'Full-time' },
  { company: 'Swiggy', role: 'Data Analyst', location: 'Hyderabad', type: 'Full-time' },
  { company: 'Flipkart', role: 'SDE I — Platform', location: 'Remote', type: 'Full-time' },
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

/**
 * Bento band — four product surfaces in the reference's pastel grid (wide /
 * narrow, then narrow / wide). Every tile describes shipped behaviour on a
 * route the nav or footer already links to; nothing here is aspirational.
 */
const BENTO = [
  {
    title: 'Compete',
    href: '/compete',
    icon: 'zap',
    tone: 'peach',
    span: 'wide',
    body: 'Timed contests on real interview problems, graded on the test cases they pass, ranked against the cohort that sat the same paper.',
  },
  {
    title: 'Jobs & internships',
    href: '/jobs',
    icon: 'briefcase',
    tone: 'mint',
    span: 'narrow',
    body: 'One board for internships, hackathons and full-time roles — deadline and stipend up front.',
  },
  {
    title: 'Interview experiences',
    href: '/experiences',
    icon: 'pencil',
    tone: 'blue',
    span: 'narrow',
    body: 'Every round of an interview, as it actually happened.',
  },
  {
    title: 'AI Coach',
    href: '/brain',
    icon: 'sparkles',
    tone: 'lilac',
    span: 'wide',
    body: 'Ask about the problem in front of you and get the approach, the pitfalls and the follow-up questions a mentor would raise — on the platform, next to your own submissions.',
  },
] as const

/**
 * The roadmap band, module by module. Each module carries only what the site
 * can stand behind: the module count and the concept chips are read from real
 * rows (active problems, their topics, active companies), and the one module
 * with no content yet is marked locked and says so.
 */
const MODULE_COPY = [
  {
    n: '1',
    title: 'Compete',
    href: '/compete',
    icon: 'zap',
    tag: '# Query like a pro',
    body: 'Timed contests on real interview problems, with hints removed and a clock running. Every attempt is graded on the test cases it passes.',
    why: 'Practice that ends in a score you can show a recruiter beats another untracked problem list.',
    cta: 'Enter Compete',
  },
  {
    n: '2',
    title: 'Jobs & internships',
    href: '/jobs',
    icon: 'briefcase',
    tag: '# Apply before the deadline',
    body: 'Internships, hackathons and full-time roles from companies active on the platform — deadline, location and stipend stated on the post.',
    why: 'One verified board beats four group chats and a spreadsheet nobody updates.',
    cta: 'Enter the job board',
  },
  {
    n: '3',
    title: 'Interview experiences',
    href: '/experiences',
    icon: 'pencil',
    tag: '# Round by round',
    body: 'Write-ups members post after a real drive: every round, the role, and how it ended.',
    why: 'You cannot prepare for a round nobody has described yet. Nothing is shown here until members post real write-ups.',
    cta: 'Write-ups land here',
  },
] as const

/**
 * Reading band. Articles come from real rows when they exist; until then the
 * band says so, in the open, instead of inventing sources.
 */
const READING_PREVIEW = [
  {
    tag: 'Interview experiences',
    title: 'An interview write-up will live here',
    body: 'Round by round, from someone who sat the drive.',
    source: 'From members',
  },
  {
    tag: 'Notes & resources',
    title: 'A shared note will live here',
    body: 'Semester notes, PYQs and lab files students upload.',
    source: 'From campuses',
  },
  {
    tag: 'Guides',
    title: 'A guide will live here',
    body: 'How a contest is scored and what the shortlist sees.',
    source: 'From ConnectToCampus',
  },
]

type Reading = { tag: string; title: string; body: string; source: string }

/** Footer columns — every entry is a route that exists in the app. */
const FOOTER = [
  {
    title: 'Platform',
    links: [
      { label: 'Compete', href: '/compete' },
      { label: 'Jobs', href: '/jobs' },
      { label: 'Companies', href: '/companies' },
      { label: 'Interview experiences', href: '/experiences' },
      { label: 'Leaderboard', href: '/leaderboard' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'AI Coach', href: '/brain' },
      { label: 'Blog', href: '/blog' },
      { label: 'Find talent', href: '/talent' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'All features', href: '/more' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Premium', href: '/premium' },
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Reminders', href: '/reminders' },
    ],
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

export default function HireLanding({
  stats,
  companies,
  problems,
  wins,
  reading,
}: {
  stats?: Stats
  companies?: Company[]
  problems?: Problem[]
  wins?: Win[]
  reading?: Reading[]
}) {
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
  // Topics are read off the problems that actually exist on the platform.
  const topics = Array.from(new Set((problems ?? []).flatMap((p) => p.topics ?? []))).slice(0, 8)
  const winList = (wins ?? []).filter((w) => w?.title && w?.excerpt)
  const problemList = (problems ?? []).filter((p) => p?.title && p?.slug)
  // Roadmap numbers. Nothing invented: the problem count and the concept chips
  // are the active problems (and their topics) themselves, the company count is
  // the live companies table, and the write-up count is the interview rows —
  // which is why that module renders locked while it is zero.
  const problemCount = problems?.length ?? 0
  const companyCount = stats?.companies ?? companies?.length ?? 0
  const campusCount = stats?.campuses ?? 0
  const writingCount = winList.length
  const readingList = (reading ?? []).filter((r) => r?.title && r?.body)
  // The rail scrolls right to left on a loop, so the track holds the card list
  // TWICE: the second pass is what the loop slides into, and it is hidden from
  // assistive tech (and from the keyboard) because it repeats the first.
  const readingCards = (readingList.length > 0 ? readingList : READING_PREVIEW).slice(0, 6)
  const railCards = [...readingCards, ...readingCards]

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

            {/* Phones get the three-step path card in place of the desktop
                preview: same information, sized for a thumb. */}
            <div className="hl-path">
              <p className="hl-path-eyebrow">Your path, not another playlist</p>
              <div className="hl-path-track">
                {PATH.map((p) => (
                  <div className="hl-path-step" key={p.n}>
                    <span className="hl-path-n">{p.n}</span>
                    <span className="hl-path-ic">
                      <Icon name={p.icon} size={17} />
                    </span>
                    <strong>{p.label}</strong>
                    <span className="hl-path-sub">{p.sub}</span>
                  </div>
                ))}
              </div>
              <div className="hl-path-proof">
                <span className="hl-path-proof-ic">
                  <Icon name="shield" size={16} />
                </span>
                <span className="hl-path-proof-tx">
                  <strong>Interview-ready proof</strong>
                  <span>Scores, ranks and a profile recruiters can open</span>
                </span>
                <span className="hl-path-goal">Goal</span>
              </div>
              <Link className="hl-btn hl-btn--brand hl-btn--lg hl-path-cta" href="/compete">
                Explore Compete
                <Icon name="chevron" size={17} className="hl-arrow" />
              </Link>
            </div>
          </div>

          {/* Recruiter shortlist preview — the app window sits at the centre of
              the orbit. The dashed rings ride BEHIND it and the cohort in front,
              the way the reference layers them, so a chip drifts across the
              preview while the dashes vanish behind its edge. */}
          <div className="hl-stage hl-rise hl-rise-3">
            <div className="hl-orbit hl-orbit--rings" aria-hidden="true">
              <div className="hl-orbit-scale">
                <span className="hl-orbit-ringline hl-orbit-ringline--inner" />
                <span className="hl-orbit-ringline" />
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

            {/* Front layer: the chips and signal tiles, painted over the preview. */}
            <div className="hl-orbit hl-orbit--chips" aria-hidden="true">
              <div className="hl-orbit-scale">
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
                              <Icon name={o.icon} size={30} />
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
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

      {/* ── Feature: Compete — REAL problems from public.dsa_problems ── */}
      <section className="hl-section hl-wrap">
        <div className="hl-feature">
          <div className="hl-feature-copy">
            <div className="hl-feature-head">
              <span className="hl-feature-ic">
                <Icon name="zap" size={18} />
              </span>
              <h2 className="hl-feature-title">Compete</h2>
            </div>
            <p className="hl-eyebrow">Real coding assessments</p>
            <h3 className="hl-h2 hl-h2--lead">
              Drill the problems <em className="hl-em">that get asked.</em>
            </h3>
            <p className="hl-lead hl-measure">
              <strong>Timed assessments on real interview problems.</strong> Solve them in the browser in C++, Java,
              Python or JavaScript, and get a verdict on your code instead of your confidence.
            </p>
            {topics.length > 0 && (
              <>
                <p className="hl-chip-label">Topics on the platform</p>
                <div className="hl-chip-row">
                  {topics.map((t) => (
                    <span className="hl-chip" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="hl-cta-row hl-cta-row--stacked">
              <Link className="hl-btn hl-btn--brand hl-btn--lg" href="/compete">
                Start practising
                <Icon name="chevron" size={17} className="hl-arrow" />
              </Link>
            </div>
          </div>

          <div className="hl-feature-art">
            <div className="hl-window">
              <div className="hl-window-bar">
                <span className="hl-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="hl-window-pill">problems.json</span>
                <span className="hl-window-status">
                  <i className="hl-live-dot" />
                  Live
                </span>
              </div>
              <div className="hl-window-body">
                {problemList.length > 0 ? (
                  <div className="hl-list-rows">
                    {problemList.map((p) => (
                      <div className="hl-list-row" key={p.slug}>
                        <span className="hl-list-main">
                          <span className="hl-list-title">{p.title}</span>
                          <span className="hl-list-sub">{(p.topics ?? []).join(' · ')}</span>
                        </span>
                        <span className={`hl-tag hl-tag--${p.difficulty ?? 'easy'}`}>{p.difficulty}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hl-empty">No problems published yet.</p>
                )}
                <Link className="hl-btn hl-btn--brand hl-btn--block" href="/compete">
                  Try a problem
                  <Icon name="chevron" size={16} className="hl-arrow" />
                </Link>
              </div>
              <p className="hl-demo-note">
                These five are the problems currently published on the platform. Open Compete for the full set.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature: the hiring loop ── */}
      <section className="hl-section hl-wrap">
        <div className="hl-feature hl-feature--reverse">
          <div className="hl-feature-copy">
            <div className="hl-feature-head">
              <span className="hl-feature-ic">
                <Icon name="briefcase" size={18} />
              </span>
              <h2 className="hl-feature-title">Career</h2>
            </div>
            <p className="hl-eyebrow">Jobs &amp; internships</p>
            <h3 className="hl-h2 hl-h2--lead">
              Apply where <em className="hl-em">it actually matters.</em>
            </h3>
            <p className="hl-lead hl-measure">
              <strong>One board for internships, hackathons and full-time roles.</strong> Every post carries its
              deadline, location and pay up front, so you spend your time applying — not digging.
            </p>
            {strip.length > 0 && (
              <>
                <p className="hl-chip-label">Companies hiring here</p>
                <div className="hl-chip-row">
                  {strip.slice(0, 6).map((c) => (
                    <span className="hl-chip" key={c.slug}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="hl-cta-row hl-cta-row--stacked">
              <Link className="hl-btn hl-btn--brand hl-btn--lg" href="/jobs">
                Browse openings
                <Icon name="chevron" size={17} className="hl-arrow" />
              </Link>
            </div>
          </div>

          <div className="hl-feature-art">
            <div className="hl-window">
              <div className="hl-window-bar">
                <span className="hl-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="hl-window-pill">openings.json</span>
                <span className="hl-window-status">
                  <i className="hl-live-dot" />
                  Demo data
                </span>
              </div>
              <div className="hl-window-body">
                <div className="hl-list-rows">
                  {DEMO_OPENINGS.map((o) => (
                    <div className="hl-list-row" key={o.role}>
                      <span className="hl-list-mark">{o.company.slice(0, 2).toUpperCase()}</span>
                      <span className="hl-list-main">
                        <span className="hl-list-title">{o.role}</span>
                        <span className="hl-list-sub">
                          {o.company} · {o.location}
                        </span>
                      </span>
                      <span className="hl-tag hl-tag--type">{o.type}</span>
                    </div>
                  ))}
                </div>
                <Link className="hl-btn hl-btn--brand hl-btn--block" href="/jobs">
                  See all openings
                  <Icon name="chevron" size={16} className="hl-arrow" />
                </Link>
              </div>
              <p className="hl-demo-note">
                Illustrative board preview — these are not live listings. Open Jobs to see what is posted right now.
              </p>
            </div>
          </div>
        </div>
      </section>

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

      {/* ── Members' wins — REAL interview write-ups, hidden until there are any.
             Nothing is invented here: no quotes, no employers, no outcomes. ── */}
      {winList.length > 0 && (
        <section className="hl-band hl-band--wins">
          <div className="hl-wrap">
            <p className="hl-band-eyebrow">The wall of wins</p>
            <h2 className="hl-band-title">
              They interviewed there. <em className="hl-em">Now you know how it went.</em>
            </h2>
            <p className="hl-band-sub">Write-ups pinned by members who sat the round.</p>
            <div className="hl-wins">
              {winList.map((w) => (
                <article className="hl-win" key={w.id}>
                  <div className="hl-win-photo">
                    <span className="hl-win-av">{w.initials}</span>
                    <span className="hl-win-badge">{w.company}</span>
                  </div>
                  <p className="hl-win-quote">&ldquo;{w.excerpt}&hellip;&rdquo;</p>
                  <p className="hl-win-name">{w.title}</p>
                  <p className="hl-win-role">{[w.role, w.result].filter(Boolean).join(' · ')}</p>
                </article>
              ))}
            </div>
            <div className="hl-band-cta">
              <Link className="hl-btn hl-btn--brand hl-btn--lg" href="/experiences">
                Read every experience
                <Icon name="chevron" size={17} className="hl-arrow" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── One platform — the reference's pastel bento grid ── */}
      <section className="hl-band hl-band--platform">
        <div className="hl-wrap">
          <h2 className="hl-band-title hl-band-title--center">
            One platform for the <em className="hl-em">entire placement season.</em>
          </h2>
          <p className="hl-band-sub hl-band-sub--center">
            From your first contest to the offer letter, everything you need lives in one place.
          </p>
          <div className="hl-bento">
            {BENTO.map((t) => (
              <Link className={`hl-tile hl-tile--${t.tone} hl-tile--${t.span}`} href={t.href} key={t.title}>
                <span className="hl-tile-art" aria-hidden="true" />
                <Icon name={t.icon} size={150} className="hl-tile-gl" />
                <span className="hl-tile-ic">
                  <Icon name={t.icon} size={19} />
                </span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                <span className="hl-tile-go">
                  Explore
                  <Icon name="chevron" size={15} className="hl-arrow" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roadmap — numbered modules, live counts, one honest lock ── */}
      <section className="hl-band hl-band--roadmap">
        <div className="hl-wrap">
          <p className="hl-eyebrow hl-eyebrow--center">The path</p>
          <h2 className="hl-band-title hl-band-title--center">
            One path, module by <em className="hl-em">module.</em>
          </h2>
          <p className="hl-band-sub hl-band-sub--center">
            Each module is a surface you can open today. The counts under them are read live from the platform.
          </p>

          <div className="hl-mods">
            {MODULE_COPY.map((m, i) => {
              const locked = m.n === '3'
              const chips =
                i === 0
                  ? topics
                  : i === 1
                    ? (companies ?? [])
                        .map((c) => c?.name)
                        .filter((n): n is string => Boolean(n))
                        .slice(0, 6)
                    : []
              const statLabel = i === 0 ? 'Problems' : i === 1 ? 'Companies' : 'Write-ups'
              const statValue = i === 0 ? problemCount : i === 1 ? companyCount : writingCount
              const covLabel = i === 0 ? 'Concepts' : i === 1 ? 'Campuses' : 'Status'
              const covValue = i === 0 ? topics.length : i === 1 ? campusCount : 'Locked'
              return (
                <article className={`hl-mod${locked ? ' hl-mod--locked' : ''}`} key={m.n}>
                  <span className="hl-mod-n" aria-hidden="true">
                    {m.n}
                  </span>
                  <div className="hl-mod-card">
                    <div className="hl-mod-top">
                      <span className="hl-mod-ic">
                        <Icon name={m.icon} size={20} />
                      </span>
                      <h3>{m.title}</h3>
                      {locked && (
                        <span className="hl-mod-soon">
                          <Icon name="lock" size={13} />
                          Coming soon
                        </span>
                      )}
                    </div>
                    <span className="hl-mod-tag">{m.tag}</span>
                    <p className="hl-mod-body">{m.body}</p>
                    <div className="hl-mod-why">
                      <p className="hl-mod-why-t">The &ldquo;why&rdquo;</p>
                      <p>{m.why}</p>
                    </div>
                    <div className="hl-mod-stats">
                      <div className="hl-mod-stat">
                        <p className="hl-mod-stat-l">{statLabel}</p>
                        <p className="hl-mod-stat-v">{statValue}</p>
                        <span className="hl-mod-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <div className="hl-mod-stat hl-mod-stat--cov">
                        <p className="hl-mod-stat-l">{covLabel}</p>
                        <p className="hl-mod-cov">{covValue}</p>
                        <span className="hl-mod-checks" aria-hidden="true">
                          <i>✓</i>
                          <i>✓</i>
                          <i>✓</i>
                        </span>
                      </div>
                    </div>
                    {chips.length > 0 && (
                      <>
                        <p className="hl-mod-chip-l">
                          <Icon name="layers" size={14} />
                          {i === 0 ? 'Concepts covered' : 'Hiring on ConnectToCampus'}
                        </p>
                        <div className="hl-mod-chips">
                          {chips.map((c) => (
                            <span key={c}>{c}</span>
                          ))}
                        </div>
                      </>
                    )}
                    <Link className={`hl-mod-cta${locked ? ' hl-mod-cta--locked' : ''}`} href={m.href}>
                      {locked && <Icon name="lock" size={15} />}
                      {m.cta}
                      {!locked && <Icon name="chevron" size={15} className="hl-arrow" />}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Recommended reading — real rows when they exist, labelled otherwise ── */}
      <section className="hl-band hl-band--reading">
        <div className="hl-wrap">
          <p className="hl-eyebrow hl-eyebrow--center">{readingList.length > 0 ? 'Recommended reading' : 'Preview'}</p>
          <h2 className="hl-band-title hl-band-title--center">
            Worth <em className="hl-em">reading</em> next.
          </h2>
          <p className="hl-band-sub hl-band-sub--center">
            {readingList.length > 0
              ? 'Articles and write-ups published on ConnectToCampus, newest first.'
              : 'Nothing has been published yet, so these cards are placeholders: each one fills in with a real post the moment one lands.'}
          </p>
          <div className="hl-rail">
            <div className="hl-rail-track">
              {railCards.map((r, i) => {
                const repeat = i >= readingCards.length
                return (
                  <article
                    className={`hl-read${repeat ? ' hl-rail-dup' : ''}`}
                    key={`${r.title}-${i}`}
                    aria-hidden={repeat || undefined}
                  >
                    <div className="hl-read-head">
                      <span className="hl-read-ic">
                        <Icon name={i % 3 === 0 ? 'pencil' : i % 3 === 1 ? 'layers' : 'book'} size={17} />
                      </span>
                      <div>
                        <p className="hl-read-tag">{r.tag}</p>
                        <p className="hl-read-src">{r.source}</p>
                      </div>
                    </div>
                    <h3>{r.title}</h3>
                    <p className="hl-read-quote">&ldquo;{r.body}&rdquo;</p>
                    <div className="hl-read-foot">
                      <BrandName className="hl-read-mark" />
                      <span>{readingList.length > 0 ? 'Trusted insights' : 'Preview — not published'}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="hl-footer">
        <div className="hl-wrap hl-footer-grid">
          <div className="hl-footer-brand">
            <Link className="hl-brand" href="/">
              <img className="hl-brand-logo" src={logoSrc} alt="" width={30} height={30} />
              <BrandName className="hl-brand-name" />
            </Link>
            <p className="hl-footer-tag">
              India&rsquo;s campus community for CS students — contests, the hiring loop and the proof that comes out of
              it, in one place.
            </p>
          </div>
          <nav className="hl-footer-cols" aria-label="Footer">
            {FOOTER.map((col) => (
              <div className="hl-footer-col" key={col.title}>
                <p className="hl-footer-col-title">{col.title}</p>
                {col.links.map((l) => (
                  <Link href={l.href} key={l.href}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="hl-wrap hl-footer-bottom">
          <span>
            <BrandName /> · Built for Indian campuses
          </span>
          <span className="hl-footer-legal">
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
