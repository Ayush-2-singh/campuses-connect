'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

export default function ClubsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [clubs, setClubs] = useState<any[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const router = useRouter()
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  const load = async () => {
    const { data } = await supabase.from('clubs').select('*').eq('is_active', true)
    setClubs(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', user.id)
        setMemberships((mem || []).map((m: any) => m.club_id))
      }
      load()
    }
    init()
  }, [supabase])

  const join = async (clubId: string) => {
    if (!user) { router.push('/auth/login'); return }
    if (memberships.includes(clubId)) {
      await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', user.id)
      setMemberships(m => m.filter(id => id !== clubId))
    } else {
      await supabase.from('club_members').insert({ club_id: clubId, user_id: user.id })
      setMemberships(m => [...m, clubId])
    }
  }

  const create = async () => {
    if (!name.trim() || !user) return
    await supabase.from('clubs').insert({ college_id: profile?.college_id, name: name.trim(), description: desc.trim() || null, created_by: user.id })
    setName(''); setDesc(''); setShowCreate(false)
    load()
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/college')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Clubs</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Student clubs in your college</p>
            </div>
          </div>
          {(admin.isPlatformAdmin || admin.isCampusAdmin) && (
            <button onClick={() => setShowCreate(s => !s)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Create Club</button>
          )}
        </div>

        {showCreate && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Club name *" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }} />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this club do?" rows={2} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none', marginBottom: 10 }} />
            <button onClick={create} disabled={!name.trim()} style={{ background: name.trim() ? 'var(--accent)' : 'var(--disabled)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Create</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clubs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No clubs yet</p>
          ) : clubs.map(c => (
            <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 30 }}>🎭</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>{c.name}</p>
                {c.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</p>}
              </div>
              <button onClick={() => join(c.id)} style={{ background: memberships.includes(c.id) ? 'var(--bg-secondary)' : 'var(--accent)', color: memberships.includes(c.id) ? 'var(--text-secondary)' : 'white', border: memberships.includes(c.id) ? '1px solid var(--border)' : 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {memberships.includes(c.id) ? '✓ Joined' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
