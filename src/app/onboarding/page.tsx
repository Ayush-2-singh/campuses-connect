'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const STEPS = ['College', 'Campus', 'Department', 'Profile']

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [colleges, setColleges] = useState<any[]>([])
  const [campuses, setCampuses] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [selected, setSelected] = useState({ college_id: '', campus_id: '', department_id: '', current_year: '', batch_year: '', username: '', bio: '', college_email: '' })
  const [q, setQ] = useState({ college: '', campus: '', department: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestName, setRequestName] = useState('')
  const [requestCity, setRequestCity] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('colleges').select('*').eq('is_active', true).then(({ data }) => setColleges(data || []))
  }, [])

  useEffect(() => {
    if (selected.college_id) supabase.from('campuses').select('*').eq('college_id', selected.college_id).then(({ data }) => setCampuses(data || []))
  }, [selected.college_id])

  useEffect(() => {
    if (selected.campus_id) supabase.from('departments').select('*').eq('campus_id', selected.campus_id).then(({ data }) => setDepartments(data || []))
  }, [selected.campus_id])

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)

  // No college listed → skip straight to the Profile step and join globally.
  const joinGlobally = () => {
    setSelected(s => ({ ...s, college_id: '', campus_id: '', department_id: '' }))
    setStep(3)
  }

  const requestCollege = async () => {
    if (!requestName.trim() || requesting) return
    setRequesting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('college_requests').insert({
      name: requestName.trim(),
      city: requestCity.trim() || null,
      requested_by: user?.id || null,
    })
    setRequesting(false)
    setRequestSent(true)
  }

  const filteredColleges = colleges.filter(c => c.name.toLowerCase().includes(q.college.toLowerCase()))
  const filteredCampuses = campuses.filter(c => c.name.toLowerCase().includes(q.campus.toLowerCase()))
  const filteredDepartments = departments.filter(d => (d.name + ' ' + d.short_name).toLowerCase().includes(q.department.toLowerCase()))

  const handleFinish = async () => {
    if (!selected.username.trim()) { setError('Username is required'); return }
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { error } = await supabase.from('profiles').update({
      college_id: selected.college_id || null,
      campus_id: selected.campus_id || null,
      department_id: selected.department_id || null,
      username: selected.username.trim(),
      bio: selected.bio.trim() || null,
      college_email: selected.college_email.trim() || null,
      current_year: selected.current_year ? parseInt(selected.current_year) : null,
      batch_year: selected.batch_year ? parseInt(selected.batch_year) : null,
    }).eq('id', user.id)
    if (error) { setError(error.message); setLoading(false) }
    // No campus → land on Global so the user is never stuck with nothing to see.
    else router.push(selected.campus_id ? '/feed' : '/global')
  }

  const cardStyle = (active: boolean) => ({
    width: '100%', textAlign: 'left' as const, padding: '12px 16px', borderRadius: 10,
    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 14,
    color: active ? 'var(--accent)' : 'var(--text-primary)', fontWeight: active ? 600 : 400,
    transition: 'all 0.15s'
  })

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const
  }

  const btnPrimary = (disabled?: boolean) => ({
    flex: 1, background: disabled ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)',
    border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
  })

  const btnSecondary = {
    flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '12px',
    fontSize: 14, cursor: 'pointer', fontFamily: 'inherit'
  }

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Let&apos;s set up your profile</p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--border)', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, boxShadow: 'var(--shadow)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{STEPS[step]}</h2>

          {error && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', margin: '12px 0', fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {step === 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Select your college — or join globally from anywhere</p>
              <input
                type="text"
                value={q.college}
                onChange={e => setQ(s => ({ ...s, college: e.target.value }))}
                placeholder="Search your college…"
                style={{ ...inputStyle, marginBottom: 10 }}
                autoComplete="off"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {filteredColleges.map(c => (
                  <button key={c.id} onClick={() => setSelected(s => ({ ...s, college_id: c.id }))} style={cardStyle(selected.college_id === c.id)}>
                    {c.name}
                  </button>
                ))}
                {filteredColleges.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No colleges match “{q.college}”. Clear the search or join globally below.</p>
                )}
              </div>
              <button disabled={!selected.college_id} onClick={next} style={{ ...btnPrimary(!selected.college_id), width: '100%', marginTop: 14 }}>
                Continue
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <button
                onClick={joinGlobally}
                style={{ width: '100%', textAlign: 'center', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                🌐 My college isn&apos;t listed — Join globally
              </button>

              {!requestSent ? (
                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <button onClick={() => setRequestOpen(o => !o)} style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                    Can&apos;t find it? Request your college
                  </button>
                  {requestOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, textAlign: 'left' }}>
                      <input type="text" value={requestName} onChange={e => setRequestName(e.target.value)} placeholder="College name *" style={inputStyle} />
                      <input type="text" value={requestCity} onChange={e => setRequestCity(e.target.value)} placeholder="City (optional)" style={inputStyle} />
                      <button onClick={requestCollege} disabled={!requestName.trim() || requesting} style={{ ...btnPrimary(!requestName.trim() || requesting), width: '100%' }}>
                        {requesting ? 'Sending…' : 'Request college'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--success-text)', textAlign: 'center', marginTop: 12 }}>
                  ✓ Request sent — we&apos;ll add your college soon!
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Select your campus</p>
              <input
                type="text"
                value={q.campus}
                onChange={e => setQ(s => ({ ...s, campus: e.target.value }))}
                placeholder="Search campus…"
                style={{ ...inputStyle, marginBottom: 10 }}
                autoComplete="off"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {filteredCampuses.map(c => (
                  <button key={c.id} onClick={() => setSelected(s => ({ ...s, campus_id: c.id }))}
                    style={cardStyle(selected.campus_id === c.id)}>
                    {c.name}
                  </button>
                ))}
                {filteredCampuses.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No campuses match “{q.campus}”. Clear the search to see the full list.</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={back} style={btnSecondary}>Back</button>
                <button disabled={!selected.campus_id} onClick={next} style={btnPrimary(!selected.campus_id)}>Continue</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Select your department</p>
              <input
                type="text"
                value={q.department}
                onChange={e => setQ(s => ({ ...s, department: e.target.value }))}
                placeholder="Search department…"
                style={{ ...inputStyle, marginBottom: 10 }}
                autoComplete="off"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 260, overflowY: 'auto' }}>
                {filteredDepartments.map(d => (
                  <button key={d.id} onClick={() => setSelected(s => ({ ...s, department_id: d.id }))} style={cardStyle(selected.department_id === d.id)}>
                    <span style={{ fontWeight: 600 }}>{d.short_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{d.name}</span>
                  </button>
                ))}
                {filteredDepartments.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No departments match “{q.department}”. Clear the search to see the full list.</p>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Current Year</label>
                  <select value={selected.current_year} onChange={e => setSelected(s => ({ ...s, current_year: e.target.value }))}
                    style={{ ...inputStyle, padding: '10px 12px' }}>
                    <option value="">Select</option>
                    {[1,2,3,4].map(y => <option key={y} value={y}>{y === 1 ? '1st' : y === 2 ? '2nd' : y === 3 ? '3rd' : '4th'} Year</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Batch Year</label>
                  <select value={selected.batch_year} onChange={e => setSelected(s => ({ ...s, batch_year: e.target.value }))}
                    style={{ ...inputStyle, padding: '10px 12px' }}>
                    <option value="">Select</option>
                    {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={back} style={btnSecondary}>Back</button>
                <button disabled={!selected.department_id || !selected.current_year || !selected.batch_year} onClick={next}
                  style={btnPrimary(!selected.department_id || !selected.current_year || !selected.batch_year)}>Continue</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Username <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
                  <span style={{ padding: '11px 0 11px 14px', fontSize: 14, color: 'var(--text-muted)' }}>@</span>
                  <input type="text" value={selected.username}
                    onChange={e => setSelected(s => ({ ...s, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="yourname"
                    style={{ flex: 1, border: 'none', padding: '11px 14px 11px 4px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Bio <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(optional)</span>
                </label>
                <textarea value={selected.bio} onChange={e => setSelected(s => ({ ...s, bio: e.target.value }))}
                  placeholder="Tell your campus about yourself..." rows={3}
                  style={{ ...inputStyle, resize: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  College Email <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(optional — for verified badge)</span>
                </label>
                <input type="email" value={selected.college_email}
                  onChange={e => setSelected(s => ({ ...s, college_email: e.target.value }))}
                  placeholder="you@pwioi.edu.in" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={back} style={btnSecondary}>Back</button>
                <button disabled={!selected.username || loading} onClick={handleFinish}
                  style={btnPrimary(!selected.username || loading)}>
                  {loading ? 'Setting up...' : 'Enter Campus →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
