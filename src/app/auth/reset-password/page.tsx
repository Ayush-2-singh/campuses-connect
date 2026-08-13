'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import { useToast } from '@/components/Toast'

export default function ResetPasswordPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { show: toast } = useToast()
  const supabase = createClient()

  // Supabase recovery links carry the session in the URL hash (#access_token=…).
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token') || ''
    if (!accessToken) {
      setState('invalid')
      return
    }
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: err }) => {
        if (err) setState('invalid')
        else {
          setState('ready')
          window.history.replaceState({}, '', '/auth/reset-password')
        }
      })
  }, [])

  const handleSave = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      setError(err.message)
      toast(err.message, { tone: 'danger' })
    } else {
      toast('Password updated successfully', { tone: 'success' })
      router.push('/feed')
    }
  }

  const shell = (children: React.ReactNode) => (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 32, boxShadow: 'var(--shadow)' }}>
        {children}
      </div>
    </div>
  )

  if (state === 'loading') {
    return shell(
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>⏳</div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Checking your link…</p>
      </div>
    )
  }

  if (state === 'invalid') {
    return shell(
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔗</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Link invalid or expired</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
          This password-reset link isn&apos;t valid anymore. Request a fresh one and try again.
        </p>
        <Link href="/auth/forgot-password" style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Get a new link
        </Link>
      </div>
    )
  }

  return shell(
    <div>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 26 }}>🔐</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Set a new password</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Choose a strong password you haven&apos;t used before.</p>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', background: saving ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 20, fontFamily: 'inherit' }}
      >
        {saving ? 'Updating…' : 'Update password'}
      </button>
    </div>
  )
}
