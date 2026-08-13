'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import { useRouter } from 'next/navigation'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSend = async () => {
    if (!email) { setError('Please enter your email address'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  if (sent) return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 32, textAlign: 'center', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Check your email</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 6px', lineHeight: 1.6 }}>
          We sent a password-reset link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Click the link in the email to set a new password. The link expires in a few minutes.
        </p>
        <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 20, fontFamily: 'inherit' }}>
          Didn&apos;t get it? Try again
        </button>
        <div style={{ marginTop: 8 }}>
          <Link href="/auth/login" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>← Back to login</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 24 }}>
          <BackButton onClick={() => router.push('/auth/login')} label="Back to login" />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>🔑</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>Forgot your password?</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Enter your account email — we&apos;ll send you a link to set a new password.
          </p>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, boxShadow: 'var(--shadow)' }}>
          {error && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            autoComplete="email"
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            style={{ width: '100%', background: loading ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 16, fontFamily: 'inherit' }}
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
          Remembered it?{' '}
          <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
