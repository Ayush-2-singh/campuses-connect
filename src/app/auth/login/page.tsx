'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getSafeRedirect } from '@/lib/auth'
import { redirectToCanonicalOrigin } from '@/lib/canonical-origin'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import AuthShell from '@/components/auth/AuthShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // If this page is running on a non-canonical origin (e.g. apex
    // connecttocampus.com from a cached page), move to www first — auth
    // cookies are origin-scoped and the callback runs on www.
    if (redirectToCanonicalOrigin()) return
    const params = new URLSearchParams(window.location.search)
    const callbackError = params.get('error')
    if (!callbackError) return
    const rawDetail = params.get('ed') || ''
    const messages: Record<string, string> = {
      redirect_url_mismatch:
        'Google blocked the sign-in: this site\u2019s URL is not whitelisted in the OAuth settings. Try email instead.',
      invalid_request: 'Google sign-in request was invalid (OAuth configuration issue). Try email instead.',
      access_denied: 'Google sign-in was cancelled or denied. Please try again.',
      server_error: 'We could not complete Google sign-in. Please try again or use email.',
      oauth_failed: 'We could not complete Google sign-in. Please try again or use email.',
    }
    let msg = messages[callbackError] || 'We could not complete Google sign-in. Please try again or use email.'
    // "Unable to exchange external code" means Supabase could not trade the
    // Google authorization code for tokens — a provider config mismatch
    // (Client ID/Secret in Supabase, or the Supabase callback missing from
    // Google Console), NOT a transient failure. Show the exact fix instead of
    // a misleading "try again".
    if (/unable to exchange external code/i.test(rawDetail)) {
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
      const supabaseCallback = ref
        ? `https://${ref}.supabase.co/auth/v1/callback`
        : 'https://<project-ref>.supabase.co/auth/v1/callback'
      msg =
        'Google sign-in is misconfigured. In Supabase → Authentication → Providers → Google, re-paste the Client ID and Client Secret (no extra spaces). In Google Cloud Console, add the Authorized redirect URI: ' +
        supabaseCallback
    } else if (rawDetail) {
      // Debug aid while sign-in is being stabilised: show the provider's raw
      // reason so failures are diagnosable (no secrets are in these strings).
      msg += ` — Detail: ${rawDetail}`
    }
    setError(msg)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    if (err) {
      setError(getAuthErrorMessage(err.message))
      setLoading(false)
      return
    }
    router.refresh()
    const target = getSafeRedirect(new URLSearchParams(window.location.search).get('redirect'), '/colleges')
    router.replace(target)
  }

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in" subtitle="Continue to your campus hiring dashboard.">
      <GoogleSignInButton />
      <div className="au-divider">
        <span>or with email</span>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="au-error">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} noValidate>
        <div className="au-field">
          <div>
            <label className="au-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="au-input"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <Link href="/auth/forgot-password" className="au-link" style={{ fontSize: 12.5 }}>
                Forgot password?
              </Link>
            </div>
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
              inputClassName="au-input"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="au-submit">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="au-alt">
        Don&apos;t have an account? <Link href="/auth/signup">Sign up</Link>
      </p>
    </AuthShell>
  )
}
