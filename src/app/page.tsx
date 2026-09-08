'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

const DOODLE_LIGHT =
  'url(\'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"%3E%3Cg fill="none" stroke="%23ffffff" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"%3E%3Cg transform="translate(48 55) rotate(-8) scale(1.1)"%3E%3Cpath d="M0 7 C-8 -1 -13 -5 -13 -10 C-13 -15 -8 -17 -5 -14 L0 -9 L5 -14 C8 -17 13 -15 13 -10 C13 -5 8 -1 0 7 Z"/%3E%3C/g%3E%3Cg transform="translate(140 45) rotate(6)"%3E%3Cpath d="M-14 -5 H-6 L-4 -10 H4 L6 -5 H14 V9 Q14 12 11 12 H-11 Q-14 12 -14 9 Z"/%3E%3Ccircle cx="0" cy="2" r="4.5"/%3E%3C/g%3E%3Cg transform="translate(232 58) rotate(-5)"%3E%3Ccircle cx="0" cy="0" r="11"/%3E%3Cpath d="M-4 -4 L-4 -3.4 M4 -4 L4 -3.4"/%3E%3Cpath d="M-5 3 Q0 8 5 3"/%3E%3C/g%3E%3Cg transform="translate(320 42) rotate(10)"%3E%3Cpath d="M0 -12 L2.9 -4 L11.4 -3.7 L4.8 1.6 L7.1 9.7 L0 5 L-7.1 9.7 L-4.8 1.6 L-11.4 -3.7 L-2.9 -4 Z"/%3E%3C/g%3E%3Cg transform="translate(95 132) rotate(-6)"%3E%3Cpath d="M-10 -3 H10 V5 Q10 13 0 13 Q-10 13 -10 5 Z"/%3E%3Cpath d="M10 0 Q17 1 16 6 Q15 10 10 9"/%3E%3Cpath d="M-4 -8 Q-2 -12 -4 -16 M4 -8 Q6 -12 4 -16"/%3E%3C/g%3E%3Cg transform="translate(188 142) rotate(5) scale(0.85)"%3E%3Cellipse cx="0" cy="-5" rx="8" ry="10"/%3E%3Cpath d="M-2 5 L0 8 L2 5"/%3E%3Cpath d="M0 8 Q5 14 0 20 Q-5 25 0 30"/%3E%3C/g%3E%3Cg transform="translate(276 130) rotate(-10)"%3E%3Cellipse cx="-3" cy="9" rx="4.5" ry="3.5" transform="rotate(-20 -3 9)"/%3E%3Cpath d="M1.5 9 V-10"/%3E%3Cpath d="M1.5 -10 Q11 -7 7 1"/%3E%3C/g%3E%3Cg transform="translate(340 142) rotate(4)"%3E%3Cpath d="M-14 5 Q-18 5 -18 0 Q-18 -5 -12 -5 Q-11 -11 -4 -11 Q3 -11 4 -5 Q10 -6 10 -1 Q10 5 5 5 Z"/%3E%3C/g%3E%3Cg transform="translate(48 225)"%3E%3Cpath d="M-2 -13 A13 13 0 1 0 -2 13 A16 16 0 0 1 -2 -13 Z"/%3E%3C/g%3E%3Cg transform="translate(140 235) rotate(-12)"%3E%3Cpath d="M-14 6 L14 -10 L3 15 L-2 6 Z"/%3E%3Cpath d="M14 -10 L-2 6"/%3E%3C/g%3E%3Cg transform="translate(232 220) scale(0.9)"%3E%3Ccircle cx="0" cy="0" r="6"/%3E%3Cpath d="M0 -11 V-7 M0 7 V11 M-11 0 H-7 M7 0 H11 M-8 -8 L-5 -5 M5 5 L8 8 M-8 8 L-5 5 M5 -5 L8 -8"/%3E%3C/g%3E%3Cg transform="translate(320 232) rotate(6)"%3E%3Cpath d="M-13 -8 H13 V8 H-13 Z"/%3E%3Cpath d="M-13 -8 L0 2 L13 -8"/%3E%3C/g%3E%3Cg transform="translate(95 315) rotate(-6)"%3E%3Cpath d="M-11 -2 H11 V12 H-11 Z"/%3E%3Cpath d="M-13 -9 H13 V-2 H-13 Z"/%3E%3Cpath d="M0 -9 V12"/%3E%3Cpath d="M0 -9 C-2 -13 -7 -13 -6 -10 C-5 -8 -2 -9 0 -9 M0 -9 C2 -13 7 -13 6 -10 C5 -8 2 -9 0 -9"/%3E%3C/g%3E%3Cg transform="translate(185 322) rotate(4)"%3E%3Cpath d="M-15 -3 L0 -10 L15 -3 L0 4 Z"/%3E%3Cpath d="M-7 0 V6 Q0 10 7 6 V0"/%3E%3Cpath d="M15 -3 V6"/%3E%3Ccircle cx="15" cy="8" r="1.5"/%3E%3C/g%3E%3Cg transform="translate(276 312) rotate(8)"%3E%3Cpath d="M-3 -14 L-11 2 H-3 L-5 14 L9 -3 H1 Z"/%3E%3C/g%3E%3Cg transform="translate(340 322) rotate(-5)"%3E%3Cpath d="M0 -8 Q-7 -12 -14 -9 V9 Q-7 6 0 10 Q7 6 14 9 V-9 Q7 -12 0 -8 Z"/%3E%3Cpath d="M0 -8 V10"/%3E%3C/g%3E%3Cg transform="translate(85 88) rotate(15)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3Cg transform="translate(230 178) rotate(-10)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3Cg transform="translate(200 268) rotate(20)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\')'
