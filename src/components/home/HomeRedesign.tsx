'use client'

/**
 * HOME REDESIGN — the premium dark community-platform homepage.
 *
 * Visual source of truth: the supplied reference blueprint.
 * Functional source of truth: the EXISTING app (routes, auth, data).
 *
 * Structure (desktop):
 *   LEFT/MAIN (≈72%)                        RIGHT SIDEBAR (≈28%)
 *   ┌ stats ┐ ┌ communities ┐ ┌ live ┐     ┌ HERO promo   ┐
 *   ┌library┐ ┌ opportunit. ┐ ┌talent┐     ┌ QuickActions ┐
 *   ┌ ANNOUNCEMENTS (4 equal cards) ┐      ┌ StartupPromo ┐
 *   ┌ WHAT'S NEW (vertical list)    ┐
 *
 * Old Trending/Confessions/Discovery/Leaderboard cards are intentionally
 * no longer the homepage's primary cards (spec §13) — their features and
 * routes remain fully intact in the app.
 *
 * DATA RULE (spec §20): real counts where they exist (communities, live
 * rooms, opportunities); presentation examples only where the app has no
 * announcement/update source yet. No fake DB records.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

/* ------------------------------------------------------------------ */
/* Feature cards (§7) — six equal cards, one icon system, real routes  */
/* ------------------------------------------------------------------ */

const FEATURES: {
  key: string
  title: string
  subtitle: string
  icon: string
  href: string
  accent: string
  accentText: string
}[] = [
  {
    key: 'communities',
    title: 'Communities',
    subtitle: 'DSA • Web Dev • Startups',
    icon: 'users',
    href: '/communities',
    accent: 'var(--purple-light)',
    accentText: 'var(--purple-text)',
  },
  {
    key: 'live',
    title: 'Live Voice Chat',
    subtitle: 'Join rooms • Talk • Collaborate',
    icon: 'mic',
    href: '/live-voice-chat',
    accent: 'var(--danger-light)',
    accentText: 'var(--danger-text)',
  },
  {
    key: 'compete',
    title: 'Compete',
    subtitle: 'Maths • Contests • Leaderboard',
    icon: 'zap',
    href: '/compete',
    accent: 'var(--success-light)',
    accentText: 'var(--success-text)',
  },
  {
    key: 'library',
    title: 'Library',
    subtitle: 'Notes • PYQs • Resources',
    icon: 'notebook',
    href: '/notes',
    accent: 'var(--blue-light)',
    accentText: 'var(--blue-text)',
  },
  {
    key: 'opportunities',
    title: 'Opportunities',
    subtitle: 'Internships • Jobs • Projects',
    icon: 'briefcase',
    href: '/opportunities',
    accent: 'var(--cyan-light)',
    accentText: 'var(--cyan-text)',
  },
  {
    key: 'talent',
    title: 'Talent',
    subtitle: 'Showcase • Network • Grow',
    icon: 'star',
    href: '/talent',
    accent: 'var(--orange-light)',
    accentText: 'var(--orange-text)',
  },
]

/* ------------------------------------------------------------------ */
/* Announcements (§9) — category badge + title + desc + image          */
/* ------------------------------------------------------------------ */

type Announcement = {
  key: string
  category: 'Event' | 'Feature' | 'Resource' | 'Update'
  title: string
  body: string
  time: string
  img?: string
  href: string
}

const CATEGORY_STYLES: Record<Announcement['category'], { bg: string; fg: string }> = {
  Event: { bg: 'var(--orange-light)', fg: 'var(--orange-text)' },
  Feature: { bg: 'var(--blue-light)', fg: 'var(--blue-text)' },
  Resource: { bg: 'var(--success-light)', fg: 'var(--success-text)' },
  Update: { bg: 'var(--purple-light)', fg: 'var(--purple-text)' },
}

/* WHATS_NEW rows (§12) — short, real product facts (no fake records). */
const WHATS_NEW: { icon: string; text: string; href: string; time: string }[] = [
  { icon: 'zap', text: 'Campus DSA Contest registration is live', href: '/compete', time: '2h' },
  { icon: 'mic', text: 'Live Voice Chat rooms are now available', href: '/live-voice-chat', time: '1d' },
  { icon: 'notebook', text: 'New notes and PYQs added to Library', href: '/notes', time: '3d' },
  { icon: 'briefcase', text: 'Latest internships and project opportunities', href: '/opportunities', time: '4d' },
  { icon: 'star', text: 'Leaderboard updated with top contributors', href: '/leaderboard', time: '5d' },
]

