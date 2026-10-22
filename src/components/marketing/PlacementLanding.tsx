'use client'

import Link from 'next/link'
import PublicNav from '@/components/marketing/PublicNav'
import OrbitHero from '@/components/OrbitHero'
import PublicFooter from '@/components/marketing/PublicFooter'

/**
 * PlacementLanding — the public landing for the student-facing product.
 *
 * Replaces the recruiter sales page (`HireLanding`) on `/` while
 * `RECRUITER_SALES_HIDDEN` is true — see src/lib/featureGates.ts. The old
 * landing sold a recruiter console that was never built; this one sells the
 * thing that actually ships: interview write-ups and the company rounds behind
 * them.
 *
 * ── Honesty rules (same contract as the page it replaces) ───────────────────
 * Every band that looks like real data is read from the live database and is
 * passed in by the server (src/app/page.tsx). A band whose query returns
 * nothing hides itself or states that plainly — there are no invented
 * candidates, quotes, employers or outcome statistics on this page.
 *
 * ── Copy rule ───────────────────────────────────────────────────────────────
 * Nothing here promises a page that does not exist. College-scoped placement
 * pages are still being built, so the copy describes them as the direction of
 * travel ("one campus at a time") instead of linking to them.
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

const DIFF_TAG: Record<string, string> = {
  easy: 'hl-tag hl-tag--easy',
  medium: 'hl-tag hl-tag--medium',
  hard: 'hl-tag hl-tag--hard',
}

const tagFor = (difficulty?: string | null) =>
  (difficulty && DIFF_TAG[difficulty.toLowerCase()]) || 'hl-tag hl-tag--type'

export default function PlacementLanding({
  stats,
  companies,
  problems,
  wins,
}: {
  stats?: Stats
  companies?: Company[]
  problems?: Problem[]
  wins?: Win[]
}) {
  const companyList = companies ?? []
  const problemList = problems ?? []
  const winList = wins ?? []

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

      {/* ── Companies strip — live rows only ── */}
      {companyList.length > 0 && (
        <section className="hl-strip">
          <div className="hl-wrap">
            <p className="hl-strip-eyebrow">Companies students have written about</p>
            <div className="hl-strip-row">
              {companyList.slice(0, 10).map((c) => (
                <Link className="hl-strip-item" href={`/companies/${c.slug}`} key={c.slug}>
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
        <h2 className="hl-h2">What the round actually asked</h2>
        <p className="hl-lead hl-measure">
          Each write-up below is a real post from a student on ConnectToCampus: the company, the role, how hard it felt,
          and how it ended.
        </p>

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
          <h2 className="hl-h2">The questions that keep coming back</h2>
          <p className="hl-lead hl-measure">
            Reading a round is half the job. These are live practice problems on the platform, so the thing you just
            read about is the thing you can attempt tonight.
          </p>

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

      {/* ── Live rooms (LiveKit) ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Not alone at 1am</p>
        <h2 className="hl-h2">Study together, in the same room</h2>
        <p className="hl-lead hl-measure">
          Reading a round on your own only gets you so far. Open a live room, share what you are studying, and let the
          batch quiz you until you actually know it — voice, not a thread nobody replies to.
        </p>

        <div className="hl-list-rows">
          {[
            {
              n: '1',
              title: 'Open or join a room',
              sub: 'Filed by topic — DSA, web dev, a language, or just the subject you are stuck on.',
            },
            {
              n: '2',
              title: 'Read and explain out loud',
              sub: 'The fastest way to find out whether you know something is to say it to someone.',
            },
            {
              n: '3',
              title: 'Verify yourself before the drive',
              sub: 'Quiz each other on the rounds you just read. Free to use, no add-on.',
            },
          ].map((s) => (
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

      {/* ── How the product is built ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">College first</p>
        <h2 className="hl-h2">One campus at a time, on purpose</h2>
        <p className="hl-lead hl-measure">
          Placement advice is only useful if it comes from the campus it happened at — the same company runs a different
          process at a different college. So this platform grows campus by campus instead of pretending one national
          average fits everyone.
        </p>

        <div className="hl-band-cta">
          <Link className="hl-btn hl-btn--brand" href="/experiences">
            Read the experiences
          </Link>
        </div>

        <div className="hl-list-rows">
          {[
            {
              n: '1',
              title: 'Students write what happened',
              sub: 'The rounds, the questions, the result — first-hand, not aggregated from other sites.',
            },
            {
              n: '2',
              title: 'Companies and rounds stay linked',
              sub: 'Every write-up sits against the company it belongs to, so the next batch sees the pattern.',
            },
            {
              n: '3',
              title: 'Practice sits next to the reading',
              sub: 'The problem you just read about is on the platform, ready to attempt.',
            },
          ].map((s) => (
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
        <h2 className="hl-h2 hl-h2--tight">Your juniors will read this next year</h2>
        <p className="hl-lead hl-measure">
          Five minutes of writing saves the next batch months of guessing. Sign in, pick your company, describe the
          rounds.
        </p>
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
