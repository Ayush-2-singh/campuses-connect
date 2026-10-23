'use client'

import Link from 'next/link'
import PublicNav from '@/components/marketing/PublicNav'
import OrbitHero from '@/components/OrbitHero'
import PublicFooter from '@/components/marketing/PublicFooter'
import BrandName from '@/components/BrandName'
import { Icon } from '@/components/icons'

/**
 * PlacementLanding — the public landing for the student-facing product.
 *
 * The band sequence and the visuals are the leetquery.com port (bento grid,
 * numbered roadmap modules, looping reading rail, company strip); the CONTENT is
 * this product's. Every href below resolves to a route that exists in src/app,
 * and every number comes from a live query passed in by src/app/page.tsx.
 *
 * ── Honesty rules (unchanged contract) ──────────────────────────────────────
 * A band whose query returned nothing hides itself, or says plainly that
 * nothing is published yet. There are no invented candidates, quotes, employers
 * or outcome statistics on this page, and the "preview" reading cards are
 * labelled as previews rather than dressed up as real posts.
 *
 * ── Copy rule ───────────────────────────────────────────────────────────────
 * Leads are one sentence. The page is scanned, not read.
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
type Post = {
  title: string
  slug: string
  excerpt: string | null
  category: string
  author: string | null
}

const DIFF_TAG: Record<string, string> = {
  easy: 'hl-tag hl-tag--easy',
  medium: 'hl-tag hl-tag--medium',
  hard: 'hl-tag hl-tag--hard',
}

const tagFor = (difficulty?: string | null) =>
  (difficulty && DIFF_TAG[difficulty.toLowerCase()]) || 'hl-tag hl-tag--type'

/**
 * Bento band — four surfaces, every tile a route the nav already links to.
 * Tones and spans are the reference's wide/narrow rhythm.
 */
const BENTO = [
  {
    title: 'Compete',
    href: '/compete',
    icon: 'zap',
    tone: 'peach',
    span: 'wide',
    body: 'Timed contests on real interview problems, ranked against the batch that sat the same paper.',
  },
  {
    title: 'Live rooms',
    href: '/live-voice-chat',
    icon: 'mic',
    tone: 'mint',
    span: 'narrow',
    body: 'Study out loud with your batch, by topic.',
  },
  {
    title: 'Experiences',
    href: '/experiences',
    icon: 'pencil',
    tone: 'blue',
    span: 'narrow',
    body: 'Every round of a real drive, as it happened.',
  },
  {
    title: 'Profile',
    href: '/profile',
    icon: 'user',
    tone: 'lilac',
    span: 'wide',
    body: 'Your record: campus, batch, the skills you claim, and the links that back them up.',
  },
] as const

const ROOMS_STEPS = [
  {
    n: '1',
    title: 'Open or join a room',
    sub: 'Filed by topic — DSA, web dev, a language, or whatever you are stuck on.',
  },
  {
    n: '2',
    title: 'Explain it out loud',
    sub: 'The fastest test of whether you know something is saying it to someone.',
  },
  {
    n: '3',
    title: 'Quiz each other',
    sub: 'Run the rounds you just read, before the drive runs them on you.',
  },
]

const COLLEGE_STEPS = [
  {
    n: '1',
    title: 'Students write what happened',
    sub: 'The rounds, the questions, the result — first-hand.',
  },
  {
    n: '2',
    title: 'Companies stay linked',
    sub: 'Every write-up sits against the company it belongs to.',
  },
  {
    n: '3',
    title: 'Practice sits next to the reading',
    sub: 'The problem you just read about is ready to attempt.',
  },
]

/** `blog_posts.category` key → the label the rail prints. */
const CATEGORY_LABEL: Record<string, string> = {
  interview_experience: 'Interview experience',
  tech_blog: 'Tech',
  campus_life: 'Campus life',
  how_to: 'How-to',
  project: 'Project',
  review: 'Review',
  general: 'Blog',
}

