'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandName from '@/components/BrandName'
import { Icon } from '@/components/icons'

/**
 * HireLanding — the recruiter-first public storefront (Phase 1).
 *
 * Top of the funnel: a startup founder lands here, understands the offer in one
 * screen ("first batch of 10 pre-screened engineers free"), and submits the demo
 * request. Everything else in the product is downstream of this form.
 *
 * Premium pass (research-backed, 2026 SaaS patterns):
 *  - shows the REAL product (a sample batch/shortlist) instead of an abstract
 *    illustration — the pattern every high-converting SaaS page shares;
 *  - puts concrete proof in the first screen (the facts strip);
 *  - kills friction: one primary action, repeated in the sticky mobile bar;
 *  - styles come from hire-landing.css on the shared design tokens.
 *
 * Copy stays deliberately honest — no invented metrics, no fake logos. The only
 * numbers are the offer itself (10 students, free, once) and the process.
 */

const VALUE_PROPS = [
  {
    icon: 'shield',
    title: 'Pre-vetted, not just résumés',
    body: 'Every student has passed a verified coding assessment plus a GitHub / LeetCode skill check. You skip the screening round entirely.',
  },
  {
    icon: 'users',
    title: 'Tier-2/3 talent, un-tapped',
    body: 'We source from colleges the big platforms ignore — hungry engineers who are strong in fundamentals and affordable to hire.',
  },
  {
    icon: 'target',
    title: 'A shortlist, not a job board',
    body: 'You tell us the role. We send a matched batch of candidates ready to interview — not 500 applications to wade through.',
  },
]

const STEPS = [
  { n: '1', title: 'Tell us the role', body: 'Company, role, how many you are hiring. Thirty seconds.' },
  {
    n: '2',
    title: 'Get a batch of 10',
    body: 'Pre-screened candidates matched to your stack, with their verified signals attached.',
  },
  { n: '3', title: 'Interview & hire', body: 'You interview. Pay only when you hire one — no retainer, no lock-in.' },
]

const FACTS = [
  { num: '10', label: 'engineers in your first batch' },
  { num: '48h', label: 'from request to shortlist' },
  { num: '₹0', label: 'for that first batch' },
  { num: '2', label: 'signal checks per candidate' },
]

/** A realistic sample batch — the "show the product" hero visual. Labelled
 *  SAMPLE so it is never mistaken for a claim about real candidates. */
const SAMPLE_BATCH = [
  { name: 'Aarav S.', org: 'BBD University · Lucknow', score: '9.1', bar: 91 },
  { name: 'Diya M.', org: 'HBTU Kanpur · CSE', score: '8.6', bar: 86 },
  { name: 'Rohan K.', org: 'NIT Patna · IT', score: '8.2', bar: 82 },
]

const BATCH_CHIPS = ['Coding assessment', 'GitHub verified', 'LeetCode verified']

