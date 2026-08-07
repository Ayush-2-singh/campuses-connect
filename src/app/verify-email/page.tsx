'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

function VerifyInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setState('error'); setMessage('Missing verification token'); return }
    fetch('/api/verify-college-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) { setState('ok'); setMessage('College email verified! 🎉') }
        else { setState('error'); setMessage(res.error || 'Verification failed') }
      })
      .catch(() => { setState('error'); setMessage('Network error — try again') })
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 16, border: '1px solid var(--border)', padding: 32, textAlign: 'center', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>
          {state === 'loading' ? '⏳' : state === 'ok' ? '✅' : '❌'}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          {state === 'loading' ? 'Verifying...' : state === 'ok' ? 'Verified!' : 'Verification failed'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 20px' }}>{message}</p>
        {state !== 'loading' && (
          <button onClick={() => router.push('/profile')}
            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Go to Profile
          </button>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }} />}>
      <VerifyInner />
    </Suspense>
  )
}
