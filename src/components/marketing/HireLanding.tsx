'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandName from '@/components/BrandName'

/**
 * HireLanding — the recruiter-first public storefront (Phase 1).
 *
 * Top of the funnel: a startup founder lands here, understands the offer in one
 * screen ("first batch of 10 pre-screened engineers free"), and submits the demo
 * request. Everything else in the product is downstream of this form.
 *
 * Copy is deliberately honest — no invented metrics, no fake logos. The only
 * numbers are the offer itself (10 students, free, once).
 */

const VALUE_PROPS = [
  {
    title: 'Pre-vetted, not just résumés',
    body: 'Every student has passed a verified coding assessment plus a GitHub / LeetCode skill check. You skip the screening round entirely.',
  },
  {
    title: 'Tier-2/3 talent, un-tapped',
    body: 'We source from colleges the big platforms ignore — hungry engineers who are strong in fundamentals and affordable to hire.',
  },
  {
    title: 'A shortlist, not a job board',
    body: 'You tell us the role. We send a matched batch of candidates ready to interview — not 500 applications to wade through.',
  },
]

const STEPS = [
  { n: '1', title: 'Tell us the role', body: 'Company, role, how many you are hiring.' },
  {
    n: '2',
    title: 'Get a batch of 10',
    body: 'Pre-screened candidates matched to your stack. Free for your first batch.',
  },
  { n: '3', title: 'Interview & hire', body: 'You interview. Pay only when you hire one — no retainer, no lock-in.' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

export default function HireLanding() {
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

  return (
    <div style={{ minHeight: 'var(--app-vh)', background: 'var(--bg)', color: 'var(--text-primary)' }}>
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 1040,
          margin: '0 auto',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
          <BrandName />
        </div>
        <Link
          href="/auth/signup"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          I&apos;m a student →
        </Link>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px 24px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--accent-text)',
            background: 'var(--accent-light)',
            padding: '5px 11px',
            borderRadius: 999,
            marginBottom: 18,
          }}
        >
          For startups hiring engineers
        </span>
        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            lineHeight: 1.08,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 18px',
            maxWidth: 760,
          }}
        >
          Hire pre-vetted final-year engineers — without the screening mess.
        </h1>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: 'var(--text-secondary)',
            maxWidth: 620,
            margin: '0 0 28px',
          }}
        >
          We send you a shortlist of <strong>10 tier-2/3 students</strong> who have already passed a verified coding +
          skills assessment. <strong>Your first batch is free.</strong> Pay only when you hire.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="#demo"
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              padding: '13px 22px',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
            }}
          >
            Get my free batch of 10
          </a>
          <a
            href="#how"
            style={{
              display: 'inline-block',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: 15,
              padding: '13px 22px',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
            }}
          >
            How it works
          </a>
        </div>
      </section>

      {/* ── Value props ── */}
      <section
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '20px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {VALUE_PROPS.map((v) => (
          <div
            key={v.title}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>{v.title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{v.body}</p>
          </div>
        ))}
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 20px 8px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 22px' }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 12 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  fontWeight: 800,
                  fontSize: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {s.n}
              </span>
              <div>
                <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: '3px 0 4px' }}>{s.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo form ── */}
      <section id="demo" style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px' }}>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            padding: 'clamp(20px, 4vw, 32px)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>You&apos;re on the list ✅</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                We&apos;ll email <strong>{form.email}</strong> a batch of 10 pre-screened candidates within 48 hours.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                First batch is free — pay only when you hire.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Request your free batch of 10</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
                Takes 30 seconds. We reply within 48 hours.
              </p>

              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label style={labelStyle} htmlFor="company">
                    Company *
                  </label>
                  <input id="company" style={inputStyle} value={form.company} onChange={set('company')} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle} htmlFor="contact_name">
                      Your name *
                    </label>
                    <input
                      id="contact_name"
                      style={inputStyle}
                      value={form.contact_name}
                      onChange={set('contact_name')}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="email">
                      Work email *
                    </label>
                    <input
                      id="email"
                      type="email"
                      style={inputStyle}
                      value={form.email}
                      onChange={set('email')}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle} htmlFor="role_title">
                      Role *
                    </label>
                    <input
                      id="role_title"
                      style={inputStyle}
                      placeholder="e.g. Backend Engineer (Node)"
                      value={form.role_title}
                      onChange={set('role_title')}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="positions">
                      Openings
                    </label>
                    <input
                      id="positions"
                      type="number"
                      min={1}
                      style={inputStyle}
                      value={form.positions}
                      onChange={set('positions')}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="notes">
                    Anything else?
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                    placeholder="Tech stack, location, budget range…"
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
                  style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
                />

                {status === 'error' && (
                  <p style={{ fontSize: 13, color: 'var(--danger, #e5484d)', margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  style={{
                    width: '100%',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 15,
                    padding: '13px 20px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: status === 'submitting' ? 'default' : 'pointer',
                    opacity: status === 'submitting' ? 0.7 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {status === 'submitting' ? 'Sending…' : 'Get my free batch of 10'}
                </button>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                  No retainer. No lock-in. Pay only when you hire.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '22px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          <BrandName /> ·{' '}
          <Link href="/about" style={{ color: 'var(--text-muted)' }}>
            About
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" style={{ color: 'var(--text-muted)' }}>
            Privacy
          </Link>{' '}
          ·{' '}
          <Link href="/terms" style={{ color: 'var(--text-muted)' }}>
            Terms
          </Link>
        </p>
      </footer>
    </div>
  )
}
