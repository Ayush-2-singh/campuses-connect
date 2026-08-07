'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function TalentPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data } = await supabase.from('profiles').select('*, campuses(name), departments(short_name)').eq('is_public', true).order('karma_points', { ascending: false }).limit(50)
      setStudents(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSearch = async (val: string) => {
    setSearch(val)
    let query = supabase.from('profiles').select('*, campuses(name), departments(short_name)').eq('is_public', true).order('karma_points', { ascending: false }).limit(50)
    if (val.trim()) query = query.ilike('full_name', `%${val}%`)
    const { data } = await query
    setStudents(data || [])
  }

  const avatarColor = (name: string) => {
    const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Talent Search</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Find students by name, skill or department</p>
        </div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search students..."
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px 12px 44px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const }} />
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>🔍</span>
        </div>

        {loading ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        : students.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No students found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {students.map(s => {
              return (
                <div key={s.id} onClick={() => router.push(`/profile/${s.username}`)}
                  style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: avatarColor(s.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {s.full_name?.[0] || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{s.full_name || 'No name'}</p>
                      {s.is_verified && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      @{s.username || 'no username'}
                      {s.departments?.short_name && ` · ${s.departments.short_name}`}
                      {s.current_year && ` · Year ${s.current_year}`}
                    </p>
                    {s.bio && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.bio}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {s.karma_points > 0 && <span style={{ fontSize: 11, color: '#a16207', background: '#fefce8', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⭐ {s.karma_points}</span>}
                    {user && user.id !== s.id && (
                      <button onClick={e => { e.stopPropagation(); router.push(`/profile/${s.username}`) }}
                        style={{ fontSize: 12, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '4px 12px', borderRadius: 8, background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Connect
                      </button>
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
