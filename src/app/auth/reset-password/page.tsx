'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getPasswordError } from '@/lib/auth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import { useToast } from '@/components/Toast'
import AuthShell from '@/components/auth/AuthShell'
import { Icon } from '@/components/icons'

export default function ResetPasswordPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { show: toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    let active = true
    const initialize = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      if (accessToken) {
        const refreshToken = hash.get('refresh_token') || ''
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (sessionError) {
          if (active) setState('invalid')
          return
        }
        window.history.replaceState({}, '', '/auth/reset-password')
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (active) setState(session ? 'ready' : 'invalid')
    }
    initialize()
    return () => {
      active = false
    }
  }, [supabase])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      setError(getAuthErrorMessage(err.message))
      toast(getAuthErrorMessage(err.message), { tone: 'danger' })
      return
    }
    toast('Password updated successfully.', { tone: 'success' })
    router.replace('/colleges')
    router.refresh()
  }

  if (state === 'loading')
    return (
      <AuthShell title="Checking your link" subtitle="Hold on a moment while we verify your secure link.">
        <div className="au-state">
          <span className="au-state-ic">
            <Icon name="clock" size={24} />
          </span>
          <p>Verifying your reset link…</p>
        </div>
      </AuthShell>
    )

  if (state === 'invalid')
    return (
      <AuthShell
        title="Link invalid or expired"
        subtitle="This reset link can only be used once, and it expires quickly."
      >
        <div className="au-state">
          <span className="au-state-ic">
            <Icon name="alert" size={24} />
          </span>
          <p>Request a fresh password-reset link and try again.</p>
          <Link
            href="/auth/forgot-password"
            className="au-submit"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
          >
            Get a new link
          </Link>
        </div>
      </AuthShell>
    )

  return (
    <AuthShell
      eyebrow="Almost done"
      title="Set a new password"
      subtitle="Use 8+ characters with uppercase, lowercase, and a number."
    >
      {error && (
        <div role="alert" className="au-error">
          {error}
        </div>
      )}
      <form onSubmit={handleSave}>
        <div className="au-field">
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            placeholder="8+ characters"
            autoComplete="new-password"
            inputClassName="au-input"
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            inputClassName="au-input"
          />
        </div>
        <button type="submit" disabled={saving} className="au-submit">
          {saving ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}