const CARD = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

function FeatureCard({ f }: { f: (typeof FEATURES)[number] }) {
  return (
    <Link
      href={f.href}
      aria-label={f.title}
      className="card-hover"
      style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none' }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          background: f.accent,
          color: f.accentText,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={f.icon} size={19} />
      </span>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</span>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{f.subtitle}</span>
      <span style={{ marginTop: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>→</span>
    </Link>
  )
}

function AnnouncementCard({ a }: { a: Announcement }) {
  const cat = CATEGORY_STYLES[a.category]
  return (
    <Link
      href={a.href}
      aria-label={a.title}
      className="card-hover"
      style={{
        ...CARD,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textDecoration: 'none',
        minWidth: 0,
      }}
    >
      {a.img && (
        <Image
          src={a.img}
          alt=""
          width={320}
          height={110}
          sizes="320px"
          style={{ width: '100%', height: 92, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }}
        />
      )}
      <span
        style={{
          alignSelf: 'flex-start',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          padding: '3px 8px',
          borderRadius: 6,
          background: cat.bg,
          color: cat.fg,
        }}
      >
        {a.category}
      </span>
      <span
        style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}
      >
        {a.title}
      </span>
      <span
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: 11.5,
          color: 'var(--text-muted)',
          lineHeight: 1.45,
        }}
      >
        {a.body}
      </span>
      <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{a.time}</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>→</span>
      </span>
    </Link>
  )
}

