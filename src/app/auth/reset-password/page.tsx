'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getPasswordError } from '@/lib/auth'
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

  useEffect(() => {
    let active = true
    const initialize = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      if (accessToken) {
        const refreshToken = hash.get('refresh_token') || ''
        const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionError) { if (active) setState('invalid'); return }
        window.history.replaceState({}, '', '/auth/reset-password')
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (active) setState(session ? 'ready' : 'invalid')
    }
    initialize()
    return () => { active = false }
  }, [supabase])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const passwordError = getPasswordError(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(getAuthErrorMessage(err.message)); toast(getAuthErrorMessage(err.message), { tone: 'danger' }); return }
    toast('Password updated successfully.', { tone: 'success' })
    router.replace('/feed')
    router.refresh()
  }

  const shell = (children: React.ReactNode) => <div data-accent="gold" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><div style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 32, boxShadow: 'var(--shadow)' }}>{children}</div></div>
  if (state === 'loading') return shell(<div style={{ textAlign: 'center' }}><div style={{ fontSize: 52, marginBottom: 12 }}>⏳</div><p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Checking your secure link...</p></div>)
  if (state === 'invalid') return shell(<div style={{ textAlign: 'center' }}><div style={{ fontSize: 52, marginBottom: 12 }}>🔗</div><h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Link invalid or expired</h2><p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>Request a fresh password-reset link and try again.</p><Link href="/auth/forgot-password" style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Get a new link</Link></div>)
  return shell(<div><div style={{ textAlign: 'center', marginBottom: 20 }}><div style={{ fontSize: 42, marginBottom: 10 }}>🔐</div><h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Set a new password</h2><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Use 8+ characters with uppercase, lowercase, and a number.</p></div>{error && <div role="alert" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}<form onSubmit={handleSave}><div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><PasswordField label="New password" value={password} onChange={setPassword} placeholder="8+ characters" autoComplete="new-password" /><PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" autoComplete="new-password" /></div><button type="submit" disabled={saving} style={{ width: '100%', background: saving ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 20, fontFamily: 'inherit' }}>{saving ? 'Updating...' : 'Update password'}</button></form></div>)
}
