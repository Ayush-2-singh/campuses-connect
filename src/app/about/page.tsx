'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/marketing/PublicNav'
import PublicFooter from '@/components/marketing/PublicFooter'
import { Icon } from '@/components/icons'
import { createClient } from '@/lib/supabase/client'

/**
 * `/about` — what this product is, for a visitor who has not signed up.
 *
 * The previous version sold the retired social platform (campus feed, notes,
 * hackathons, Global communities) and its buttons pushed `/jobs` and
 * `/communities`, both of which now redirect away. This page describes only
 * what ships: interview write-ups, the companies behind them, timed practice,
 * live study rooms and the AI coach — and every link below is a route that
 * renders.
 *
 * The campus grid is a live read, not copy: it lists the colleges and campuses
 * that actually exist in the database, and hides itself when there are none.
 */

/** The product is these four sections. Nothing else is offered in the nav. */
const FEATURES = [
  {
    icon: 'mic',
    title: 'Rooms',
    href: '/live-voice-chat',
    desc: 'Talk the problem through out loud with your batch, by topic, before the drive does it to you.',
  },
  {
    icon: 'book',
    title: 'Experiences',
    href: '/experiences',
    desc: 'A real drive, written round by round: the questions asked, the role, and how it ended.',
  },
  {
    icon: 'zap',
    title: 'Compete',
    href: '/compete',
    desc: 'Timed sets on the problems those rounds actually asked, graded on the test cases they pass.',
  },
  {
    icon: 'user',
    title: 'Profile',
    href: '/profile',
    desc: 'Your record: campus, department and batch, the skills you claim, and your GitHub and LinkedIn links.',
  },
] as const

const STEPS = [
  {
    n: '1',
    title: 'Read the round',
    sub: 'Start from a drive that already happened at a campus like yours.',
  },
  {
    n: '2',
    title: 'Practise the problem',
    sub: 'The question you just read about is ready to attempt, with a judge and a clock.',
  },
  {
    n: '3',
    title: 'Say it out loud',
    sub: 'Explain it in a room until the answer is yours, not something you read once.',
  },
] as const

/** Illustrative only — the real write-ups live on `/experiences`. */
const SAMPLE_ROUNDS = [
  { round: 'Round 1', kind: 'Online assessment', detail: '2 coding questions · 90 minutes' },
  { round: 'Round 2', kind: 'DSA interview', detail: 'Arrays, hashing, one follow-up' },
  { round: 'Round 3', kind: 'HR / culture', detail: 'Projects, relocation, notice period' },
] as const

