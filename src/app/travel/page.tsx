'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

export default function TravelPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ from_location: '', to_location: '', travel_date: '', transport_mode: 'train', seats_available: '1', contact_info: '', notes: '' })
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const { data } = await supabase.from('travel_buddies').select('*, profiles(full_name, username, current_year)').order('created_at', { ascending: false }).limit(30)
      setPosts(data || [])
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.from_location || !form.to_location) return
    setPosting(true)
    await supabase.from('travel_buddies').insert({ posted_by: user.id, campus_id: profile?.campus_id, ...form, seats_available: parseInt(form.seats_available) })
    setForm({ from_location: '', to_location: '', travel_date: '', transport_mode: 'train', seats_available: '1', contact_info: '', notes: '' })
    setShowCompose(false)
    const { data } = await supabase.from('travel_buddies').select('*, profiles(full_name, username, current_year)').order('created_at', { ascending: false }).limit(30)
    setPosts(data || [])
    setPosting(false)
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button onClick={() => router.push('/more')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Travel Buddies</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginLeft: 34 }}>Find campus mates travelling the same route</p>
          </div>
          {user && admin.isAdmin && <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Post</button>}
        </div>

        {showCompose && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Post a Travel Plan</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="text" value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} placeholder="From *" style={inputStyle} />
                <input type="text" value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} placeholder="To *" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="date" value={form.travel_date} onChange={e => setForm(f => ({ ...f, travel_date: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }} />
                <select value={form.transport_mode} onChange={e => setForm(f => ({ ...f, transport_mode: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  <option value="train">🚂 Train</option>
                  <option value="bus">🚌 Bus</option>
                  <option value="car">🚗 Car</option>
                  <option value="flight">✈️ Flight</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="number" value={form.seats_available} onChange={e => setForm(f => ({ ...f, seats_available: e.target.value }))} placeholder="Seats available" min="1" max="10" style={inputStyle} />
                <input type="text" value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} placeholder="Contact (WhatsApp/phone)" style={inputStyle} />
              </div>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.from_location || !form.to_location || posting} style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🚂</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No travel plans yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => (
              <div key={post.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{post.from_location} → {post.to_location}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{post.profiles?.username} · Year {post.profiles?.current_year}</p>
                  </div>
                  <span style={{ fontSize: 24 }}>{post.transport_mode === 'train' ? '🚂' : post.transport_mode === 'bus' ? '🚌' : post.transport_mode === 'flight' ? '✈️' : '🚗'}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  {post.travel_date && <span>📅 {new Date(post.travel_date).toLocaleDateString()}</span>}
                  <span>💺 {post.seats_available} seat{post.seats_available > 1 ? 's' : ''} available</span>
                </div>
                {post.notes && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>{post.notes}</p>}
                {post.contact_info && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                    📱 Contact: <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{post.contact_info}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
