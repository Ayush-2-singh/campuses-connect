'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', bio: '', github_url: '', linkedin_url: '', portfolio_url: '', twitter_url: '' })
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
      setProfile(data)
      const { data: grants } = await supabase.rpc('my_admin_grants')
      setIsAdmin((grants as any[])?.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin') || false)
      setForm({ full_name: data?.full_name || '', bio: data?.bio || '', github_url: data?.github_url || '', linkedin_url: data?.linkedin_url || '', portfolio_url: data?.portfolio_url || '', twitter_url: data?.twitter_url || '' })
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', user.id)
    const { data } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
    setProfile(data)
    setEditing(false)
    setSaving(false)
  }

  const avatarColor = (name: string) => {
    const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','var(--danger)','#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  const badgeStyle = (bg: string, text: string) => ({ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: bg, color: text, fontWeight: 600 })

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', paddingBottom: 80 }}>
      <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '13px 16px', zIndex: 10 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/feed')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>←</button>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Profile</h1>
          </div>
          <button onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving}
            style={{ background: editing ? 'var(--accent)' : 'var(--bg)', color: editing ? 'white' : 'var(--accent)', border: '1px solid var(--accent)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : editing ? 'Save' : 'Edit'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Profile Card */}
        <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, fontWeight: 700, flexShrink: 0 }}>
              {profile?.full_name?.[0] || user?.email?.[0] || '?'}
            </div>
            <div style={{ flex: 1 }}>
              {editing ? (
                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name" style={{ ...inputStyle, marginBottom: 6 }} />
              ) : (
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{profile?.full_name || 'No name'}</p>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>@{profile?.username || 'no username'}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {isAdmin && <span style={badgeStyle('var(--danger-light)', 'var(--danger)')}>Admin</span>}
                {profile?.college_email_verified && <span style={badgeStyle('var(--accent-light)', 'var(--accent)')}>✓ College Verified</span>}
                {profile?.streak_days > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--orange-light)', color: 'var(--orange-text)', fontWeight: 600 }}>🔥 {profile.streak_days} day streak</span>}
                {profile?.karma_points > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--yellow-light)', color: 'var(--yellow-text)', fontWeight: 600 }}>⭐ {profile.karma_points} karma</span>}
              </div>
            </div>
          </div>
          {editing ? (
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Write something about yourself..." rows={3}
              style={{ ...inputStyle, resize: 'none' }} />
          ) : (
            profile?.bio && <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{profile.bio}</p>
          )}
        </div>

        {/* Campus Info */}
        <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Campus Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'College', value: profile?.colleges?.name },
              { label: 'Campus', value: profile?.campuses?.name },
              { label: 'Department', value: profile?.departments?.short_name },
              { label: 'Year', value: profile?.current_year ? `Year ${profile.current_year}` : null },
              { label: 'Batch', value: profile?.batch_year },
              { label: 'Email', value: user?.email },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 3px', fontWeight: 500 }}>{item.label}</p>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{item.value || '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Links */}
        <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Links</h3>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'github_url', label: 'GitHub', placeholder: 'https://github.com/username' },
                { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
                { key: 'portfolio_url', label: 'Portfolio', placeholder: 'https://yoursite.com' },
                { key: 'twitter_url', label: 'Twitter/X', placeholder: 'https://twitter.com/username' },
              ].map(link => (
                <div key={link.key}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{link.label}</label>
                  <input type="url" value={(form as any)[link.key]} onChange={e => setForm(f => ({ ...f, [link.key]: e.target.value }))}
                    placeholder={link.placeholder} style={inputStyle} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { url: profile?.github_url, label: 'GitHub', icon: '🐙' },
                { url: profile?.linkedin_url, label: 'LinkedIn', icon: '💼' },
                { url: profile?.portfolio_url, label: 'Portfolio', icon: '🌐' },
                { url: profile?.twitter_url, label: 'Twitter/X', icon: '🐦' },
              ].filter(l => l.url).map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px', textDecoration: 'none' }}>
                  <span>{link.icon}</span>
                  <span style={{ fontSize: 13, color: 'var(--accent)' }}>{link.url}</span>
                </a>
              ))}
              {!profile?.github_url && !profile?.linkedin_url && !profile?.portfolio_url && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No links added. Click Edit to add.</p>
              )}
            </div>
          )}
        </div>

        {/* Admin */}
        {isAdmin && (
          <button onClick={() => router.push('/admin')}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', textAlign: 'left', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>⚙️ Admin Panel</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Manage users, posts and colleges</p>
          </button>
        )}

        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          style={{ background: 'var(--bg)', border: '1px solid var(--danger-border)', borderRadius: 14, padding: '14px', fontSize: 14, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
          Sign Out
        </button>
      </div>

      <div className="standalone-bottomnav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)', zIndex: 10 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex' }}>
          {[
            { icon: '🏠', label: 'Home', href: '/feed' },
            { icon: '🏫', label: 'Classroom', href: '/college' },
            { icon: '💼', label: 'Opportunities', href: '/opportunities' },
            { icon: '🌐', label: 'Communities', href: '/communities' },
            { icon: '👤', label: 'Profile', href: '/profile' },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 10, color: item.href === '/profile' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: item.href === '/profile' ? 600 : 400 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
