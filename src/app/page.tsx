'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LandingPage() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUser(user) })
  }, [])

  const features = [
    { icon: '/feed-icon.jpeg', title: 'College Feed', desc: 'Announcements, events and discussions for your campus.' },
    { icon: '/opportunity-icon.jpeg', title: 'Global Communities', desc: 'DSA, Web Development and Startups — nationwide.' },
    { icon: '/notes-icon.jpeg', title: 'Notes & Resources', desc: 'Semester notes, PYQs and roadmaps from your peers.' },
    { icon: '/talent-icon.jpeg', title: 'Hackathons & Internships', desc: 'Opportunities posted by campus & community admins.' },
    { icon: '/teams-icon.jpeg', title: 'Clubs & Study Groups', desc: 'Find your crew and build together.' },
    { icon: '/more-icon.jpeg', title: 'Karma & Streaks', desc: 'Earn points and build daily habits.' },
  ]

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>

      {/* Nav */}
      <nav className="landing-nav" style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 20px', zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {user ? (
              <button onClick={() => router.push('/feed')}
                style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Go to Feed →
              </button>
            ) : (
              <>
                <button onClick={() => router.push('/auth/login')}
                  style={{ background: 'none', color: 'var(--text-secondary)', border: 'none', padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>
                  Sign in
                </button>
                <button onClick={() => router.push('/auth/signup')}
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Join Free
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="ambient" style={{ maxWidth: 720, margin: '0 auto', padding: '80px 20px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 20, padding: '5px 14px', fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 24 }}>
          🚀 Now live for PW IOI · Lucknow
        </div>
        <h2 className="landing-hero" style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 20px' }}>
          Your campus.<br /><span style={{ color: 'var(--accent)' }}>Connected.</span>
        </h2>
        <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 36px', maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
          The community platform for Computer Science students in Indian colleges — communities, campus life and opportunities.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/auth/signup')}
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '14px 28px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Join your campus →
          </button>
          <button onClick={() => router.push('/feed')}
            style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '14px 28px', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Browse feed
          </button>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {features.map(f => (
            <div key={f.title} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px' }}>
              <img src={f.icon} alt={f.title} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: '50%', marginBottom: 10, transition: 'transform 0.2s ease' }} onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')} onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Colleges */}
      <div style={{ background: 'var(--bg-secondary)', padding: '60px 20px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Growing across India</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px' }}>For CSE students. Starting with PW IOI, expanding to every college.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 600, margin: '0 auto' }}>
          {[
            { name: 'PW IOI', active: true },
            { name: 'IIT Delhi', active: false },
            { name: 'IIT Bombay', active: false },
            { name: 'NIT Trichy', active: false },
            { name: 'LPU', active: false },
            { name: 'AKTU Colleges', active: false },
          ].map(c => (
            <div key={c.name} style={{
              padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: c.active ? 'var(--accent-light)' : 'var(--bg)',
              border: c.active ? '1px solid var(--accent-border)' : '1px solid var(--border)',
              color: c.active ? 'var(--accent)' : 'var(--text-muted)'
            }}>
              {c.active ? '✅' : '��'} {c.name}
              {!c.active && <span style={{ fontSize: 11, marginLeft: 4, color: 'var(--text-muted)' }}>Soon</span>}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px' }}>
        <div className="landing-cta" style={{ background: 'var(--accent)', borderRadius: 20, padding: '48px 40px', textAlign: 'center' }}>
          <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--on-accent)', margin: '0 0 8px' }}>Ready to join?</h3>
          <p style={{ fontSize: 14, color: 'rgba(29,21,3,0.72)', margin: '0 0 24px' }}>Free forever for students. No credit card needed.</p>
          <button onClick={() => router.push('/auth/signup')}
            style={{ background: 'var(--bg)', color: 'var(--accent)', border: 'none', padding: '13px 28px', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
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
