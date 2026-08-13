'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const [pulse, setPulse] = useState({ notes: 0, opportunities: 0, discussions: 0, hackathons: 0 })
  const [liveColleges, setLiveColleges] = useState<{ name: string; campuses: string[] }[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUser(user) })
  }, [])

  // Real colleges + campuses from the database — every campus is live now.
  useEffect(() => {
    supabase
      .from('colleges')
      .select('id, name, campuses!inner(name)')
      .eq('is_active', true)
      .eq('campuses.is_active', true)
      .then(({ data }) => {
        setLiveColleges((data || []).map((c: any) => ({
          name: c.name,
          campuses: (c.campuses || []).map((x: any) => x.name),
        })))
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
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('opp_type', 'hackathon').gte('deadline', now).lte('deadline', week),
      ])
      setPulse({ notes: notes.count || 0, opportunities: opps.count || 0, discussions: posts.count || 0, hackathons: hacks.count || 0 })
    })().catch(() => {})
  }, [])

  const features = [
    { icon: 'home', title: 'College Feed', desc: 'Announcements, events and discussions for your campus.' },
    { icon: 'globe', title: 'Global Feed', desc: 'Post and connect with students everywhere — no campus needed.' },
    { icon: 'users', title: 'Global Communities', desc: 'DSA, Web Development and Startups — nationwide, open to all.' },
    { icon: 'notebook', title: 'Notes & Resources', desc: 'Semester notes, PYQs and roadmaps from your peers.' },
    { icon: 'briefcase', title: 'Hackathons & Internships', desc: 'Opportunities posted by campus & community admins.' },
    { icon: 'star', title: 'Clubs & Study Groups', desc: 'Find your crew and build together.' },
    { icon: 'flame', title: 'Karma & Streaks', desc: 'Earn points and build daily habits.' },
  ]

  const totalCampuses = liveColleges.reduce((sum, c) => sum + c.campuses.length, 0)

  const stats = [
    { label: 'Notes & resources', value: pulse.notes },
    { label: 'Live opportunities', value: pulse.opportunities },
    { label: 'Discussions (all-India)', value: pulse.discussions },
    { label: 'Hackathons this week', value: pulse.hackathons },
  ]

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>

      {/* Nav */}
      <nav className="landing-nav" style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 20px', zIndex: 10 }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="grad" size={18} />
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => router.push('/global')}
              style={{ background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              🌐 Global
            </button>
            {user ? (
              <button onClick={() => router.push('/feed')}
                style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Go to Feed →
              </button>
            ) : (
              <>
                <button onClick={() => router.push('/auth/login')}
                  style={{ background: 'none', color: 'var(--text-secondary)', border: 'none', padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>
                  Sign in
                </button>
                <button onClick={() => router.push('/auth/signup')}
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 20, padding: '5px 14px', fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 22 }}>
              🌐 Join from any college — or connect globally
            </div>
            <h2 className="landing-hero" style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.12, color: 'var(--text-primary)', margin: '0 0 18px', letterSpacing: '-0.03em' }}>
              Every college.<br /><span style={{ color: 'var(--accent)' }}>One community.</span>
            </h2>
            <p style={{ fontSize: 17, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 30px', maxWidth: 480 }}>
              The community platform for Computer Science students across India — hackathons, opportunities, notes and a nationwide community. No campus required: your college isn&apos;t listed yet? Connect globally.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 34 }}>
              <button onClick={() => router.push('/auth/signup')}
                style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '14px 28px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--accent-glow)' }}>
                Join free — from any college →
              </button>
              <button onClick={() => router.push('/global')}
                style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', padding: '14px 28px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
                🌐 Explore the Global feed
              </button>
            </div>
            {/* Stats — real numbers from the database */}
            <div className="landing-stats">
              {stats.map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', margin: '0 0 2px' }}>{s.value}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.3 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div style={{ position: 'relative', width: 290, margin: '0 auto' }}>
            <div style={{ position: 'absolute', inset: -50, background: 'radial-gradient(circle, var(--accent-light), transparent 70%)', filter: 'blur(10px)' }} aria-hidden="true" />
            <div style={{ position: 'relative', border: '1px solid var(--border-strong)', borderRadius: 38, background: 'var(--bg)', padding: '12px 12px 18px', boxShadow: 'var(--shadow-lg)' }}>
              {/* phone header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 6px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Global Pulse</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Just now · All of India</div>
                </div>
                <Icon name="bell" size={14} />
              </div>
              {/* fake feed cards */}
              {[
                { badge: '📢 Announcement', title: 'Hackathon registrations open — 48 hours left!', bg: 'var(--orange-light)', text: 'var(--orange-text)' },
                { badge: '📚 Resource', title: 'DBMS PYQs (2022–2025) uploaded by a senior.', bg: 'var(--accent-light)', text: 'var(--accent-text)' },
                { badge: '⚡ DSA', title: 'Weekly contest #12 — solve 3 problems, win aura.', bg: 'var(--purple-light)', text: 'var(--purple-text)' },
              ].map((c, i) => (
                <div key={i} style={{ marginTop: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
                  <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 700, background: c.bg, color: c.text, padding: '2px 8px', borderRadius: 20, marginBottom: 8 }}>{c.badge}</span>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.45 }}>{c.title}</p>
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>👍 12</span><span>💬 4</span><span>🔖 Save</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 20px 80px' }}>
        <h3 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.02em' }}>Everything your campus needs</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px', textAlign: 'center' }}>One platform for notes, news, competitions and connections.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {features.map(f => (
            <div key={f.title} className="card-hover" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon name={f.icon} size={21} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Colleges — live today, more joining every week */}
      <div style={{ background: 'var(--bg-secondary)', padding: '60px 20px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Built for every Indian college</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          {totalCampuses > 0 ? `${totalCampuses} campuses are live for their students today — and every other college joins on the Global feed.` : 'Every college is welcome — join your campus when it goes live, or start on Global today.'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 28px', fontWeight: 600 }}>🌐 Not on this list? You&apos;re still in — join Global right now.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 720, margin: '0 auto 24px' }}>
          {liveColleges.length === 0 ? (
            <div className="skeleton" style={{ width: 260, height: 36, borderRadius: 20 }} />
          ) : liveColleges.map(col => (
            <div key={col.name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: 'var(--accent-light)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)'
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)' }} />
              <span style={{ fontWeight: 700 }}>{col.name}</span>
              {col.campuses.length > 0 && (
                <span style={{ color: 'var(--accent-text)', fontSize: 12 }}>· {col.campuses.join(' · ')}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Live</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Your college missing? <span style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push('/auth/signup')}>Request it</span> — or join the Global feed now.
        </p>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 20px' }}>
        <div className="landing-cta" style={{ background: 'var(--accent)', borderRadius: 24, padding: '48px 40px', textAlign: 'center', boxShadow: 'var(--accent-glow)' }}>
          <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--on-accent)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Ready to join?</h3>
          <p style={{ fontSize: 14, color: 'rgba(29,21,3,0.72)', margin: '0 0 24px' }}>Free forever for students. No credit card needed.</p>
          <button onClick={() => router.push('/auth/signup')}
            style={{ background: 'var(--bg)', color: 'var(--accent)', border: 'none', padding: '13px 28px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Create your account →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          CampusConnect is an independent student networking platform. Not affiliated with or endorsed by any educational institution.
        </p>
      </div>
    </div>
  )
}
