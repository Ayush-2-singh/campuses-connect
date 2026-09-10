'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/**
 * Guest entry: type your name → pick your campus → you're in.
 * Uses Supabase anonymous sign-in so guests get a REAL session
 * (RLS, profiles, karma, compete all work). Google OAuth stays
 * fully intact on the existing login/signup pages.
 *
 * Requires the dashboard toggle: Authentication → Anonymous sign-ins → ON
 * (see supabase/migrations/039_guest_entry.sql).
 */
export default function GuestEntry({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [fullName, setFullName] = useState('')
  const [colleges, setColleges] = useState<any[]>([])
  const [campuses, setCampuses] = useState<any[]>([])
  const [collegeId, setCollegeId] = useState('')
  const [campusId, setCampusId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('colleges')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => setColleges(data || []))
  }, [supabase])

  useEffect(() => {
    if (!collegeId) return setCampuses([])
    supabase
      .from('campuses')
      .select('*')
      .eq('college_id', collegeId)
      .then(({ data }) => setCampuses(data || []))
  }, [collegeId, supabase])

  const enter = async () => {
    if (!fullName.trim()) return setError('Please enter your name')
    setLoading(true)
    setError('')

    // Anonymous sign-in — no email, no password, no Google.
    const { error: authError } = await supabase.auth.signInAnonymously({
      options: { data: { full_name: fullName.trim() } },
    })
    if (authError) {
      setError('Guest entry is not enabled yet. Ask the admin to turn on Anonymous sign-ins in the Supabase dashboard.')
      setLoading(false)
      return
    }

    // Attach the chosen campus to the freshly created profile (own row — allowed by RLS).
    if (collegeId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ college_id: collegeId, campus_id: campusId || null })
          .eq('id', user.id)
      }
    }

    // ?guest=1 makes onboarding skip straight to the Profile step.
    router.replace('/onboarding?guest=1')
  }

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--bg)',
    boxSizing: 'border-box' as const,
  }

  const selectStyle = { ...inputStyle, appearance: 'none' as const }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Enter as guest"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 380,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>👋</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {step === 0 ? 'What should we call you?' : 'Choose your campus'}
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
            {step === 0 ? 'No email, no password. Just your name.' : 'Your feed is tuned to your campus.'}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--danger-light)',
              border: '1px solid var(--danger-border)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 12.5,
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        {step === 0 ? (
          <input
            autoFocus
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
            placeholder="Your name"
            style={inputStyle}
            autoComplete="name"
            aria-label="Your name"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select
              value={collegeId}
              onChange={(e) => {
                setCollegeId(e.target.value)
                setCampusId('')
              }}
              style={selectStyle}
              aria-label="College"
            >
              <option value="">Select your college…</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {collegeId && campuses.length > 0 && (
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                style={selectStyle}
                aria-label="Campus"
              >
                <option value="">Select your campus…</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                setCollegeId('')
                setCampusId('')
                enter()
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              My college is not listed — join globally
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {step === 1 && (
            <button
              onClick={() => setStep(0)}
              style={{
                flex: 1,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '11px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Back
            </button>
          )}
          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              disabled={!fullName.trim()}
              style={{
                flex: 1,
                background: !fullName.trim() ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '11px',
                fontSize: 14,
                fontWeight: 700,
                cursor: !fullName.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={enter}
              disabled={loading || !collegeId}
              style={{
                flex: 1,
                background: loading || !collegeId ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '11px',
                fontSize: 14,
                fontWeight: 700,
                cursor: loading || !collegeId ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Entering…' : 'Start now 🚀'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