function initials(name: string) {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
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
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      {/* ── Nav ── */}
      <nav className="hl-nav">
        <div className="hl-wrap hl-nav-inner">
          <div className="hl-nav-brand">
            <BrandName />
          </div>
          <div className="hl-nav-links">
            <a className="hl-nav-link" href="#why">
              Why us
            </a>
            <a className="hl-nav-link" href="#how">
              How it works
            </a>
            <Link className="hl-nav-link" href="/about">
              About
            </Link>
          </div>
          <div className="hl-nav-right">
            <Link className="hl-nav-student" href="/auth/signup">
              I&apos;m a student
            </Link>
            <a className="hl-btn hl-btn--primary hl-btn--sm" href="#demo">
              Get free batch
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="hl-hero hl-wrap">
        <div className="hl-hero-grid">
          <div className="hl-hero-copy">
            <span className="hl-badge hl-rise">
              <span className="hl-badge-dot" />
              For startups hiring engineers
            </span>
            <h1 className="hl-h1 hl-rise hl-rise-2">
              Hire pre-vetted engineers <em className="grad-brand">without the screening mess.</em>
            </h1>
            <p className="hl-sub hl-rise hl-rise-3">
              We send you a shortlist of <strong>10 tier-2/3 students</strong> who have already passed a verified coding
              and skills assessment. <strong>Your first batch is free</strong> — pay only when you hire.
            </p>
            <div className="hl-cta-row hl-rise hl-rise-4">
              <a className="hl-btn hl-btn--primary hl-btn--lg" href="#demo">
                Get my free batch of 10
                <Icon name="chevron" size={17} className="hl-arrow" />
              </a>
              <a className="hl-btn hl-btn--ghost hl-btn--lg" href="#how">
                How it works
              </a>
            </div>
            <p className="hl-micro hl-rise hl-rise-4">
              <Icon name="check" size={14} />
              No retainer · No lock-in · Reply within 48 hours
            </p>
          </div>

          {/* Real product, not an illustration — a sample batch preview. */}
          <div className="hl-visual hl-rise hl-rise-3">
            <div className="hl-mock">
              <div className="hl-mock-head">
                <div className="hl-mock-title">
                  <Icon name="briefcase" size={15} />
                  <span>Backend Engineer (Node)</span>
                </div>
                <span className="hl-mock-tag">Sample</span>
              </div>
              <div className="hl-mock-rows">
                {SAMPLE_BATCH.map((c) => (
                  <div className="hl-cand" key={c.name}>
                    <span className="hl-cand-av">{initials(c.name)}</span>
                    <div className="hl-cand-main">
                      <p className="hl-cand-name">{c.name}</p>
                      <div className="hl-cand-meta">
                        <span>{c.org}</span>
                        <span className="hl-sig">
                          <Icon name="check" size={11} /> GitHub
                        </span>
                        <span className="hl-sig">
                          <Icon name="check" size={11} /> LeetCode
                        </span>
                      </div>
                    </div>
                    <div className="hl-cand-score">
                      <span className="hl-score-val">{c.score}</span>
                      <div className="hl-bar">
                        <div className="hl-bar-fill" style={{ width: `${c.bar}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hl-mock-foot">
                {BATCH_CHIPS.map((chip) => (
                  <span className="hl-chip" key={chip}>
                    <Icon name="check" size={11} />
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Proof strip — honest, concrete, above the fold. */}
        <div className="hl-facts">
          {FACTS.map((f) => (
            <div className="hl-fact" key={f.label}>
              <p className="hl-fact-num">{f.num}</p>
              <p className="hl-fact-label">{f.label}</p>
            </div>
          ))}
        </div>
      </header>

      {/* ── Value props ── */}
      <section id="why" className="hl-section hl-wrap">
        <p className="hl-eyebrow">Why founders use us</p>
        <h2 className="hl-h2">A hiring pipeline that does the screening for you.</h2>
        <p className="hl-lead">
          Hiring your first engineers is slow and noisy. We compress it: one message, one shortlist, one decision.
        </p>
        <div className="hl-props">
          {VALUE_PROPS.map((v) => (
            <div className="hl-prop" key={v.title}>
              <span className="hl-prop-icon">
                <Icon name={v.icon} size={21} />
              </span>
              <h3>{v.title}</h3>
              <p>{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="hl-section hl-wrap">
        <p className="hl-eyebrow">How it works</p>
        <h2 className="hl-h2">From brief to shortlist in three steps.</h2>
        <p className="hl-lead">No kickoff calls, no sourcing sprints. Tell us the role and we do the rest.</p>
        <div className="hl-steps">
          {STEPS.map((s) => (
            <div className="hl-step" key={s.n}>
              <span className="hl-step-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo form ── */}
      <section id="demo" className="hl-form-section hl-wrap">
        <div className="hl-card">
          {status === 'success' ? (
            <div className="hl-success">
              <h2>You&apos;re on the list ✅</h2>
              <p>
                We&apos;ll email <strong>{form.email}</strong> a batch of 10 pre-screened candidates within 48 hours.
              </p>
              <p>First batch is free — pay only when you hire.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="hl-form-title">Request your free batch of 10</h2>
              <p className="hl-form-sub">Takes 30 seconds. We reply within 48 hours.</p>

              <div className="hl-form-grid">
                <div>
                  <label className="hl-label" htmlFor="company">
                    Company *
                  </label>
                  <input id="company" className="hl-input" value={form.company} onChange={set('company')} required />
                </div>
                <div className="hl-row-2">
                  <div>
                    <label className="hl-label" htmlFor="contact_name">
                      Your name *
                    </label>
                    <input
                      id="contact_name"
                      className="hl-input"
                      value={form.contact_name}
                      onChange={set('contact_name')}
                      required
                    />
                  </div>
                  <div>
                    <label className="hl-label" htmlFor="email">
                      Work email *
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="hl-input"
                      value={form.email}
                      onChange={set('email')}
                      required
                    />
                  </div>
                </div>
                <div className="hl-row-3">
                  <div>
                    <label className="hl-label" htmlFor="role_title">
                      Role *
                    </label>
                    <input
                      id="role_title"
                      className="hl-input"
                      placeholder="e.g. Backend Engineer (Node)"
                      value={form.role_title}
                      onChange={set('role_title')}
                      required
                    />
                  </div>
                  <div>
                    <label className="hl-label" htmlFor="positions">
                      Openings
                    </label>
                    <input
                      id="positions"
                      type="number"
                      min={1}
                      className="hl-input"
                      value={form.positions}
                      onChange={set('positions')}
                    />
                  </div>
                </div>
                <div>
                  <label className="hl-label" htmlFor="notes">
                    Anything else?
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    className="hl-input"
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

                {status === 'error' && <p className="hl-err">{error}</p>}

                <button type="submit" disabled={status === 'submitting'} className="hl-btn hl-btn--primary hl-submit">
                  {status === 'submitting' ? 'Sending…' : 'Get my free batch of 10'}
                </button>
                <p className="hl-note">No retainer. No lock-in. Pay only when you hire.</p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="hl-footer hl-wrap">
        <div className="hl-footer-inner">
          <span>
            <BrandName /> · Hiring for campus engineers
          </span>
          <span className="hl-footer-links">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/refund">Refunds</Link>
          </span>
        </div>
      </footer>

      {/* ── Sticky mobile CTA — the primary action never scrolls away ── */}
      <div className="hl-mobilecta">
        <div className="hl-mobilecta-text">
          <strong>Free for your first batch</strong>
          10 pre-screened engineers
        </div>
        <a className="hl-btn hl-btn--primary" href="#demo">
          Get my batch
        </a>
      </div>
    </div>
  )
}