/** Shown only while nothing is published — and labelled as a preview there. */
const READING_PREVIEW: Post[] = [
  {
    slug: '',
    title: 'An interview write-up will live here',
    excerpt: 'Round by round, from someone who sat the drive.',
    category: 'Interview experience',
    author: 'From students',
  },
  {
    slug: '',
    title: 'A tech post will live here',
    excerpt: 'What got built, what broke, and what was learnt fixing it.',
    category: 'Tech',
    author: 'From the community',
  },
  {
    slug: '',
    title: 'A how-to will live here',
    excerpt: 'A method that worked, written down for the next batch.',
    category: 'How-to',
    author: 'From ConnectToCampus',
  },
]

export default function PlacementLanding({
  stats,
  companies,
  problems,
  wins,
  posts,
}: {
  stats?: Stats
  companies?: Company[]
  problems?: Problem[]
  wins?: Win[]
  posts?: Post[]
}) {
  const companyList = companies ?? []
  const problemList = problems ?? []
  const winList = wins ?? []
  const postList = posts ?? []

  const modules = [
    {
      n: '1',
      title: 'Practise',
      href: '/compete',
      icon: 'zap',
      tag: '# Score, not skim',
      body: 'Timed sets on real interview problems, graded on the test cases they pass.',
      statLabel: 'Problems live',
      statValue: String(problemList.length),
      covLabel: 'Topics',
      covValue: String(new Set(problemList.flatMap((p) => p.topics ?? [])).size || problemList.length),
      cta: 'Enter Compete',
    },
    {
      n: '2',
      title: 'Read',
      href: '/experiences',
      icon: 'book',
      tag: '# Round by round',
      body: 'Write-ups students post after a real drive: every round, the role, the result.',
      statLabel: 'Write-ups',
      statValue: String(winList.length),
      covLabel: 'Companies',
      covValue: String(stats?.companies ?? companyList.length),
      cta: 'Read experiences',
    },
    {
      n: '3',
      title: 'Write',
      href: '/experiences',
      icon: 'pencil',
      tag: '# Two minutes',
      body: 'Your drive is the one thing the next batch cannot look up anywhere else.',
      statLabel: 'Campuses',
      statValue: String(stats?.campuses ?? 0),
      covLabel: 'Sign-up',
      covValue: 'Open',
      cta: 'Add your round',
    },
  ]

  // `blog_posts.category` stores a machine key (`how_to`); the rail is copy, so
  // it shows the reader's name for it. Unknown keys fall through unchanged
  // rather than being hidden.
  const railCards =
    postList.length > 0
      ? postList.map((p) => ({ ...p, category: CATEGORY_LABEL[p.category] ?? p.category }))
      : READING_PREVIEW

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      {/* Shared public header — the same one every public page renders. */}
      <PublicNav />

      {/* ── Hero (orbit stage) ── */}
      <OrbitHero />

      {/* ── Real counts (hidden entirely when the query fails) ── */}
      {stats && (
        <section className="hl-metrics-band">
          <div className="hl-wrap hl-metrics">
            <div>
              <p className="hl-metric-v">{stats.campuses}</p>
              <p className="hl-metric-l">Campuses</p>
            </div>
            <div>
              <p className="hl-metric-v">{stats.companies}</p>
              <p className="hl-metric-l">Companies on record</p>
            </div>
            <div>
              <p className="hl-metric-v">{stats.students}</p>
              <p className="hl-metric-l">Students</p>
            </div>
          </div>
        </section>
      )}

      {/* ── Companies strip — live rows only ──
          Links point at /experiences: the per-company pages are archived, and a
          strip of brand logos that leads to a 404 is worse than no strip. */}
      {companyList.length > 0 && (
        <section className="hl-strip">
          <div className="hl-wrap">
            <p className="hl-strip-eyebrow">Companies students have written about</p>
            <div className="hl-strip-row">
              {companyList.slice(0, 10).map((c) => (
                <Link className="hl-strip-item" href="/experiences" key={c.slug}>
                  {c.logo_url ? (
                    <img className="hl-strip-logo" src={c.logo_url} alt={c.name} height={34} />
                  ) : (
                    <span className="hl-strip-word">{c.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Write-ups ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">From the students</p>
        <h2 className="hl-h2">The rounds</h2>
        <p className="hl-lead hl-measure">Real rounds, real results.</p>

        {winList.length > 0 ? (
          <div className="hl-list-rows">
            {winList.map((w) => (
              <div className="hl-list-row" key={w.id}>
                <span className="hl-list-mark" aria-hidden="true">
                  {w.initials}
                </span>
                <span className="hl-list-main">
                  <span className="hl-list-title">{w.title}</span>
                  <span className="hl-list-sub">
                    {w.company}
                    {w.role ? ` · ${w.role}` : ''} — {w.excerpt}
                  </span>
                </span>
                <span className={tagFor(w.difficulty)}>{w.difficulty || w.result || 'Write-up'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="hl-empty">
            No write-ups published yet. If you have sat through a drive, yours would be the first one here —{' '}
            <Link className="hl-nav-link" href="/experiences">
              write it in two minutes
            </Link>
            .
          </p>
        )}

        <div className="hl-band-cta">
          <Link className="hl-btn hl-btn--brand" href="/experiences">
            All experiences
          </Link>
        </div>
      </section>

      {/* ── Practice ── */}
      {problemList.length > 0 && (
        <section className="hl-section hl-wrap">
          <p className="hl-eyebrow">Then practise it</p>
          <h2 className="hl-h2">Practise them</h2>
          <p className="hl-lead hl-measure">Practise what they asked.</p>

          <div className="hl-list-rows">
            {problemList.map((p, i) => (
              <div className="hl-list-row" key={p.slug}>
                <span className="hl-list-mark" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="hl-list-main">
                  <span className="hl-list-title">{p.title}</span>
                  <span className="hl-list-sub">
                    {p.topics?.length ? p.topics.slice(0, 3).join(' · ') : 'Practice problem'}
                  </span>
                </span>
                <span className={tagFor(p.difficulty)}>{p.difficulty || 'Practice'}</span>
              </div>
            ))}
          </div>

          <div className="hl-band-cta">
            <Link className="hl-btn hl-btn--brand" href="/compete">
              Open the arena
            </Link>
          </div>
        </section>
      )}

      {/* ── Bento grid (reference's pastel tiles) ── */}
      <section className="hl-band hl-band--platform">
        <div className="hl-wrap">
          <p className="hl-eyebrow hl-eyebrow--center">What is inside</p>
          <h2 className="hl-band-title hl-band-title--center">
            One platform for the <em className="hl-em">whole placement year.</em>
          </h2>
          <p className="hl-band-sub hl-band-sub--center">Four surfaces, one login.</p>

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

      {/* ── Roadmap — numbered modules, live counts ── */}
      <section className="hl-band">
        <div className="hl-wrap">
          <p className="hl-eyebrow hl-eyebrow--center">The path</p>
          <h2 className="hl-band-title hl-band-title--center">
            Practise, read, then <em className="hl-em">write it down.</em>
          </h2>
          <p className="hl-band-sub hl-band-sub--center">
            Three steps, every one of them open today. The counts are read live.
          </p>

          <div className="hl-mods">
            {modules.map((m) => (
              <article className="hl-mod" key={m.n}>
                <span className="hl-mod-n" aria-hidden="true">
                  {m.n}
                </span>
                <div className="hl-mod-card">
                  <div className="hl-mod-top">
                    <span className="hl-mod-ic">
                      <Icon name={m.icon} size={20} />
                    </span>
                    <h3>{m.title}</h3>
                  </div>
                  <span className="hl-mod-tag">{m.tag}</span>
                  <p className="hl-mod-body">{m.body}</p>
                  <div className="hl-mod-stats">
                    <div className="hl-mod-stat">
                      <p className="hl-mod-stat-l">{m.statLabel}</p>
                      <p className="hl-mod-stat-v">{m.statValue}</p>
                    </div>
                    <div className="hl-mod-stat hl-mod-stat--cov">
                      <p className="hl-mod-stat-l">{m.covLabel}</p>
                      <p className="hl-mod-cov">{m.covValue}</p>
                    </div>
                  </div>
                  <Link className="hl-mod-cta" href={m.href}>
                    {m.cta}
                    <Icon name="chevron" size={15} className="hl-arrow" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live rooms ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Study together</p>
        <h2 className="hl-h2">Don&apos;t read alone</h2>
        <p className="hl-lead hl-measure">Open a room, quiz each other out loud.</p>

        <div className="hl-list-rows">
          {ROOMS_STEPS.map((s) => (
            <div className="hl-list-row" key={s.n}>
              <span className="hl-list-mark" aria-hidden="true">
                {s.n}
              </span>
              <span className="hl-list-main">
                <span className="hl-list-title">{s.title}</span>
                <span className="hl-list-sub">{s.sub}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="hl-band-cta">
          <Link className="hl-btn hl-btn--brand" href="/live-voice-chat">
            Open live rooms
          </Link>
        </div>
      </section>

      {/* ── Reading rail (reference's looping cards) ── */}
      <section className="hl-band">
        <div className="hl-wrap">
          <p className="hl-eyebrow hl-eyebrow--center">{postList.length > 0 ? 'Latest writing' : 'Preview'}</p>
          <h2 className="hl-band-title hl-band-title--center">
            Worth <em className="hl-em">reading</em> next.
          </h2>
          <p className="hl-band-sub hl-band-sub--center">
            {postList.length > 0
              ? 'Published on ConnectToCampus, newest first.'
              : 'Nothing published yet — these cards fill in with real posts the moment one lands.'}
          </p>

          <div className="hl-rail">
            <div className="hl-rail-track">
              {[...railCards, ...railCards].map((r, i) => {
                const repeat = i >= railCards.length
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
                        <p className="hl-read-tag">{r.category}</p>
                        <p className="hl-read-src">{r.author || 'ConnectToCampus'}</p>
                      </div>
                    </div>
                    <h3>{r.title}</h3>
                    <p className="hl-read-quote">&ldquo;{r.excerpt || 'A short read from the community.'}&rdquo;</p>
                    <div className="hl-read-foot">
                      <BrandName className="hl-read-mark" />
                      <span>{postList.length > 0 ? 'Published' : 'Preview — not published'}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <div className="hl-band-cta">
            <Link className="hl-btn hl-btn--ghost" href="/blog">
              Read the blog
            </Link>
          </div>
        </div>
      </section>

      {/* ── College first ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">College first</p>
        <h2 className="hl-h2">One campus at a time</h2>
        <p className="hl-lead hl-measure">
          The same company runs a different process at a different college, so the write-ups stay campus-specific.
        </p>

        <div className="hl-list-rows">
          {COLLEGE_STEPS.map((s) => (
            <div className="hl-list-row" key={s.n}>
              <span className="hl-list-mark" aria-hidden="true">
                {s.n}
              </span>
              <span className="hl-list-main">
                <span className="hl-list-title">{s.title}</span>
                <span className="hl-list-sub">{s.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Add your campus</p>
        <h2 className="hl-h2 hl-h2--tight">Write yours in two minutes</h2>
        <p className="hl-lead hl-measure">Two minutes. Helps the next batch.</p>
        <div className="hl-cta-row">
          <Link className="hl-btn hl-btn--brand hl-btn--lg hl-btn--shine" href="/auth/signup">
            Write your experience
          </Link>
          <Link className="hl-btn hl-btn--ghost hl-btn--lg" href="/blog">
            Read the blog
          </Link>
        </div>
      </section>

      {/* Shared public footer — same component as every public page. */}
      <PublicFooter />
    </div>
  )
}
