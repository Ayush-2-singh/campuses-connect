'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getPasswordError, getSafeRedirect } from '@/lib/auth'
import { redirectToCanonicalOrigin } from '@/lib/canonical-origin'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import AuthShell from '@/components/auth/AuthShell'
import { Icon } from '@/components/icons'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Origin-scoped auth cookies: start the flow on www (canonical) always.
    if (redirectToCanonicalOrigin()) return
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = fullName.trim()
    if (!normalizedName || !normalizedEmail || !password) {
      setError('Please fill in all fields.')
      return
    }
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setLoading(true)
    setError('')
    const redirectPath = getSafeRedirect(new URLSearchParams(window.location.search).get('redirect'), '/onboarding')
    const emailRedirectTo = new URL('/auth/callback', window.location.origin)
    emailRedirectTo.searchParams.set('next', redirectPath)
    const { data, error: err } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: normalizedName }, emailRedirectTo: emailRedirectTo.toString() },
    })
    if (err) {
      setError(getAuthErrorMessage(err.message))
      setLoading(false)
      return
    }
    if (data.session) {
      router.refresh()
      router.replace(redirectPath)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success)
    return (
      <AuthShell title="Check your email" subtitle="One more step to activate your account.">
        <div className="au-state">
          <span className="au-state-ic">
            <Icon name="send" size={24} />
          </span>
          <p>
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p>Click the link to activate your account. You will be taken back to finish setup.</p>
          <Link
            href="/auth/login"
            className="au-submit"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
          >
            Back to login
          </Link>
        </div>
      </AuthShell>
    )

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="Free for students — set up your profile in under two minutes."
    >
      <GoogleSignInButton label="Sign up with Google" />
      <div className="au-divider">
        <span>or with email</span>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="au-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} noValidate>
        <div className="au-field">
          <div>
            <label className="au-label" htmlFor="signup-name">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="au-input"
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label className="au-label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="au-input"
              autoComplete="email"
              required
            />
          </div>
          <PasswordField
            value={password}
            onChange={setPassword}
            placeholder="8+ characters"
            autoComplete="new-password"
            inputClassName="au-input"
          />
        </div>
        <p className="au-note">Use 8+ characters with uppercase, lowercase, and a number.</p>
        <button type="submit" disabled={loading} className="au-submit">
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="au-alt">
        Already have an account? <Link href="/auth/login">Sign in</Link>
      </p>
    </AuthShell>
  )
}
