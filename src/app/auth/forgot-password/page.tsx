'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/auth'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import { useRouter } from 'next/navigation'
import AuthShell from '@/components/auth/AuthShell'
import { Icon } from '@/components/icons'

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
    if (!normalizedEmail) {
      setError('Please enter your email address.')
      return
    }
    setLoading(true)
    setError('')
    const redirectUrl = new URL('/auth/callback', window.location.origin)
    redirectUrl.searchParams.set('next', '/auth/reset-password')
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: redirectUrl.toString(),
    })
    setLoading(false)
    if (err) setError(getAuthErrorMessage(err.message))
    else setSent(true)
  }

  if (sent)
    return (
      <AuthShell title="Check your email" subtitle="If the address is registered, a reset link is on its way.">
        <div className="au-state">
          <span className="au-state-ic">
            <Icon name="send" size={24} />
          </span>
          <p>
            If an account exists for <strong>{email}</strong>, we sent a secure reset link.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="au-link"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 650,
              marginTop: 14,
              padding: 0,
            }}
          >
            Try another email
          </button>
          <div style={{ marginTop: 10 }}>
            <Link href="/auth/login" className="au-link" style={{ fontSize: 14 }}>
              Back to login
            </Link>
          </div>
        </div>
      </AuthShell>
    )

  return (
    <AuthShell
      eyebrow="Reset access"
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a secure reset link."
    >
      <div style={{ marginBottom: 14 }}>
        <BackButton onClick={() => router.push('/auth/login')} label="Back to login" />
      </div>

      {error && (
        <div role="alert" className="au-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSend}>
        <label className="au-label" htmlFor="forgot-email">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="au-input"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={loading} className="au-submit">
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  )
}
