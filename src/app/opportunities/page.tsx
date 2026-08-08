'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'
import MatchScore from '@/components/MatchScore'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'

const OPP_TYPES = ['all', 'internship', 'jobs', 'hackathon', 'scholarship', 'competition', 'freelance', 'collab', 'saved']

// Display labels per the product spec (mapped to existing data keys).
const TYPE_LABELS: Record<string, string> = {
  all: 'All',
  internship: 'Internships',
  startup_role: 'Jobs',
  jobs: 'Jobs',
  hackathon: 'Hackathons',
  scholarship: 'Scholarships',
  competition: 'Competitions',
  freelance: 'Freelance',
  collab: 'Collab',
  saved: 'Saved',
}
const TYPE_KEYS: Record<string, string> = { jobs: 'startup_role' }

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  hackathon:   { bg: 'var(--purple-light)', text: 'var(--purple-text)', label: 'Hackathon' },
  internship:  { bg: 'var(--accent-light)', text: 'var(--accent-text)', label: 'Internship' },
  freelance:   { bg: 'var(--success-light)', text: 'var(--success-text)', label: 'Freelance' },
  startup_role:{ bg: 'var(--orange-light)', text: 'var(--orange-text)', label: 'Job' },
  collab:      { bg: 'var(--purple-light)', text: 'var(--purple-text)', label: 'Collab' },
  scholarship: { bg: 'var(--yellow-light)', text: 'var(--yellow-text)', label: 'Scholarship' },
  competition: { bg: 'var(--danger-light)', text: 'var(--danger)', label: 'Competition' },
  other:       { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)', label: 'Other' },
}

const SAVED_KEY = 'cc-saved-opps'

const emptyForm = {
  title: '', description: '', opp_type: 'hackathon', company_org: '',
  apply_link: '', deadline: '', is_paid: false, stipend_range: '', location_type: 'remote',
}