export default function AboutPage() {
  const [liveColleges, setLiveColleges] = useState<{ name: string; campuses: string[] }[]>([])
  const supabase = createClient()

  // One read, one effect: the campus grid is the only live data this page shows.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase
          .from('colleges')
          .select('id, name, campuses!inner(name)')
          .eq('is_active', true)
          .eq('campuses.is_active', true)
        if (cancelled) return
        setLiveColleges(
          (data ?? []).map((c: any) => ({
            name: c.name,
            campuses: (c.campuses || []).map((x: any) => x.name),
          }))
        )
      } catch {
        // A missing read just leaves the campus section empty; nothing to invent.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const totalCampuses = liveColleges.reduce((sum, c) => sum + c.campuses.length, 0)

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />
      <PublicNav />

      <main>
        {/* Hero */}
        <section className="hl-wrap" style={{ padding: '72px 0 56px' }}>
          <div className="landing-hero-grid">
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--accent-light)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 20,
                  padding: '5px 14px',
                  fontSize: 12,
                  color: 'var(--accent-text)',
                  fontWeight: 600,
                  marginBottom: 22,
                }}
              >
                About ConnectToCampus
              </div>
              <h1
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: 'var(--text-primary)',
                  margin: '0 0 18px',
                  letterSpacing: '-0.03em',
                }}
              >
                Placement, written by
                <br />
                <span style={{ color: 'var(--accent)' }}>the people who sat it.</span>
              </h1>
              <p
                style={{
                  fontSize: 17,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  margin: '0 0 30px',
                  maxWidth: 520,
                }}
              >
                Most placement advice is written by people selling a course. This is the other version: students posting
                what a drive actually asked, round by round, and the practice that goes with it. Free, and no account
                needed to read.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <Link
                  href="/experiences"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    padding: '14px 26px',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxShadow: 'var(--accent-glow)',
                  }}
                >
                  Read experiences →
                </Link>
                <Link
                  href="/compete"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-strong)',
                    padding: '14px 26px',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Try a problem
                </Link>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Want to post your own drive?{' '}
                <Link href="/auth/signup" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                  Create a free account
                </Link>
              </p>
            </div>

            {/* What a write-up looks like — clearly labelled as an illustration. */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto' }}>
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 20,
                  padding: '20px 22px',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    A write-up, round by round
                  </p>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      padding: '3px 8px',
                      borderRadius: 20,
                    }}
                  >
                    Sample
                  </span>
                </div>
                {SAMPLE_ROUNDS.map((r, i) => (
                  <div
                    key={r.round}
                    style={{
                      display: 'flex',
                      gap: 12,
                      paddingBottom: i < SAMPLE_ROUNDS.length - 1 ? 14 : 0,
                      marginBottom: i < SAMPLE_ROUNDS.length - 1 ? 14 : 0,
                      borderBottom: i < SAMPLE_ROUNDS.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--accent-light)',
                        color: 'var(--accent-text)',
                        fontSize: 11,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                        {r.kind}
                      </p>
                      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                        {r.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '10px 0 0' }}>
                An illustration of the format — not a real write-up.
              </p>
            </div>
          </div>
        </section>

        {/* Live campus counts — omitted rather than faked when there is nothing yet */}
        {totalCampuses > 0 && (
          <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                maxWidth: 'var(--page-max)',
                margin: '0 auto',
                padding: '28px var(--page-pad)',
                display: 'flex',
                gap: 48,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>{totalCampuses}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Campuses live</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
                  {liveColleges.length}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Colleges</p>
              </div>
            </div>
          </section>
        )}

        {/* What ships */}
        <section style={{ maxWidth: 'var(--page-max)', margin: '0 auto', padding: '64px var(--page-pad)' }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
              textAlign: 'center',
              letterSpacing: '-0.02em',
            }}
          >
            Four things, done properly
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px', textAlign: 'center' }}>
            No feed, no points for logging in. Each one has a job in a placement season.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {FEATURES.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="card-hover"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: '22px 24px',
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Icon name={f.icon} size={21} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* How it fits together */}
        <section style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 'var(--page-max)', margin: '0 auto', padding: '56px var(--page-pad)' }}>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: '0 0 28px',
                letterSpacing: '-0.02em',
                textAlign: 'center',
              }}
            >
              Read, practise, explain
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: '20px 22px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'var(--accent-text)',
                      background: 'var(--accent-light)',
                      borderRadius: 20,
                      padding: '3px 10px',
                      marginBottom: 12,
                    }}
                  >
                    Step {s.n}
                  </span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {s.title}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Where the write-ups come from — real rows only */}
        <section
          style={{
            maxWidth: 'var(--page-max)',
            margin: '0 auto',
            padding: '60px var(--page-pad)',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Where the write-ups come from
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 30px' }}>
            {totalCampuses > 0
              ? `${totalCampuses} campus${totalCampuses !== 1 ? 'es' : ''} across ${liveColleges.length} college${
                  liveColleges.length !== 1 ? 's' : ''
                } are on record.`
              : 'Campuses go live as students post their drives — yours could be the first.'}
          </p>

          {liveColleges.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
                margin: '0 auto 28px',
                textAlign: 'left',
              }}
            >
              {liveColleges.map((col, idx) => (
                <div
                  key={col.name}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: idx % 2 === 0 ? 'var(--accent)' : 'var(--accent-deep, var(--accent))',
                        color: 'var(--on-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {col.name.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {col.name}
                      </h3>
                      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {col.campuses.length} campus{col.campuses.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                  </div>
                  {col.campuses.length > 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.6 }}>
                      {col.campuses.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Link
            href="/experiences"
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              padding: '13px 26px',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: 'var(--accent-glow)',
            }}
          >
            Browse all experiences
          </Link>
        </section>

        {/* Why we request data — transparency for OAuth consent screen */}
        <section style={{ maxWidth: 640, margin: '0 auto', padding: '20px 20px 60px', textAlign: 'center' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            Why we use Google Sign-In
          </h3>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: '0 auto 20px',
              maxWidth: 540,
            }}
          >
            When you sign in with Google, we only access your <strong>name</strong>, <strong>email address</strong>, and{' '}
            <strong>profile picture</strong> to create and verify your ConnectToCampus account. We do not access your
            Google Drive, Gmail, contacts, or any other Google data. This information is used solely for authentication
            and to personalize your profile.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { href: '/privacy', label: 'Privacy Policy' },
              { href: '/terms', label: 'Terms of Service' },
              { href: '/cookies', label: 'Cookie Policy' },
              { href: '/refund', label: 'Refund & Cancellation' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
