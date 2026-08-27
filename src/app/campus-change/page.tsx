'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const STATUS_CONFIG: Record<string, { color: string; bg: string; emoji: string }> = {
  pending: { color: 'var(--yellow-text)', bg: 'var(--yellow-light, #fef3c7)', emoji: '⏳' },
  approved: { color: 'var(--success-text)', bg: 'var(--success-light)', emoji: '✅' },
  rejected: { color: 'var(--danger)', bg: 'var(--danger-light)', emoji: '❌' },
  cancelled: { color: 'var(--text-muted)', bg: 'var(--bg-secondary)', emoji: '↩️' },
}

export default function CampusChangePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [campuses, setCampuses] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [cooldown, setCooldown] = useState<any>(null)
  const [currentCampus, setCurrentCampus] = useState<any>(null)

  // Form state
  const [selectedCampus, setSelectedCampus] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [collegeEmail, setCollegeEmail] = useState('')
  const [reason, setReason] = useState('')
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const [idCardPreview, setIdCardPreview] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/auth/login?redirect=/campus-change'); return }
      setUser(authUser)

      const { data: prof } = await supabase.from('profiles').select('*, campuses(name, slug)').eq('id', authUser.id).single()
      setProfile(prof)
      setCurrentCampus(prof?.campuses)

      const res = await fetch('/api/campus-change')
      if (res.ok) {
        const data = await res.json()
        setCooldown(data.cooldown)
        setRequests(data.requests)
        setCampuses(data.campuses)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      setError('ID card must be JPEG, PNG, WebP, or PDF')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ID card must be under 5MB')
      return
    }

    setIdCardFile(file)
    setError('')

    // Preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setIdCardPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setIdCardPreview('')
    }
  }

  const submitRequest = async () => {
    if (!selectedCampus) { setError('Please select a campus'); return }
    if (!idCardFile) { setError('Please upload your college ID card'); return }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('requested_campus_id', selectedCampus)
      formData.append('id_card', idCardFile)
      if (rollNumber) formData.append('roll_number', rollNumber)
      if (collegeEmail) formData.append('college_email', collegeEmail)
      if (reason) formData.append('reason', reason)

      const res = await fetch('/api/campus-change', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Campus change request submitted! Admin will review your ID card within 24-48 hours.')
      setShowForm(false)
      setSelectedCampus('')
      setRollNumber('')
      setCollegeEmail('')
      setReason('')
      setIdCardFile(null)
      setIdCardPreview('')

      // Reload requests
      const r2 = await fetch('/api/campus-change')
      if (r2.ok) {
        const d = await r2.json()
        setRequests(d.requests)
        setCooldown(d.cooldown)
      }
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const cancelRequest = async (requestId: string) => {
    if (!confirm('Cancel this campus change request?')) return
    try {
      await fetch('/api/campus-change', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, action: 'cancel' }),
        credentials: 'include',
      })
      // Reload
      const r = await fetch('/api/campus-change')
      if (r.ok) {
        const d = await r.json()
        setRequests(d.requests)
        setCooldown(d.cooldown)
      }
    } catch { /* ignore */ }
  }

  const canRequest = cooldown?.can_request !== false

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🏫 Change Campus</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Switch to a different campus by verifying your identity
        </p>

        {/* Current campus */}
        {currentCampus && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>Current Campus</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📍 {currentCampus.name}
            </p>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'var(--success-light)', border: '1px solid var(--success-border, #16a34a33)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--success-text)', marginBottom: 16 }}>
            ✅ {success}
          </div>
        )}

        {/* Cooldown warning */}
        {!canRequest && cooldown && (
          <div style={{ background: 'var(--yellow-light, #fef3c7)', border: '1px solid #fbbf24', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '0 0 4px' }}>⏳ Cooldown Active</p>
            <p style={{ fontSize: 12, color: '#78350f', margin: 0 }}>{cooldown.reason}</p>
          </div>
        )}

        {/* Request button */}
        {canRequest && !showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ width: '100%', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20 }}>
            🏫 Request Campus Change
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div style={{ background: 'var(--bg)', border: '2px solid var(--accent)', borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>📝 Campus Change Request</h3>

            {/* Campus selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Select New Campus *</label>
              <select value={selectedCampus} onChange={e => setSelectedCampus(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="">Choose campus...</option>
                {campuses.filter((c: any) => c.id !== profile?.campus_id).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ''}</option>
                ))}
              </select>
            </div>

            {/* ID Card Upload */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>College ID Card * (JPEG, PNG, WebP, PDF — max 5MB)</label>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', padding: '16px', border: '2px dashed var(--border)', borderRadius: 12, background: 'var(--bg-secondary)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                {idCardFile ? (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--success-text)', margin: '0 0 4px' }}>✅ {idCardFile.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{(idCardFile.size / 1024).toFixed(0)} KB — Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>📤</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 2px' }}>Upload your College ID Card</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Clear photo of front side</p>
                  </div>
                )}
              </button>
              {/* Preview */}
              {idCardPreview && (
                <div style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={idCardPreview} alt="ID Card preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: 'var(--bg-secondary)' }} />
                </div>
              )}
            </div>

            {/* Roll number & email */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Roll Number (optional)</label>
                <input value={rollNumber} onChange={e => setRollNumber(e.target.value)} placeholder="e.g. 2021001"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>College Email (optional)</label>
                <input value={collegeEmail} onChange={e => setCollegeEmail(e.target.value)} placeholder="you@college.edu" type="email"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              </div>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you want to change campus?" rows={2}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            </div>

            {/* Info */}
            <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: 'var(--accent-text)', margin: 0, lineHeight: 1.6 }}>
                📋 <strong>How it works:</strong> Upload your college ID card → Admin verifies → Campus changes automatically.
                Cooldown: 30 days between changes. Max 3 changes per year.
              </p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => { setShowForm(false); setError('') }}
                style={{ flex: 1, minWidth: 100, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={submitRequest} disabled={submitting}
                style={{ flex: 2, minWidth: 160, padding: '10px', borderRadius: 10, border: 'none', background: submitting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {submitting ? '⏳ Submitting...' : '📤 Submit Request'}
              </button>
            </div>
          </div>
        )}

        {/* Request history */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : requests.length > 0 ? (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px' }}>📋 Your Requests</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {requests.map((req: any) => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
                const fromCampus = req.campuses?.name || 'Unknown'
                const toCampus = req['campuses']?.name || 'Unknown'
                return (
                  <div key={req.id}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                        {cfg.emoji} {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                      {fromCampus} → <strong>{toCampus}</strong>
                    </p>
                    {req.rejection_reason && (
                      <p style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 0' }}>
                        ❌ {req.rejection_reason}
                      </p>
                    )}
                    {req.ai_verification_score > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        🤖 AI Score: {req.ai_verification_score}/100 — {req.ai_verification_notes}
                      </p>
                    )}
                    {req.status === 'pending' && (
                      <button onClick={() => cancelRequest(req.id)}
                        style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ↩️ Cancel Request
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>🏫</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No campus change requests</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Switch campuses by verifying your college ID card</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