export default function OpportunitiesPage() {
  const [user, setUser]               = useState<any>(null)
  const [profile, setProfile]         = useState<any>(null)
  const [opportunities, setOpps]      = useState<any[]>([])
  const [filter, setFilter]           = useState('all')
  const [savedIds, setSavedIds]       = useState<string[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [editTarget, setEditTarget]   = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [posting, setPosting]         = useState(false)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [form, setForm]               = useState({ ...emptyForm })
  const [error, setError]             = useState<string | null>(null)
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  /** True if the signed-in user is an admin (V3: admin grants, not the dropped role column) */
  const isAdmin = admin.isPlatformAdmin || admin.isCampusAdmin

  // ─── Saved tracking (client-side, honest persistence) ────────────────────────
  const loadSaved = () => {
    try { setSavedIds(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')) } catch { setSavedIds([]) }
  }
  useEffect(() => { loadSaved() }, [])

  const toggleSaved = (id: string) => {
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ─── Load user + opportunities ───────────────────────────────────────────────
  const fetchOpps = async () => {
    const res = await fetch('/api/opportunities', { credentials: 'include' })
    if (res.ok) {
      const json = await res.json()
      setOpps(json.data ?? [])
    }
  }

  useEffect(() => {
    const load = async () => {
      // Support deep links like /opportunities?type=internship (from the ⌘K palette)
      try {
        const t = new URLSearchParams(window.location.search).get('type')
        if (t && OPP_TYPES.includes(t)) setFilter(t)
      } catch { /* ignore */ }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
        setProfile(prof)
      }
      await fetchOpps()
      setLoading(false)
    }
    load()
  }, [])

  // ─── CREATE ──────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!form.title.trim()) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to post.'); return }
      setOpps(prev => [json.data, ...prev])
      setForm({ ...emptyForm })
      setShowCompose(false)
    } finally {
      setPosting(false)
    }
  }

  // ─── EDIT (open form pre-filled) ─────────────────────────────────────────────
  const openEdit = (opp: any) => {
    setEditTarget(opp)
    setForm({
      title:         opp.title         ?? '',
      description:   opp.description   ?? '',
      opp_type:      opp.opp_type      ?? 'hackathon',
      company_org:   opp.company_org   ?? '',
      apply_link:    opp.apply_link    ?? '',
      deadline:      opp.deadline      ?? '',
      is_paid:       opp.is_paid       ?? false,
      stipend_range: opp.stipend_range ?? '',
      location_type: opp.location_type ?? 'remote',
    })
    setShowCompose(true)
    setError(null)
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editTarget || !form.title.trim()) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${editTarget.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to update.'); return }
      setOpps(prev => prev.map(o => o.id === editTarget.id ? json.data : o))
      closeCompose()
    } finally {
      setPosting(false)
    }
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this opportunity? This cannot be undone.')) return
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Failed to delete.')
        return
      }
      setOpps(prev => prev.filter(o => o.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const closeCompose = () => {
    setShowCompose(false)
    setEditTarget(null)
    setForm({ ...emptyForm })
    setError(null)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const filtered = filter === 'all'
    ? opportunities
    : filter === 'saved'
      ? opportunities.filter(o => savedIds.includes(o.id))
      : opportunities.filter(o => o.opp_type === (TYPE_KEYS[filter] || filter))

  const daysLeft = (deadline: string) => {
    if (!deadline) return null
    const diff = new Date(deadline).getTime() - Date.now()
    const days = Math.ceil(diff / 86400000)
    if (days < 0)  return { label: 'Expired',   bg: 'var(--danger-light)', text: 'var(--danger)' }
    if (days === 0) return { label: 'Last day!', bg: 'var(--orange-light)', text: 'var(--orange-text)' }
    return { label: `${days}d left`, bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' }
  }

  const timeAgo = (date: string) => {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
    return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  const filterBtn = (active: boolean) => ({
    flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12,
    fontWeight: 500 as const,
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg)',
    color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
    cursor: 'pointer' as const,
    fontFamily: 'inherit' as const,
  })

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Opportunities</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Hackathons, internships, jobs & scholarships — AI-matched to your profile
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { closeCompose(); setShowCompose(true) }}
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >+ Post</button>
          )}
        </div>

        {/* Global error banner */}
        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{error}</p>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
          </div>
        )}

        {/* Create / Edit form — admin only */}
        {showCompose && isAdmin && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
              {editTarget ? 'Edit Opportunity' : 'Post an Opportunity'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *" style={inputStyle} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={3} style={{ ...inputStyle, resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.opp_type} onChange={e => setForm(f => ({ ...f, opp_type: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  <option value="hackathon">Hackathon</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                  <option value="startup_role">Job / Startup Role</option>
                  <option value="collab">Collab</option>
                  <option value="scholarship">Scholarship</option>
                  <option value="competition">Competition</option>
                  <option value="other">Other</option>
                </select>
                <select value={form.location_type} onChange={e => setForm(f => ({ ...f, location_type: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  <option value="remote">Remote</option>
                  <option value="onsite">Onsite</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="text" value={form.company_org} onChange={e => setForm(f => ({ ...f, company_org: e.target.value }))} placeholder="Company / Organizer" style={inputStyle} />
                <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }} />
              </div>
              <input type="url" value={form.apply_link} onChange={e => setForm(f => ({ ...f, apply_link: e.target.value }))} placeholder="Apply / Register Link" style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_paid} onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))} />
                Paid / Stipend
              </label>
              {form.is_paid && (
                <input type="text" value={form.stipend_range} onChange={e => setForm(f => ({ ...f, stipend_range: e.target.value }))} placeholder="e.g. 5k-10k/month" style={inputStyle} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={closeCompose} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={editTarget ? handleUpdate : handlePost} disabled={!form.title.trim() || posting}
                style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? (editTarget ? 'Saving...' : 'Posting...') : editTarget ? 'Save Changes' : 'Post +8⭐'}
              </button>
            </div>
          </div>
        )}

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }} className="scrollbar-hide" role="tablist" aria-label="Filter opportunities">
          {OPP_TYPES.map(type => (
            <button key={type} onClick={() => setFilter(type)} style={filterBtn(filter === type)}>
              {TYPE_LABELS[type] || type}
            </button>
          ))}
        </div>

        {/* Opportunity list */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={filter === 'saved' ? 'bookmark' : 'briefcase'}
            title={filter === 'saved' ? 'No saved opportunities yet' : 'No opportunities here yet'}
            body={filter === 'saved' ? 'Save opportunities to track their deadlines — they will show up here.' : isAdmin ? 'Use the + Post button to add the first one.' : 'Check back soon — new opportunities are posted regularly.'}
            cta={filter === 'saved' ? 'Explore opportunities' : undefined}
            onCta={filter === 'saved' ? () => setFilter('all') : undefined}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(opp => {
              const tc = typeConfig[opp.opp_type] ?? typeConfig.other
              const dl = daysLeft(opp.deadline)
              const isBeingDeleted = deleting === opp.id
              const isSaved = savedIds.includes(opp.id)

              return (
                <div key={opp.id} className="card-hover" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: tc.bg, color: tc.text, fontWeight: 600 }}>{tc.label}</span>
                        {opp.location_type && <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{opp.location_type}</span>}
                        {opp.is_verified && <span style={{ fontSize: 11, color: 'var(--success-text)' }}>✓ Verified</span>}
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{opp.title}</h3>
                      {opp.company_org && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{opp.company_org}</p>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      {dl && <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: dl.bg, color: dl.text, fontWeight: 600 }}>{dl.label}</span>}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => openEdit(opp)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => handleDelete(opp.id)} disabled={isBeingDeleted}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--danger-border)', background: isBeingDeleted ? 'var(--gray-soft)' : 'var(--danger-light)', color: 'var(--danger)', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isBeingDeleted ? '…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {opp.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {opp.description}
                    </p>
                  )}
                  {opp.is_paid && opp.stipend_range && (
                    <p style={{ fontSize: 12, color: 'var(--success-text)', fontWeight: 600, margin: '0 0 12px' }}>💰 {opp.stipend_range}</p>
                  )}

                  {/* Real AI Match score — computed from the posted skills vs this student */}
                  <MatchScore opp={opp} profile={profile} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{opp.profiles?.username} · {timeAgo(opp.created_at)}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => toggleSaved(opp.id)}
                        aria-label={isSaved ? 'Remove from saved' : 'Save opportunity'}
                        aria-pressed={isSaved}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: isSaved ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}
                      >
                        <Icon name="bookmark" size={15} /> {isSaved ? 'Saved' : 'Save'}
                      </button>
                      {opp.apply_link && (
                        <a href={opp.apply_link} target="_blank" rel="noopener noreferrer"
                          style={{ background: 'var(--accent)', color: 'var(--on-accent)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          Apply →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
