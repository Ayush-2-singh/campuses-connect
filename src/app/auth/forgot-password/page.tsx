'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/auth'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import { useRouter } from 'next/navigation'

const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) { setError('Please enter your email address.'); return }
    setLoading(true)
    setError('')
    const redirectUrl = new URL('/auth/callback', window.location.origin)
    redirectUrl.searchParams.set('next', '/auth/reset-password')
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: redirectUrl.toString() })
    setLoading(false)
    if (err) setError(getAuthErrorMessage(err.message))
    else setSent(true)
  }

  if (sent) return <div data-accent="gold" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><div style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 32, textAlign: 'center', boxShadow: 'var(--shadow)' }}><div style={{ fontSize: 52, marginBottom: 12 }}>📬</div><h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Check your email</h2><p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>If an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, we sent a secure reset link.</p><button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 14, fontFamily: 'inherit' }}>Try another email</button><div style={{ marginTop: 10 }}><Link href="/auth/login" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Back to login</Link></div></div></div>

  return <div data-accent="gold" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><div style={{ width: '100%', maxWidth: 400 }}><div style={{ marginBottom: 24 }}><BackButton onClick={() => router.push('/auth/login')} label="Back to login" /></div><div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, boxShadow: 'var(--shadow)' }}><div style={{ textAlign: 'center', marginBottom: 24 }}><div style={{ fontSize: 42, marginBottom: 10 }}>🔐</div><h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Forgot your password?</h2><p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>Enter your email and we will send you a secure reset link.</p></div>{error && <div role="alert" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}<form onSubmit={handleSend}><label htmlFor="forgot-email" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label><input id="forgot-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} autoComplete="email" required /><button type="submit" disabled={loading} style={{ width: '100%', background: loading ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 18, fontFamily: 'inherit' }}>{loading ? 'Sending...' : 'Send reset link'}</button></form></div></div></div>
}