const DOODLE_DARK =
  'url(\'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"%3E%3Cg fill="none" stroke="%231f2430" stroke-opacity="0.28" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"%3E%3Cg transform="translate(48 55) rotate(-8) scale(1.1)"%3E%3Cpath d="M0 7 C-8 -1 -13 -5 -13 -10 C-13 -15 -8 -17 -5 -14 L0 -9 L5 -14 C8 -17 13 -15 13 -10 C13 -5 8 -1 0 7 Z"/%3E%3C/g%3E%3Cg transform="translate(140 45) rotate(6)"%3E%3Cpath d="M-14 -5 H-6 L-4 -10 H4 L6 -5 H14 V9 Q14 12 11 12 H-11 Q-14 12 -14 9 Z"/%3E%3Ccircle cx="0" cy="2" r="4.5"/%3E%3C/g%3E%3Cg transform="translate(232 58) rotate(-5)"%3E%3Ccircle cx="0" cy="0" r="11"/%3E%3Cpath d="M-4 -4 L-4 -3.4 M4 -4 L4 -3.4"/%3E%3Cpath d="M-5 3 Q0 8 5 3"/%3E%3C/g%3E%3Cg transform="translate(320 42) rotate(10)"%3E%3Cpath d="M0 -12 L2.9 -4 L11.4 -3.7 L4.8 1.6 L7.1 9.7 L0 5 L-7.1 9.7 L-4.8 1.6 L-11.4 -3.7 L-2.9 -4 Z"/%3E%3C/g%3E%3Cg transform="translate(95 132) rotate(-6)"%3E%3Cpath d="M-10 -3 H10 V5 Q10 13 0 13 Q-10 13 -10 5 Z"/%3E%3Cpath d="M10 0 Q17 1 16 6 Q15 10 10 9"/%3E%3Cpath d="M-4 -8 Q-2 -12 -4 -16 M4 -8 Q6 -12 4 -16"/%3E%3C/g%3E%3Cg transform="translate(188 142) rotate(5) scale(0.85)"%3E%3Cellipse cx="0" cy="-5" rx="8" ry="10"/%3E%3Cpath d="M-2 5 L0 8 L2 5"/%3E%3Cpath d="M0 8 Q5 14 0 20 Q-5 25 0 30"/%3E%3C/g%3E%3Cg transform="translate(276 130) rotate(-10)"%3E%3Cellipse cx="-3" cy="9" rx="4.5" ry="3.5" transform="rotate(-20 -3 9)"/%3E%3Cpath d="M1.5 9 V-10"/%3E%3Cpath d="M1.5 -10 Q11 -7 7 1"/%3E%3C/g%3E%3Cg transform="translate(340 142) rotate(4)"%3E%3Cpath d="M-14 5 Q-18 5 -18 0 Q-18 -5 -12 -5 Q-11 -11 -4 -11 Q3 -11 4 -5 Q10 -6 10 -1 Q10 5 5 5 Z"/%3E%3C/g%3E%3Cg transform="translate(48 225)"%3E%3Cpath d="M-2 -13 A13 13 0 1 0 -2 13 A16 16 0 0 1 -2 -13 Z"/%3E%3C/g%3E%3Cg transform="translate(140 235) rotate(-12)"%3E%3Cpath d="M-14 6 L14 -10 L3 15 L-2 6 Z"/%3E%3Cpath d="M14 -10 L-2 6"/%3E%3C/g%3E%3Cg transform="translate(232 220) scale(0.9)"%3E%3Ccircle cx="0" cy="0" r="6"/%3E%3Cpath d="M0 -11 V-7 M0 7 V11 M-11 0 H-7 M7 0 H11 M-8 -8 L-5 -5 M5 5 L8 8 M-8 8 L-5 5 M5 -5 L8 -8"/%3E%3C/g%3E%3Cg transform="translate(320 232) rotate(6)"%3E%3Cpath d="M-13 -8 H13 V8 H-13 Z"/%3E%3Cpath d="M-13 -8 L0 2 L13 -8"/%3E%3C/g%3E%3Cg transform="translate(95 315) rotate(-6)"%3E%3Cpath d="M-11 -2 H11 V12 H-11 Z"/%3E%3Cpath d="M-13 -9 H13 V-2 H-13 Z"/%3E%3Cpath d="M0 -9 V12"/%3E%3Cpath d="M0 -9 C-2 -13 -7 -13 -6 -10 C-5 -8 -2 -9 0 -9 M0 -9 C2 -13 7 -13 6 -10 C5 -8 2 -9 0 -9"/%3E%3C/g%3E%3Cg transform="translate(185 322) rotate(4)"%3E%3Cpath d="M-15 -3 L0 -10 L15 -3 L0 4 Z"/%3E%3Cpath d="M-7 0 V6 Q0 10 7 6 V0"/%3E%3Cpath d="M15 -3 V6"/%3E%3Ccircle cx="15" cy="8" r="1.5"/%3E%3C/g%3E%3Cg transform="translate(276 312) rotate(8)"%3E%3Cpath d="M-3 -14 L-11 2 H-3 L-5 14 L9 -3 H1 Z"/%3E%3C/g%3E%3Cg transform="translate(340 322) rotate(-5)"%3E%3Cpath d="M0 -8 Q-7 -12 -14 -9 V9 Q-7 6 0 10 Q7 6 14 9 V-9 Q7 -12 0 -8 Z"/%3E%3Cpath d="M0 -8 V10"/%3E%3C/g%3E%3Cg transform="translate(85 88) rotate(15)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3Cg transform="translate(230 178) rotate(-10)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3Cg transform="translate(200 268) rotate(20)"%3E%3Cpath d="M0 -5 V5 M-5 0 H5"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\')'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [pulse, setPulse] = useState({ notes: 0, opportunities: 0, discussions: 0, hackathons: 0 })
  const [liveColleges, setLiveColleges] = useState<{ name: string; campuses: string[] }[]>([])
  const [isLight, setIsLight] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Read current theme
    const theme = document.documentElement.getAttribute('data-theme')
    setIsLight(theme === 'light')

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme')
      setIsLight(t === 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser(user)
    })
  }, [])

  // Real colleges + campuses from the database — every campus is live now.
  useEffect(() => {
    supabase
      .from('colleges')
      .select('id, name, campuses!inner(name)')
      .eq('is_active', true)
      .eq('campuses.is_active', true)
      .then(({ data }) => {
        setLiveColleges(
          (data || []).map((c: any) => ({
            name: c.name,
            campuses: (c.campuses || []).map((x: any) => x.name),
          }))
        )
      })
  }, [supabase])

  // Real counts from the database — makes the landing page feel alive.
  useEffect(() => {
    const now = new Date().toISOString()
    const week = new Date(Date.now() + 7 * 86400000).toISOString()
    ;(async () => {
      const [notes, opps, posts, hacks] = await Promise.all([
        supabase.from('notes').select('id', { count: 'exact', head: true }),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .eq('opp_type', 'hackathon')
          .gte('deadline', now)
          .lte('deadline', week),
      ])
      setPulse({
        notes: notes.count || 0,
        opportunities: opps.count || 0,
        discussions: posts.count || 0,
        hackathons: hacks.count || 0,
      })
    })().catch(() => {})
  }, [])

  const features = [
    { icon: 'home', title: 'Campus Feed', desc: 'Announcements, events and discussions for your campus.' },
    { icon: 'book', title: 'Classroom', desc: 'Schedule, events, polls & ask seniors — all in one place.' },
    { icon: 'notebook', title: 'Library', desc: 'Notes, PYQs, resources & AI Brain to ask anything.' },
    { icon: 'zap', title: 'Compete', desc: 'DSA challenges, talent discovery & leaderboard rankings.' },
    { icon: 'briefcase', title: 'Opportunities', desc: 'Hackathons, internships, jobs & find teammates.' },
  ]

  const totalCampuses = liveColleges.reduce((sum, c) => sum + c.campuses.length, 0)

  const stats = [
    { label: 'Notes & resources', value: pulse.notes },
    { label: 'Live opportunities', value: pulse.opportunities },
    { label: 'Discussions (all-India)', value: pulse.discussions },
    { label: 'Hackathons this week', value: pulse.hackathons },
  ]

  return (
    <div
      data-accent="gold"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        backgroundImage: isLight ? DOODLE_DARK : DOODLE_LIGHT,
        backgroundSize: '360px 360px',
        backgroundRepeat: 'repeat',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        className="landing-nav"
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          padding: '14px 20px',
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="grad" size={18} />
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Connect<span style={{ color: 'var(--accent)' }}>ToCampus</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => router.push('/global')}
              style={{
                background: 'none',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌐 Global
            </button>
            {user ? (
              <button
                onClick={() => router.push('/feed')}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Go to Feed →
              </button>
            ) : (
              <>
                <button
                  onClick={() => router.push('/auth/login')}
                  style={{
                    background: 'none',
                    color: 'var(--text-secondary)',
                    border: 'none',
                    padding: '8px 14px',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => router.push('/auth/signup')}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    padding: '9px 18px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Join Free
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="ambient" style={{ maxWidth: 1040, margin: '0 auto', padding: '72px 20px 64px' }}>
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
                color: 'var(--accent)',
                fontWeight: 600,
                marginBottom: 22,
              }}
            >
              🌐 Join from any college — or connect globally
            </div>
            <h2
              className="landing-hero"
              style={{
                fontSize: 54,
                fontWeight: 800,
                lineHeight: 1.12,
                color: 'var(--text-primary)',
                margin: '0 0 18px',
                letterSpacing: '-0.03em',
              }}
            >
              Every college.
              <br />
              <span style={{ color: 'var(--accent)' }}>One community.</span>
            </h2>
            <p
              style={{
                fontSize: 17,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                margin: '0 0 30px',
                maxWidth: 480,
              }}
            >
              The community platform for Computer Science students across India — hackathons, opportunities, notes and a
              nationwide community. No campus required: your college isn&apos;t listed yet? Connect globally.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 34 }}>
              <button
                onClick={() => router.push('/auth/signup')}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--accent-glow)',
                }}
              >
                Join free — from any college →
              </button>
              <button
                onClick={() => router.push('/global')}
                style={{
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                  padding: '14px 28px',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🌐 Explore the Global feed
              </button>
            </div>
            {/* Stats — real numbers from the database */}
            <div className="landing-stats">
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', margin: '0 0 2px' }}>{s.value}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.3 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div style={{ position: 'relative', width: 290, margin: '0 auto' }}>
            <div
              style={{
                position: 'absolute',
                inset: -50,
                background: 'radial-gradient(circle, var(--accent-light), transparent 70%)',
                filter: 'blur(10px)',
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: 'relative',
                border: '1px solid var(--border-strong)',
                borderRadius: 38,
                background: 'var(--bg)',
                padding: '12px 12px 18px',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* phone header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '2px 6px 12px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  A
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Global Pulse</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Just now · All of India</div>
                </div>
                <Icon name="bell" size={14} />
              </div>
              {/* fake feed cards */}
              {[
                {
                  badge: '📢 Announcement',
                  title: 'Hackathon registrations open — 48 hours left!',
                  bg: 'var(--orange-light)',
                  text: 'var(--orange-text)',
                },
                {
                  badge: '📚 Resource',
                  title: 'DBMS PYQs (2022–2025) uploaded by a senior.',
                  bg: 'var(--accent-light)',
                  text: 'var(--accent-text)',
                },
                {
                  badge: '⚡ DSA',
                  title: 'Weekly contest #12 — solve 3 problems, win aura.',
                  bg: 'var(--purple-light)',
                  text: 'var(--purple-text)',
                },
              ].map((c, i) => (
                <div
                  key={i}
                  style={{
                    marginTop: 12,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '12px 14px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 9.5,
                      fontWeight: 700,
                      background: c.bg,
                      color: c.text,
                      padding: '2px 8px',
                      borderRadius: 20,
                      marginBottom: 8,
                    }}
                  >
                    {c.badge}
                  </span>
                  <p
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.45 }}
                  >
                    {c.title}
                  </p>
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>👍 12</span>
                    <span>💬 4</span>
                    <span>🔖 Save</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 20px 80px' }}>
        <h3
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          Everything your campus needs
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px', textAlign: 'center' }}>
          One platform for notes, news, competitions and connections.
        </p>
        <div className="h-scroll-grid">
          {features.map((f) => (
            <div
              key={f.title}
              className="card-hover"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '22px 24px',
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
            </div>
          ))}
        </div>
      </div>

      {/* Global — a separate community for everyone */}
      <div
        style={{
          background: 'var(--cyan-light)',
          borderTop: '1px solid var(--cyan-border)',
          padding: '64px 20px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--cyan)',
              color: 'var(--on-accent)',
              borderRadius: 20,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            🌐 Global
          </div>
          <h3
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 10px',
              letterSpacing: '-0.02em',
            }}
          >
            The Global Campus — a home for everyone
          </h3>
          <p
            style={{
              fontSize: 14.5,
              color: 'var(--text-secondary)',
              margin: '0 auto 28px',
              lineHeight: 1.65,
              maxWidth: 540,
            }}
          >
            Open to every student in India. Join the Global Campus today — hackathons, opportunities, notes and
            teammates from everywhere — and move to your own college campus the moment it goes live.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/global')}
              style={{
                background: 'var(--cyan)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 12,
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🌐 Open the Global feed
            </button>
            <button
              onClick={() => router.push('/communities')}
              style={{
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
                padding: '12px 24px',
                borderRadius: 12,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Browse Global Communities
            </button>
          </div>
        </div>
      </div>

      {/* Colleges — campus cards */}
      <div style={{ background: 'var(--bg-secondary)', padding: '60px 20px', textAlign: 'center' }}>
        <h3
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Built for every Indian college
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px' }}>
          {totalCampuses > 0
            ? `${totalCampuses} campus${totalCampuses !== 1 ? 'es' : ''} live across ${liveColleges.length} college${liveColleges.length !== 1 ? 's' : ''} — more join every week.`
            : 'Campuses go live every week — stay tuned for yours.'}
        </p>

        {liveColleges.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              justifyContent: 'center',
              maxWidth: 800,
              margin: '0 auto',
            }}
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ width: 240, height: 140, borderRadius: 16 }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
              maxWidth: 800,
              margin: '0 auto 32px',
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
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                  cursor: 'pointer',
                }}
                className="card-hover"
                onClick={() => router.push('/auth/signup')}
              >
                {/* College header */}
                <div
                  style={{
                    padding: '16px 18px 14px',
                    borderBottom: col.campuses.length > 1 ? '1px solid var(--border)' : 'none',
                    background:
                      idx % 3 === 0
                        ? 'var(--accent-light)'
                        : idx % 3 === 1
                          ? 'var(--purple-light)'
                          : 'var(--cyan-light)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: idx % 3 === 0 ? 'var(--accent)' : idx % 3 === 1 ? 'var(--purple)' : 'var(--cyan)',
                          color: 'var(--on-accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {col.name.charAt(0)}
                      </div>
                      <div>
                        <h4
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            margin: 0,
                            lineHeight: 1.3,
                          }}
                        >
                          {col.name}
                        </h4>
                        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {col.campuses.length} campus{col.campuses.length !== 1 ? 'es' : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: 'rgba(16,185,129,0.12)',
                        color: '#10b981',
                        padding: '3px 8px',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                      Live
                    </span>
                  </div>
                </div>

                {/* Campus list */}
                {col.campuses.length > 0 && (
                  <div style={{ padding: '10px 18px 14px' }}>
                    {col.campuses.map((campus, ci) => (
                      <div
                        key={campus}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 0',
                          borderBottom: ci < col.campuses.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background:
                              idx % 3 === 0 ? 'var(--accent)' : idx % 3 === 1 ? 'var(--purple)' : 'var(--cyan)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{campus}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Your college missing?{' '}
          <span
            style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => router.push('/auth/signup')}
          >
            Request it
          </span>{' '}
          — we&apos;ll bring it live for your campus.
        </p>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 20px' }}>
        <div
          className="landing-cta"
          style={{
            background: 'var(--accent)',
            borderRadius: 24,
            padding: '48px 40px',
            textAlign: 'center',
            boxShadow: 'var(--accent-glow)',
          }}
        >
          <h3
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--on-accent)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Ready to join?
          </h3>
          <p style={{ fontSize: 14, color: 'rgba(29,21,3,0.72)', margin: '0 0 24px' }}>
            Free forever for students. No credit card needed.
          </p>
          <button
            onClick={() => router.push('/auth/signup')}
            style={{
              background: 'var(--bg)',
              color: 'var(--accent)',
              border: 'none',
              padding: '13px 28px',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Create your account →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          ConnectToCampus is an independent student networking platform. Not affiliated with or endorsed by any
          educational institution.
        </p>
      </div>
    </div>
  )
}
