'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

export default function LostFoundPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all')
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', item_type: 'lost', category: 'electronics', location: '', contact_info: '' })
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const { data } = await supabase.from('lost_found').select('*, profiles(full_name, username)').eq('is_resolved', false).order('created_at', { ascending: false }).limit(30)
      setItems(data || [])
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.title) return
    setPosting(true)
    await supabase.from('lost_found').insert({ posted_by: user.id, campus_id: profile?.campus_id, ...form, is_resolved: false })
    setForm({ title: '', description: '', item_type: 'lost', category: 'electronics', location: '', contact_info: '' })
    setShowCompose(false)
    const { data } = await supabase.from('lost_found').select('*, profiles(full_name, username)').eq('is_resolved', false).order('created_at', { ascending: false }).limit(30)
    setItems(data || [])
    setPosting(false)
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.item_type === filter)
  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button onClick={() => router.push('/more')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Lost & Found</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginLeft: 34 }}>Report lost items or return found ones</p>
          </div>
          {user && admin.isAdmin && <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Post</button>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['all', 'lost', 'found'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 500, border: filter === f ? 'none' : '1px solid var(--border)', background: filter === f ? 'var(--accent)' : 'var(--bg)', color: filter === f ? 'var(--on-accent)' : 'var(--text-secondary)', cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit' }}>{f}</button>
          ))}
        </div>

        {showCompose && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Report Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {['lost', 'found'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, item_type: t }))} style={{ flex: 1, padding: '10px', borderRadius: 10, border: form.item_type === t ? 'none' : '1px solid var(--border)', background: form.item_type === t ? (t === 'lost' ? 'var(--danger-light)' : 'var(--success-light)') : 'var(--bg)', color: form.item_type === t ? (t === 'lost' ? 'var(--danger)' : 'var(--success-text)') : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit' }}>{t === 'lost' ? '😢 Lost' : '🎉 Found'}</button>
                ))}
              </div>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Item name *" style={inputStyle} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} style={{ ...inputStyle, resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  <option value="electronics">Electronics</option>
                  <option value="clothing">Clothing</option>
                  <option value="books">Books</option>
                  <option value="id_card">ID Card</option>
                  <option value="keys">Keys</option>
                  <option value="other">Other</option>
                </select>
                <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" style={inputStyle} />
              </div>
              <input type="text" value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} placeholder="Contact info" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.title || posting} style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Nothing here yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(item => (
              <div key={item.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: item.item_type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)', color: item.item_type === 'lost' ? 'var(--danger)' : 'var(--success-text)', fontWeight: 600 }}>{item.item_type === 'lost' ? '😢 Lost' : '🎉 Found'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{item.category}</span>
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{item.title}</p>
                  </div>
                </div>
                {item.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{item.description}</p>}
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: item.contact_info ? 8 : 0 }}>
                  {item.location && <span>📍 {item.location}</span>}
                  <span>@{item.profiles?.username}</span>
                </div>
                {item.contact_info && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                    📱 <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.contact_info}</span>
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
