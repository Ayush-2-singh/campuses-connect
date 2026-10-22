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
  problems,
  wins,
}: {
  stats?: Stats
  problems?: Problem[]
  wins?: Win[]
}) {
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

      {/* ── Live rooms ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Study together</p>
        <h2 className="hl-h2">Don&apos;t read alone</h2>
        <p className="hl-lead hl-measure">Open a room, quiz each other out loud.</p>
        <div className="hl-band-cta">
          <Link className="hl-btn hl-btn--brand" href="/live-voice-chat">
            Open live rooms
          </Link>
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