export default function HomeRedesign({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()

  /* Real counts where the app has them (anon-safe reads). */
  const [stats, setStats] = useState({ communities: 3, live: 0, opportunities: 0 })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const sb = createClient()
      const [comms, rooms, opps] = await Promise.all([
        sb.from('communities').select('id', { count: 'exact', head: true }),
        sb.from('live_voice_chat_groups').select('id', { count: 'exact', head: true }),
        sb.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      if (cancelled) return
      setStats({
        communities: comms.count ?? 3,
        live: rooms.count ?? 0,
        opportunities: opps.count ?? 0,
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const go = (href: string) => router.push(href)

  /* Announcements — static presentation copy (spec §9) + real images. */
  const announcements: Announcement[] = [
    {
      key: 'dsa',
      category: 'Event',
      title: 'Campus DSA Contest',
      body: "Join this week's DSA contest and test your skills with students across colleges.",
      time: 'This week',
      img: '/images/dsa-contest.webp',
      href: '/compete',
    },
    {
      key: 'voice',
      category: 'Feature',
      title: 'Live Voice Chat is Here',
      body: 'Join real-time voice rooms, discuss doubts and collaborate with students.',
      time: 'New',
      img: '/images/live-voice.webp',
      href: '/live-voice-chat',
    },
    {
      key: 'notes',
      category: 'Resource',
      title: 'New Notes Collection',
      body: 'Added topic-wise notes, PYQs and revision sheets in Library.',
      time: 'Updated',
      img: '/images/library.webp',
      href: '/notes',
    },
    {
      key: 'opps',
      category: 'Update',
      title: 'Opportunity Board',
      body: 'Discover internships, projects and opportunities shared with students.',
      time: stats.opportunities > 0 ? `${stats.opportunities} live` : 'Active',
      img: '/images/opportunities.webp',
      href: '/opportunities',
    },
  ]

  const QUICK_ACTIONS = [
    {
      icon: 'plus',
      label: 'Create a post',
      href: signedIn ? '/' : '/auth/login?redirect=/',
      desc: 'Share with the community',
    },
    { icon: 'zap', label: 'Compete', href: '/compete', desc: 'Daily contests & leaderboard' },
    {
      icon: 'mic',
      label: 'Join a live room',
      href: '/live-voice-chat',
      desc: stats.live > 0 ? `${stats.live} rooms live now` : 'Voice rooms across colleges',
    },
    { icon: 'briefcase', label: 'Explore opportunities', href: '/opportunities', desc: 'Internships, jobs & projects' },
  ]

  return (
    <div>
      {/* ================= TOP GRID: main 72% / sidebar 28% ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }} className="home-redesign-grid">
        {/* ---------------- LEFT / MAIN column ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Row 1: stats + first two feature cards (§6 + §7) */}
          <div className="home-row-3">
            {/* Platform stats / intro card */}
            <div style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="globe" size={19} />
                </span>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 17,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        lineHeight: 1.1,
                      }}
                    >
                      50K+
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Students</span>
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 17,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        lineHeight: 1.1,
                      }}
                    >
                      All
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Colleges</span>
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 17,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        lineHeight: 1.1,
                      }}
                    >
                      {stats.communities}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Communities</span>
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                An open community for all CS students — learn, collaborate and grow together.
              </p>
              <button
                onClick={() => go(signedIn ? '/feed' : '/auth/signup')}
                style={{
                  minHeight: 38,
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {signedIn ? 'Go to Feed →' : 'Join ConnectToCampus →'}
              </button>
              <p
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-muted)',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Icon name="globe" size={11} /> Open for all colleges and universities
              </p>
            </div>

            <FeatureCard f={FEATURES[0]} />
            <FeatureCard f={FEATURES[1]} />
          </div>

          {/* Row 2: remaining three feature cards (§7) */}
          <div className="home-row-3">
            <FeatureCard f={FEATURES[3]} />
            <FeatureCard f={FEATURES[4]} />
            <FeatureCard f={FEATURES[5]} />
          </div>

          {/* Row 3: Compete feature card + secondary CTA (keeps 6 equal cards) */}
          <div className="home-row-3">
            <FeatureCard f={FEATURES[2]} />
            {/* Announcement teaser card fills the grid cell to keep the row balanced */}
            <AnnouncementCard a={announcements[0]} />
            <AnnouncementCard a={announcements[1]} />
          </div>

          {/* ---------------- ANNOUNCEMENTS (§9) ---------------- */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Announcements
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Latest updates, events and important information.
                </p>
              </div>
              <Link
                href="/opportunities"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}
              >
                See all →
              </Link>
            </div>
            <div className="home-announcements">
              {announcements.map((a) => (
                <AnnouncementCard key={a.key} a={a} />
              ))}
            </div>
          </div>

          {/* ---------------- WHAT'S NEW (§12) ---------------- */}
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="zap" size={15} />
                <h3 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  What&apos;s New
                </h3>
              </div>
              <Link
                href="/about"
                style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
              >
                See all updates →
              </Link>
            </div>
            {WHATS_NEW.map((n) => (
              <Link
                key={n.text}
                href={n.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--accent-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={n.icon} size={13} />
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.text}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{n.time}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ---------------- RIGHT SIDEBAR (§8, §10, §11) ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* HERO promo (§8) */}
          <div
            style={{
              ...CARD,
              padding: 18,
              position: 'relative',
              overflow: 'hidden',
              background: 'linear-gradient(160deg, var(--bg) 55%, var(--accent-light)), var(--bg)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '3px 8px',
                textAlign: 'right',
              }}
            >
              Open for
              <br />
              All Students
            </span>
            <h3
              style={{
                fontSize: 21,
                fontWeight: 800,
                color: 'var(--text-primary)',
                lineHeight: 1.2,
                margin: '0 90px 6px 0',
              }}
            >
              Your Ideas,
              <br />
              <span style={{ color: 'var(--accent)' }}>Your Community</span>
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Learn. Build. Compete.
              <br />
              Grow together.
            </p>
            <Image
              src="/images/hero-campus.webp"
              alt="Students collaborating on campus"
              width={480}
              height={258}
              sizes="(max-width: 1024px) 100vw, 320px"
              style={{ width: '100%', height: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}
            />
            <button
              onClick={() => go(signedIn ? '/feed' : '/auth/signup')}
              style={{
                marginTop: 14,
                width: '100%',
                minHeight: 40,
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Join Now →
            </button>
          </div>

          {/* Quick actions (§10) */}
          <div style={{ ...CARD, padding: '14px 14px 10px' }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: '0 0 8px',
                letterSpacing: 0.3,
              }}
            >
              QUICK ACTIONS
            </p>
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.label}
                onClick={() => go(q.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 8px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span
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
                  <Icon name={q.icon} size={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {q.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)' }}>{q.desc}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
              </button>
            ))}
          </div>

          {/* Startup promo (§11) */}
          <div style={{ ...CARD, padding: 18 }}>
            <Image
              src="/images/startup-impact.webp"
              alt="Students building startups together"
              width={520}
              height={512}
              sizes="(max-width: 1024px) 100vw, 300px"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 10,
                border: '1px solid var(--border)',
                marginBottom: 12,
              }}
            />
            <h3 style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Turn Your Ideas Into Impact
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
              Connect with builders, find co-founders, and work on real projects.
            </p>
            <Link
              href="/discover?tab=startup"
              style={{
                display: 'block',
                textAlign: 'center',
                minHeight: 38,
                lineHeight: '38px',
                borderRadius: 10,
                border: '1px solid var(--accent-border, var(--accent))',
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Explore Startups →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
