'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────────────────
interface College {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  logo_url: string | null
  website: string | null
  is_active: boolean
  is_verified: boolean
  email_domains: string[] | null
  created_at: string
}

interface Campus {
  id: string
  college_id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  is_active: boolean
  created_at: string
}

interface Department {
  id: string
  campus_id: string
  name: string
  short_name: string | null
  created_at: string
}

// ── Default form state ───────────────────────────────────────
const emptyCollege = {
  name: '', slug: '', city: '', state: '', website: '', logo_url: '',
  email_domains: '',
}

const emptyCampus = {
  name: '', slug: '', city: '', state: '',
}

const emptyDepartment = {
  name: '', short_name: '',
}

export default function AdminCampusesPage() {
  const [user, setUser] = useState<any>(null)
  const [colleges, setColleges] = useState<College[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // ── Create modal ──────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState<'college' | 'campus' | 'department'>('college')
  const [collegeForm, setCollegeForm] = useState(emptyCollege)
  const [campusForm, setCampusForm] = useState(emptyCampus)
  const [deptForm, setDeptForm] = useState(emptyDepartment)
  const [selectedCollege, setSelectedCollege] = useState<string>('')
  const [selectedCampus, setSelectedCampus] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // ── Edit state ────────────────────────────────────────────
  const [editingCollege, setEditingCollege] = useState<College | null>(null)
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null)

  // ── Auth check ────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=/admin/campuses'); return }
      const { data } = await supabase.rpc('my_admin_grants')
      const isAdmin = (data as any[])?.some((g: any) => g.admin_type === 'platform_admin')
      if (!isAdmin) { router.push('/feed'); return }
      setUser(user)
    }
    check()
  }, [])

  // ── Load data ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const [colRes, campRes, deptRes] = await Promise.all([
      supabase.from('colleges').select('*').order('name'),
      supabase.from('campuses').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
    ])
    setColleges(colRes.data || [])
    setCampuses(campRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) loadData() }, [user])

  // ── Helper: slugify ───────────────────────────────────────
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // ── Create college ────────────────────────────────────────
  const handleCreateCollege = async () => {
    if (!collegeForm.name.trim()) { setError('College name is required'); return }
    setSaving(true); setError('')
    const slug = slugify(collegeForm.name)
    const { error: insErr } = await supabase.from('colleges').insert({
      name: collegeForm.name.trim(),
      slug,
      city: collegeForm.city.trim() || null,
      state: collegeForm.state.trim() || null,
      website: collegeForm.website.trim() || null,
      logo_url: collegeForm.logo_url.trim() || null,
      email_domains: collegeForm.email_domains ? collegeForm.email_domains.split(',').map(s => s.trim()).filter(Boolean) : null,
      is_active: true,
      is_verified: true,
    })
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setSuccess(`College "${collegeForm.name}" created!`)
    setCollegeForm(emptyCollege)
    setShowCreate(false)
    await loadData()
    setSaving(false)
  }

  // ── Create campus ─────────────────────────────────────────
  const handleCreateCampus = async () => {
    if (!selectedCollege || !campusForm.name.trim()) { setError('Select a college and enter campus name'); return }
    setSaving(true); setError('')
    const slug = slugify(campusForm.name)
    const { error: insErr } = await supabase.from('campuses').insert({
      college_id: selectedCollege,
      name: campusForm.name.trim(),
      slug,
      city: campusForm.city.trim() || null,
      state: campusForm.state.trim() || null,
      is_active: true,
    })
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setSuccess(`Campus "${campusForm.name}" created!`)
    setCampusForm(emptyCampus)
    setShowCreate(false)
    await loadData()
    setSaving(false)
  }

  // ── Create department ─────────────────────────────────────
  const handleCreateDept = async () => {
    if (!selectedCampus || !deptForm.name.trim()) { setError('Select a campus and enter department name'); return }
    setSaving(true); setError('')
    const { error: insErr } = await supabase.from('departments').insert({
      campus_id: selectedCampus,
      name: deptForm.name.trim(),
      short_name: deptForm.short_name.trim() || null,
    })
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setSuccess(`Department "${deptForm.name}" created!`)
    setDeptForm(emptyDepartment)
    setShowCreate(false)
    await loadData()
    setSaving(false)
  }

  // ── Toggle active ─────────────────────────────────────────
  const toggleCollege = async (c: College) => {
    await supabase.from('colleges').update({ is_active: !c.is_active }).eq('id', c.id)
    await loadData()
  }

  const toggleCampus = async (c: Campus) => {
    await supabase.from('campuses').update({ is_active: !c.is_active }).eq('id', c.id)
    await loadData()
  }

  // ── Delete ────────────────────────────────────────────────
  const deleteCollege = async (c: College) => {
    if (!confirm(`Delete "${c.name}" and all its campuses & departments?`)) return
    // Delete departments for all campuses of this college
    const collegeCampuses = campuses.filter(camp => camp.college_id === c.id)
    for (const camp of collegeCampuses) {
      await supabase.from('departments').delete().eq('campus_id', camp.id)
    }
    await supabase.from('campuses').delete().eq('college_id', c.id)
    await supabase.from('colleges').delete().eq('id', c.id)
    await loadData()
  }

  const deleteCampus = async (c: Campus) => {
    if (!confirm(`Delete campus "${c.name}" and its departments?`)) return
    await supabase.from('departments').delete().eq('campus_id', c.id)
    await supabase.from('campuses').delete().eq('id', c.id)
    await loadData()
  }

  const deleteDept = async (d: Department) => {
    if (!confirm(`Delete department "${d.name}"?`)) return
    await supabase.from('departments').delete().eq('id', d.id)
    await loadData()
  }

  // ── Clear messages ────────────────────────────────────────
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 3000); return () => clearTimeout(t) }
  }, [success])

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  if (!user) return null

  return (
    <div data-accent="purple" style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>← Back to Admin</button>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0' }}>🏫 Campus Management</h1>
          </div>
          <button onClick={() => { setShowCreate(true); setCreateTab('college'); setError('') }}
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Create New
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
        {/* Messages */}
        {error && <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
        {success && <div style={{ background: 'var(--success-light)', border: '1px solid var(--success-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--success)' }}>{success}</div>}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>{colleges.length}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Colleges</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple-text)', margin: 0 }}>{campuses.length}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Campuses</p>
          </div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--cyan-text)', margin: 0 }}>{departments.length}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Departments</p>
          </div>
        </div>

        {/* Colleges list */}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Colleges & Campuses</h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
          </div>
        ) : colleges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 40, margin: '0 0 8px' }}>🏫</p>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>No colleges yet</p>
            <p style={{ fontSize: 13 }}>Click the + Create New button to add the first one</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {colleges.map(col => {
              const colCampuses = campuses.filter(c => c.college_id === col.id)
              return (
                <div key={col.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                  {/* College header */}
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: colCampuses.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                        {col.name.charAt(0)}
                      </div>
                      <div>
                        <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{col.name}</h4>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {col.city || '—'}{col.state ? `, ${col.state}` : ''} · {colCampuses.length} campus{colCampuses.length !== 1 ? 'es' : ''} · {col.slug}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => toggleCollege(col)}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: col.is_active ? 'var(--success-light)' : 'var(--danger-light)', color: col.is_active ? 'var(--success-text)' : 'var(--danger)' }}>
                        {col.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button onClick={() => deleteCollege(col)}
                        style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Campuses */}
                  {colCampuses.length > 0 && (
                    <div style={{ padding: '12px 20px' }}>
                      {colCampuses.map(camp => {
                        const campDepts = departments.filter(d => d.campus_id === camp.id)
                        return (
                          <div key={camp.id} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: camp.is_active ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{camp.name}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({camp.city || '—'})</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => toggleCampus(camp)}
                                  style={{ padding: '3px 10px', borderRadius: 16, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: camp.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: camp.is_active ? '#10b981' : '#ef4444' }}>
                                  {camp.is_active ? 'ON' : 'OFF'}
                                </button>
                                <button onClick={() => deleteCampus(camp)}
                                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer' }}>
                                  ×
                                </button>
                              </div>
                            </div>

                            {/* Departments */}
                            {campDepts.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 20 }}>
                                {campDepts.map(d => (
                                  <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 16, fontSize: 11, background: 'var(--cyan-light)', color: 'var(--cyan-text)' }}>
                                    {d.short_name || d.name}
                                    <button onClick={() => deleteDept(d)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          CREATE MODAL
      ═══════════════════════════════════════════════════════ */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div style={{ background: 'var(--bg)', borderRadius: 18, border: '1px solid var(--border)', width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Create New</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 22px 0' }}>
              {(['college', 'campus', 'department'] as const).map(tab => (
                <button key={tab} onClick={() => { setCreateTab(tab); setError('') }}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: createTab === tab ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: createTab === tab ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
                  {tab === 'college' ? '🏫 College' : tab === 'campus' ? '📍 Campus' : '📚 Department'}
                </button>
              ))}
            </div>

            <div style={{ padding: '18px 22px 22px' }}>
              {/* ── College form ── */}
              {createTab === 'college' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>College Name *</label>
                    <input value={collegeForm.name} onChange={e => setCollegeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. IIT Delhi" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>City</label>
                      <input value={collegeForm.city} onChange={e => setCollegeForm(f => ({ ...f, city: e.target.value }))} placeholder="Lucknow" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>State</label>
                      <input value={collegeForm.state} onChange={e => setCollegeForm(f => ({ ...f, state: e.target.value }))} placeholder="Uttar Pradesh" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Website</label>
                    <input value={collegeForm.website} onChange={e => setCollegeForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Logo URL</label>
                    <input value={collegeForm.logo_url} onChange={e => setCollegeForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Email Domains (comma-separated)</label>
                    <input value={collegeForm.email_domains} onChange={e => setCollegeForm(f => ({ ...f, email_domains: e.target.value }))} placeholder="iitd.ac.in, iitd.edu" style={inputStyle} />
                  </div>
                  <button onClick={handleCreateCollege} disabled={saving || !collegeForm.name.trim()}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: saving || !collegeForm.name.trim() ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)' }}>
                    {saving ? 'Creating…' : '🏫 Create College'}
                  </button>
                </div>
              )}

              {/* ── Campus form ── */}
              {createTab === 'campus' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Select College *</label>
                    <select value={selectedCollege} onChange={e => setSelectedCollege(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">— Choose college —</option>
                      {colleges.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Campus Name *</label>
                    <input value={campusForm.name} onChange={e => setCampusForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Campus" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>City</label>
                      <input value={campusForm.city} onChange={e => setCampusForm(f => ({ ...f, city: e.target.value }))} placeholder="Lucknow" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>State</label>
                      <input value={campusForm.state} onChange={e => setCampusForm(f => ({ ...f, state: e.target.value }))} placeholder="Uttar Pradesh" style={inputStyle} />
                    </div>
                  </div>
                  <button onClick={handleCreateCampus} disabled={saving || !selectedCollege || !campusForm.name.trim()}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: saving || !selectedCollege || !campusForm.name.trim() ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)' }}>
                    {saving ? 'Creating…' : '📍 Create Campus'}
                  </button>
                </div>
              )}

              {/* ── Department form ── */}
              {createTab === 'department' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Select College *</label>
                    <select value={selectedCollege} onChange={e => { setSelectedCollege(e.target.value); setSelectedCampus('') }}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">— Choose college —</option>
                      {colleges.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {selectedCollege && (
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Select Campus *</label>
                      <select value={selectedCampus} onChange={e => setSelectedCampus(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">— Choose campus —</option>
                        {campuses.filter(c => c.college_id === selectedCollege && c.is_active).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Department Name *</label>
                    <input value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Computer Science & Engineering" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Short Name</label>
                    <input value={deptForm.short_name} onChange={e => setDeptForm(f => ({ ...f, short_name: e.target.value }))} placeholder="e.g. CSE" style={inputStyle} />
                  </div>
                  <button onClick={handleCreateDept} disabled={saving || !selectedCampus || !deptForm.name.trim()}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: saving || !selectedCampus || !deptForm.name.trim() ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)' }}>
                    {saving ? 'Creating…' : '📚 Create Department'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
