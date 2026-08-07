'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

const OPP_TYPES = ['all', 'hackathon', 'internship', 'freelance', 'startup_role', 'collab', 'scholarship', 'competition']
const typeConfig: any = {
  hackathon: { bg: '#f5f3ff', text: '#6d28d9', label: 'Hackathon' },
  internship: { bg: '#eff6ff', text: '#1d4ed8', label: 'Internship' },
  freelance: { bg: '#f0fdf4', text: '#15803d', label: 'Freelance' },
  startup_role: { bg: '#fff7ed', text: '#c2410c', label: 'Startup' },
  collab: { bg: '#fdf4ff', text: '#7e22ce', label: 'Collab' },
  scholarship: { bg: '#fefce8', text: '#a16207', label: 'Scholarship' },
  competition: { bg: '#fef2f2', text: '#dc2626', label: 'Competition' },
  other: { bg: '#f8f9fa', text: '#495057', label: 'Other' },
}

export default function OpportunitiesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [showCompose, setShowCompose] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', opp_type: 'hackathon', company_org: '', apply_link: '', deadline: '', is_paid: false, stipend_range: '', location_type: 'remote' })
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data } = await supabase.from('opportunities').select('*, profiles(full_name, username)').eq('is_active', true).order('created_at', { ascending: false }).limit(50)
      setOpportunities(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.title.trim()) return
    setPosting(true)
    await supabase.from('opportunities').insert({ posted_by: user.id, campus_id: profile?.campus_id, college_id: profile?.college_id, ...form, visibility: 'platform', is_active: true })
    await supabase.rpc('add_karma', { p_points: 8 })
    await supabase.rpc('update_streak')
    setForm({ title: '', description: '', opp_type: 'hackathon', company_org: '', apply_link: '', deadline: '', is_paid: false, stipend_range: '', location_type: 'remote' })
    setShowCompose(false)
    const { data } = await supabase.from('opportunities').select('*, profiles(full_name, username)').eq('is_active', true).order('created_at', { ascending: false }).limit(50)
    setOpportunities(data || [])
    setPosting(false)
  }

  const filtered = filter === 'all' ? opportunities : opportunities.filter(o => o.opp_type === filter)
  const daysLeft = (deadline: string) => {
    if (!deadline) return null
    const diff = new Date(deadline).getTime() - Date.now()
    const days = Math.ceil(diff / 86400000)
    if (days < 0) return { label: 'Expired', bg: '#fef2f2', text: '#dc2626' }
    if (days === 0) return { label: 'Last day!', bg: '#fff7ed', text: '#c2410c' }
    return { label: `${days}d left`, bg: '#f8f9fa', text: '#495057' }
  }
  const timeAgo = (date: string) => { const diff = Date.now() - new Date(date).getTime(); const days = Math.floor(diff / 86400000); return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago` }
  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const }
  const filterBtn = (active: boolean) => ({ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500 as const, border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'white', color: active ? 'white' : 'var(--text-secondary)', cursor: 'pointer' as const })

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Opportunities</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Hackathons, internships, collabs and more</p>
          </div>
          {user ? (
            admin.isAdmin ? (
              <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Post</button>
            ) : null
          ) : (
            <button onClick={() => router.push('/auth/login')} style={{ background: 'white', color: 'var(--accent)', border: '1px solid var(--accent)', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Login to Post</button>
          )}
        </div>

        {showCompose && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Post an Opportunity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *" style={inputStyle} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={3} style={{ ...inputStyle, resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.opp_type} onChange={e => setForm(f => ({ ...f, opp_type: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  <option value="hackathon">Hackathon</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                  <option value="startup_role">Startup Role</option>
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
              {form.is_paid && <input type="text" value={form.stipend_range} onChange={e => setForm(f => ({ ...f, stipend_range: e.target.value }))} placeholder="e.g. 5k-10k/month" style={inputStyle} />}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.title.trim() || posting} style={{ flex: 1, background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post +8⭐'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }} className="scrollbar-hide">
          {OPP_TYPES.map(type => <button key={type} onClick={() => setFilter(type)} style={filterBtn(filter === type)}>{type === 'startup_role' ? 'Startup' : type.charAt(0).toUpperCase() + type.slice(1)}</button>)}
        </div>

        {loading ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>��</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No opportunities yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post one!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(opp => {
              const tc = typeConfig[opp.opp_type] || typeConfig.other
              const dl = daysLeft(opp.deadline)
              return (
                <div key={opp.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: tc.bg, color: tc.text, fontWeight: 600 }}>{tc.label}</span>
                        {opp.location_type && <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{opp.location_type}</span>}
                        {opp.is_verified && <span style={{ fontSize: 11, color: '#15803d' }}>✓ Verified</span>}
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{opp.title}</h3>
                      {opp.company_org && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{opp.company_org}</p>}
                    </div>
                    {dl && <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: dl.bg, color: dl.text, fontWeight: 600, flexShrink: 0 }}>{dl.label}</span>}
                  </div>
                  {opp.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{opp.description}</p>}
                  {opp.is_paid && opp.stipend_range && <p style={{ fontSize: 12, color: '#15803d', fontWeight: 600, margin: '0 0 12px' }}>💰 {opp.stipend_range}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{opp.profiles?.username} · {timeAgo(opp.created_at)}</p>
                    {opp.apply_link && (
                      <a href={opp.apply_link} target="_blank" rel="noopener noreferrer"
                        style={{ background: 'var(--accent)', color: 'white', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        Apply →
                      </a>
                    )}
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
