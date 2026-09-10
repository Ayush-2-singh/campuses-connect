'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'

export default function TalentPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSearch = (val: string) => {
    setSearch(val)
    // Debounce: wait 300ms after last keystroke before querying
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setSearching(false)
      // Reset to initial list
      const load = async () => {
        const { data } = await supabase.from('profiles').select('*, campuses(name), departments(short_name)').eq('is_public', true).order('karma_points', { ascending: false }).limit(50)
        setStudents(data || [])
      }
      load()
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, campuses(name), departments(short_name)')
        .eq('is_public', true)
        .order('karma_points', { ascending: false })
        .limit(50)
        .ilike('full_name', `%${val}%`)
      setStudents(data || [])
      setSearching(false)
    }, 300)
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
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px 12px 44px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }} />
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>🔍</span>
          {searching && (
            <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
              Searching…
            </span>
          )}
        </div>

        {loading ? (
          <ListSkeleton count={4} />
        ) : students.length === 0 ? (
          <EmptyState
            icon="search"
            title={search ? `No students matching "${search}"` : "No students yet"}
            body={search ? "Try a different name or check the spelling." : "When students join and make their profiles public, they will appear here."}
            cta={search ? "Clear search" : undefined}
            onCta={search ? () => { setSearch(''); handleSearch('') } : undefined}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {students.map(s => (
              <div key={s.id} onClick={() => router.push(`/profile/${s.username}`)}
                className="card-hover"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                <Avatar name={s.full_name} avatarUrl={s.avatar_url} size={44} />
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
                  {s.karma_points > 0 && <span style={{ fontSize: 11, color: 'var(--yellow-text)', background: 'var(--yellow-light)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>⭐ {s.karma_points}</span>}
                  {user && user.id !== s.id && (
                    <button onClick={e => { e.stopPropagation(); router.push(`/profile/${s.username}`) }}
                      style={{ fontSize: 12, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '6px 14px', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
