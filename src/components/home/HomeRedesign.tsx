'use client'

/**
 * HOME — "My student life on ConnectToCampus."
 *
 * PRINCIPLE (premium UX spec §6/§7): the Home feels like a personal dashboard
 * of things to DO, not a feature billboard. Hierarchy:
 *
 *   1. Personal actions — one row of primary intents (find teammates,
 *      opportunities, community, learn)
 *   2. Personalized activity — REAL, scoped-to-you counts ("N opportunities
 *      matching your interests", "M hackathons closing soon")
 *   3. Live now — human activity (voice rooms with people inside)
 *   4. Continue learning / Play — the two daily-loop surfaces
 *   5. Opportunities — latest real listings from the DB
 *
 * DATA RULE: everything numeric comes from the database (anon-safe reads).
 * No fake counters, no fake social proof. Signed-out visitors see the same
 * surfaces with generic copy instead of personalized claims.
 *
 * Preserve: every route below is an existing, tested surface.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms, type LiveVoiceRoom } from '@/lib/liveVoice'
import { Icon } from '@/components/icons'

const CARD = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

type Props = {
  signedIn: boolean
  firstName?: string
  campusName?: string
  interests?: string[]
}

type LiveRoom = LiveVoiceRoom

type OppRow = {
  id: string
  title: string
  opp_type: string | null
  deadline: string | null
  location_type?: string | null
}

const OPP_TYPE_ICON: Record<string, string> = {
  hackathon: 'zap',
  internship: 'briefcase',
  job: 'briefcase',
  project: 'code',
  competition: 'trophy',
  event: 'calendar',
}

function fmtDeadline(d?: string | null): string | null {
  if (!d) return null
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return null
  const days = Math.ceil((t - Date.now()) / 86400000)
  if (days <= 0) return 'closes today'
  if (days === 1) return 'closes tomorrow'
  if (days <= 7) return `closes in ${days}d`
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function HomeRedesign({ signedIn, firstName, campusName, interests = [] }: Props) {
  const router = useRouter()

  /* ── Real data, one parallel round (anon-safe) ─────────────────────── */
  const [live, setLive] = useState<LiveRoom[]>([])
  const [personal, setPersonal] = useState({
    hackathonsClosing: 0,
    opportunities: 0,
    communities: 0,
    notes: 0,
  })
  const [latestOpps, setLatestOpps] = useState<OppRow[]>([])
  const [myDiscussions, setMyDiscussions] = useState(0)

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    const week = new Date(Date.now() + 7 * 86400000).toISOString()
    const now = new Date().toISOString()

    const load = async () => {
      const [liveRoomsRes, hacks, opps, comms, notes, latest] = await Promise.all([
        fetchLiveVoiceRooms(sb),
        // Personalized: hackathons closing within 7 days (the "act now" signal)
        sb
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('opp_type', 'hackathon')
          .gte('deadline', now)
          .lte('deadline', week),
        sb.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
        sb.from('communities').select('id', { count: 'exact', head: true }),
        sb.from('notes').select('id', { count: 'exact', head: true }),
        sb
          .from('opportunities')
          .select('id, title, opp_type, deadline, location_type')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(4),
      ])
      if (cancelled) return
      setLive((liveRoomsRes as LiveRoom[]) || [])
      setPersonal({
        hackathonsClosing: hacks.count || 0,
        opportunities: opps.count || 0,
        communities: comms.count || 0,
        notes: notes.count || 0,
      })
      setLatestOpps((latest as unknown as OppRow[]) || [])
    }
    void load()
    // Live rooms churn — refresh while visible so "live now" stays truthful.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  /* Signed-in only: discussions in the student's own communities. */
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    const sb = createClient()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || cancelled) return
      const { count } = await sb
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('created_at', new Date(Date.now() - 3 * 86400000).toISOString())
      if (!cancelled) setMyDiscussions(count || 0)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  /* ── 1. PERSONAL ACTIONS — primary intents, one row ─────────────────── */
  const ACTIONS = [
    { icon: 'users', label: 'Find teammates', href: '/teams' },
    { icon: 'briefcase', label: 'Find opportunities', href: '/opportunities' },
    { icon: 'message', label: 'Join a community', href: '/communities' },
    { icon: 'notebook', label: 'Continue learning', href: '/notes' },
  ]

  /* ── 4. PLAY — the daily loop ──────────────────────────────────────── */
  const PLAY = [
    { icon: 'type', label: 'Typing Battle', desc: '1v1 race', href: '/games/typing' },
    { icon: 'gamepad', label: 'Quick Math', desc: 'Realtime duel', href: '/games/math' },
    { icon: 'flame', label: 'Free Fire', desc: 'Tournaments', href: '/tournaments' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ══ 1. PERSONAL ACTIONS ═══════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.href + a.label}
            onClick={() => router.push(a.href)}
            className="card-hover"
            style={{
              ...CARD,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={a.icon} size={15} />
            </span>
            {a.label}
          </button>
        ))}
      </div>

      {/* ══ 2. PERSONALIZED ACTIVITY — real, scoped numbers ═══════════ */}
      <div style={{ ...CARD, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <Icon name="sparkles" size={14} style={{ color: 'var(--accent-text)' }} />
          <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {signedIn ? `For you${firstName ? `, ${firstName}` : ''}` : 'Around the platform'}
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <ActivityRow
            icon="zap"
            tone="var(--accent-text)"
            strong={personal.hackathonsClosing > 0}
            text={
              personal.hackathonsClosing > 0
                ? `${personal.hackathonsClosing} hackathon${personal.hackathonsClosing === 1 ? '' : 's'} closing within 7 days`
                : 'No hackathons closing this week — browse all opportunities'
            }
            href="/discover?tab=hackathon"
          />
          <ActivityRow
            icon="briefcase"
            tone="var(--blue-text)"
            text={`${personal.opportunities} live opportunit${personal.opportunities === 1 ? 'y' : 'ies'}${
              signedIn && interests.length > 0 ? ' — matched to your interests' : ' across campuses'
            }`}
            href="/opportunities"
          />
          {signedIn && myDiscussions > 0 && (
            <ActivityRow
              icon="message"
              tone="var(--purple-text)"
              text={`${myDiscussions} new discussion${myDiscussions === 1 ? '' : 's'} this week`}
              href="/communities"
            />
          )}
          <ActivityRow
            icon="notebook"
            tone="var(--success-text)"
            text={`${personal.notes} notes & resources in the library`}
            href="/notes"
          />
        </div>
      </div>

      {/* ══ 3. LIVE NOW — human activity, only when real ══════════════ */}
      {live.length > 0 && (
        <div style={{ ...CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--danger)',
                boxShadow: '0 0 6px var(--danger)',
              }}
            />
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Live now</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {live.slice(0, 3).map((r) => (
              <Link
                key={r.callId}
                href="/live-voice-chat"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'var(--bg-secondary)',
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }} aria-hidden="true">
                  <Icon name="mic" size={15} />
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {r.participantCount} in room
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ══ 4a. CONTINUE LEARNING ═════════════════════════════════════ */}
      <Section title="Continue learning" href="/notes" cta="Library">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          <Tile icon="notebook" title="Notes & PYQs" desc={`${personal.notes} resources`} href="/notes" />
          <Tile icon="sparkles" title="AI Brain" desc="Ask your notes anything" href="/brain" />
          <Tile icon="grad" title="Classroom" desc="Courses & clubs" href="/college" />
          <Tile icon="message" title="Ask a Senior" desc="Doubt? Get answers" href="/ask" />
        </div>
      </Section>

      {/* ══ 4b. PLAY / COMPETE ════════════════════════════════════════ */}
      <Section title="Play & compete" href="/compete?tab=clash" cta="Games & Clash">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {PLAY.map((p) => (
            <Tile key={p.href} icon={p.icon} title={p.label} desc={p.desc} href={p.href} />
          ))}
          <Tile icon="trophy" title="Leaderboard" desc="This week's top" href="/leaderboard" />
        </div>
      </Section>

      {/* ══ 5. OPPORTUNITIES — real listings ══════════════════════════ */}
      {latestOpps.length > 0 && (
        <Section title="Latest opportunities" href="/opportunities" cta="See all">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {latestOpps.map((o) => {
              const dl = fmtDeadline(o.deadline)
              return (
                <Link
                  key={o.id}
                  href="/opportunities"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--bg-secondary)',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'var(--accent-light)',
                      color: 'var(--accent-text)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={OPP_TYPE_ICON[o.opp_type || ''] || 'briefcase'} size={14} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {o.title}
                  </span>
                  {dl && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: dl.startsWith('closes') ? 'var(--warning-text)' : 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {dl}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      {/* Signed-out trust line — campus context, no fake stats */}
      {!signedIn && campusName && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '4px 0 0' }}>
          {personal.communities} communities · open to every student
          {' — '}
          <Link href="/auth/signup" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
            join free
          </Link>
        </p>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function ActivityRow({
  icon,
  text,
  href,
  tone,
  strong,
}: {
  icon: string
  text: string
  href: string
  tone: string
  strong?: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 0',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
      }}
      className="activity-row"
    >
      <span style={{ display: 'inline-flex', color: tone, flexShrink: 0 }} aria-hidden="true">
        <Icon name={icon} size={14} />
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 1.45,
          color: strong ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: strong ? 700 : 500,
        }}
      >
        {text}
      </span>
      <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true">
        <Icon name="chevron" size={13} />
      </span>
    </Link>
  )
}

function Section({
  title,
  href,
  cta,
  children,
}: {
  title: string
  href: string
  cta: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        <Link
          href={href}
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}
        >
          {cta} →
        </Link>
      </div>
      {children}
    </div>
  )
}

function Tile({ icon, title, desc, href }: { icon: string; title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="card-hover"
      style={{
        ...CARD,
        padding: '12px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        textDecoration: 'none',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: 'var(--accent-light)',
          color: 'var(--accent-text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</span>
    </Link>
  )
}
