'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function StudyGroupsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', subject: '', description: '', max_size: '5' })
  const router = useRouter()
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase.from('study_groups').select('*').eq('is_active', true)
    setGroups(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        const { data: mem } = await supabase.from('study_group_members').select('group_id').eq('user_id', user.id)
        setMemberships((mem || []).map((m: any) => m.group_id))
      }
      load()
    }
    init()
  }, [supabase])

  const join = async (groupId: string) => {
    if (!user) { router.push('/auth/login'); return }
    if (memberships.includes(groupId)) {
      await supabase.from('study_group_members').delete().eq('group_id', groupId).eq('user_id', user.id)
      setMemberships(m => m.filter(id => id !== groupId))
    } else {
      await supabase.from('study_group_members').insert({ group_id: groupId, user_id: user.id })
      setMemberships(m => [...m, groupId])
    }
  }

  const create = async () => {
    if (!form.name.trim() || !user) return
    await supabase.from('study_groups').insert({
      college_id: profile?.college_id, name: form.name.trim(), subject: form.subject.trim() || null,
      description: form.description.trim() || null, max_size: parseInt(form.max_size) || null, created_by: user.id,
    })
    setForm({ name: '', subject: '', description: '', max_size: '5' })
    setShowCreate(false)
    load()
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/college')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Study Groups</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Form study circles with classmates</p>
            </div>
          </div>
          {user && <button onClick={() => setShowCreate(s => !s)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Create Group</button>}
        </div>

        {showCreate && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name *" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject (e.g. Operating Systems)" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <input type="number" value={form.max_size} onChange={e => setForm(f => ({ ...f, max_size: e.target.value }))} min="2" max="20" placeholder="Max size" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What will you study together?" rows={2} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none' }} />
            </div>
            <button onClick={create} disabled={!form.name.trim()} style={{ marginTop: 10, background: form.name.trim() ? 'var(--accent)' : 'var(--disabled)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Create</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No study groups yet</p>
          ) : groups.map(g => (
            <div key={g.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 30 }}>👥</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>{g.name} {g.subject && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {g.subject}</span>}</p>
                {g.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</p>}
              </div>
              <button onClick={() => join(g.id)} style={{ background: memberships.includes(g.id) ? 'var(--bg-secondary)' : 'var(--accent)', color: memberships.includes(g.id) ? 'var(--text-secondary)' : 'var(--on-accent)', border: memberships.includes(g.id) ? '1px solid var(--border)' : 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {memberships.includes(g.id) ? '✓ Joined' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
