'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import MobileBottomNav from '@/components/MobileBottomNav'
import MobileMenu from '@/components/MobileMenu'
import Avatar from '@/components/Avatar'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'
import { useToast } from '@/components/Toast'

const AVATAR_BUCKET = 'avatars'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    full_name: '', bio: '', headline: '',
    github_url: '', linkedin_url: '', portfolio_url: '', twitter_url: '',
    skills: [] as string[], skillsInput: '',
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // attach-campus-later pickers (shown when the user joined globally)
  const [campusColleges, setCampusColleges] = useState<any[]>([])
  const [campusCampuses, setCampusCampuses] = useState<any[]>([])
  const [campusDepartments, setCampusDepartments] = useState<any[]>([])
  const [campusPick, setCampusPick] = useState({ college_id: '', campus_id: '', department_id: '' })
  const [campusSaving, setCampusSaving] = useState(false)
  const [connRequests, setConnRequests] = useState<any[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { show: toast } = useToast()

  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Load colleges so a global user can attach their campus later.
  useEffect(() => {
    supabase.from('colleges').select('*').eq('is_active', true).then(({ data }) => setCampusColleges(data || []))
  }, [supabase])

  useEffect(() => {
    if (campusPick.college_id) supabase.from('campuses').select('*').eq('college_id', campusPick.college_id).then(({ data }) => setCampusCampuses(data || []))
    else setCampusCampuses([])
  }, [campusPick.college_id, supabase])

  useEffect(() => {
    if (campusPick.campus_id) supabase.from('departments').select('*').eq('campus_id', campusPick.campus_id).then(({ data }) => setCampusDepartments(data || []))
    else setCampusDepartments([])
  }, [campusPick.campus_id, supabase])

  const attachCampus = async () => {
    if (!campusPick.college_id || !campusPick.campus_id) return
    setCampusSaving(true)
    const { error } = await supabase.from('profiles').update({
      college_id: campusPick.college_id,
      campus_id: campusPick.campus_id,
      department_id: campusPick.department_id || null,
    }).eq('id', user.id)
    setCampusSaving(false)
    if (error) { toast('Could not attach your campus', { tone: 'danger' }); return }
    const { data } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
    setProfile(data)
    toast('Welcome to your campus! 🎉', { tone: 'success' })
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
      setUser(user)
      const { data } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
      setProfile(data)

      // Connections: pending requests I received + my accepted connections
      const [reqRes, connRes] = await Promise.all([
        supabase.from('connections').select('id, requester_id').eq('receiver_id', user.id).eq('status', 'pending'),
        supabase.from('connections').select('id, requester_id, receiver_id')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status', 'accepted'),
      ])
      const reqs = reqRes.data || []
      const conns = connRes.data || []
      const peerIds = [...new Set([
        ...reqs.map(r => r.requester_id),
        ...conns.map(c => c.requester_id === user.id ? c.receiver_id : c.requester_id),
      ])]
      let profs: any[] = []
      if (peerIds.length) {
        const { data: p } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', peerIds)
        profs = p || []
      }
      const profMap = Object.fromEntries(profs.map(p => [p.id, p]))
      setConnRequests(reqs.map(r => ({ id: r.id, profile: profMap[r.requester_id] })))
      setConnections(conns.map(c => ({ id: c.id, profile: profMap[c.requester_id === user.id ? c.receiver_id : c.requester_id] })))

      const { data: grants } = await supabase.rpc('my_admin_grants')
      setIsAdmin((grants as any[])?.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin') || false)
      setForm({
        full_name: data?.full_name || '', bio: data?.bio || '', headline: data?.headline || '',
        github_url: data?.github_url || '', linkedin_url: data?.linkedin_url || '',
        portfolio_url: data?.portfolio_url || '', twitter_url: data?.twitter_url || '',
        skills: Array.isArray(data?.skills) ? data.skills : [], skillsInput: '',
      })
      setLoading(false)
    }
    load()
  }, [])

  // ── Photo upload: pick → preview → upload to storage → save avatar_url ───────
  const pickPhoto = () => fileRef.current?.click()

  const uploadPhoto = async (file: File) => {
    if (!user) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      const { error: updErr } = await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', user.id)
      if (updErr) throw updErr
      setProfile((p: any) => ({ ...p, avatar_url: pub.publicUrl }))
      toast('Photo updated', { tone: 'success' })
    } catch (e: any) {
      toast(e?.message || 'Could not upload photo — is the avatars bucket set up?', { tone: 'danger' })
    } finally {
      setUploading(false)
      setPreviewUrl(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Please choose an image file', { tone: 'danger' }); return }
    if (file.size > 4 * 1024 * 1024) { toast('Image must be under 4MB', { tone: 'danger' }); return }
    setPreviewUrl(URL.createObjectURL(file))
    uploadPhoto(file)
  }

  const respondConnection = async (id: string, accept: boolean) => {
    const { data: ok } = await supabase.rpc('respond_to_connection', { p_connection_id: id, p_accept: accept })
    if (!ok) { toast('Could not update the request', { tone: 'danger' }); return }
    setConnRequests(prev => prev.filter(r => r.id !== id))
    if (accept) toast('Connected! You can now message each other', { tone: 'success' })
  }

  const openConversation = async (peerId: string) => {
    const { data: convId, error } = await supabase.rpc('start_or_get_conversation', { p_peer_id: peerId })
    if (error || !convId) { toast('You can only message people you are connected with', { tone: 'danger' }); return }
    router.push(`/messages/${convId}`)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: form.full_name,
      bio: form.bio,
      headline: form.headline,
      github_url: form.github_url,
      linkedin_url: form.linkedin_url,
      portfolio_url: form.portfolio_url,
      twitter_url: form.twitter_url,
      skills: form.skills,
    }).eq('id', user.id)
    const { data } = await supabase.from('profiles').select('*, colleges(name), campuses(name), departments(name, short_name)').eq('id', user.id).single()
    setProfile(data)
    setEditing(false)
    setSaving(false)
    toast('Profile saved', { tone: 'success' })
  }

  const addSkill = () => {
    const v = form.skillsInput.trim()
    if (v && !form.skills.includes(v)) setForm(f => ({ ...f, skills: [...f.skills, v], skillsInput: '' }))
  }

  const badgeStyle = (bg: string, text: string) => ({ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: bg, color: text, fontWeight: 600 })

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', padding: '24px 16px', maxWidth: 640, margin: '0 auto' }}>
      <ListSkeleton count={2} />
    </div>
  )

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', paddingBottom: 80 }}>
      <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '13px 16px', zIndex: 30 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/feed')} aria-label="Back" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Profile</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThemeToggle mode="inline" />
            <button onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving}
              style={{ background: editing ? 'var(--accent)' : 'var(--bg)', color: editing ? 'var(--on-accent)' : 'var(--accent)', border: '1px solid var(--accent)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving...' : editing ? 'Save' : 'Edit'}
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{ width: 30, height: 30, borderRadius: '50%', border: menuOpen ? '1px solid var(--accent)' : '1px solid var(--border)', background: menuOpen ? 'var(--accent-light)' : 'var(--bg)', color: menuOpen ? 'var(--accent-text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Icon name="menu" size={15} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Premium Profile Card with gradient banner ── */}
        <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {/* Gradient banner */}
          <div style={{ height: 84, background: 'linear-gradient(120deg, #E0A83C 0%, #41C8D8 55%, #A97BF0 100%)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(300px 90px at 85% 20%, rgba(255,255,255,0.35), transparent 70%)' }} />
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: -34, marginBottom: 14, position: 'relative' }}>
              <Avatar name={profile?.full_name} avatarUrl={previewUrl || profile?.avatar_url} size={76} ring fontSize={30} />
              {editing && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
                  <button
                    onClick={pickPhoto}
                    disabled={uploading}
                    style={{ position: 'absolute', left: 52, bottom: 0, width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', boxShadow: 'var(--shadow)' }}
                    aria-label="Upload photo"
                  >
                    <Icon name={uploading ? 'more' : 'plus'} size={14} />
                  </button>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    {uploading ? 'Uploading…' : 'Tap the + to add a photo'}
                  </p>
                </>
              )}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                {editing ? (
                  <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Full name" style={{ ...inputStyle, marginBottom: 6 }} />
                ) : (
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.02em' }}>{profile?.full_name || 'No name'}</p>
                )}
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>@{profile?.username || 'no username'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {isAdmin && <span style={badgeStyle('var(--danger-light)', 'var(--danger)')}>Admin</span>}
              {profile?.college_email_verified && <span style={badgeStyle('var(--accent-light)', 'var(--accent)')}>✓ College Verified</span>}
              {profile?.streak_days > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--orange-light)', color: 'var(--orange-text)', fontWeight: 600 }}>🔥 {profile.streak_days} day streak</span>}
              {profile?.aura_points > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent-text)', fontWeight: 600 }}>⚡ {profile.aura_points} aura</span>}
              {profile?.karma_points > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--yellow-light)', color: 'var(--yellow-text)', fontWeight: 600 }}>⭐ {profile.karma_points} karma</span>}
            </div>

            {/* Headline (new) */}
            {editing ? (
              <input type="text" value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                placeholder="Headline — e.g. Full-stack dev · SIH Finalist · DSA 500+" style={{ ...inputStyle, marginBottom: 10, fontWeight: 600 }} />
            ) : profile?.headline ? (
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)', margin: '0 0 10px' }}>{profile.headline}</p>
            ) : null}

            {/* Bio */}
            {editing ? (
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Write something about yourself — your skills, projects, what you're looking for..."
                rows={3} style={{ ...inputStyle, resize: 'none', marginBottom: 10 }} />
            ) : (
              profile?.bio && <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>{profile.bio}</p>
            )}

            {/* Skills — power the AI match */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }}>
                Skills <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(used for AI-matched opportunities)</span>
              </p>
              {editing ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="text"
                      value={form.skillsInput}
                      onChange={e => setForm(f => ({ ...f, skillsInput: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill() } }}
                      placeholder="e.g. React, Python, Figma — Enter to add"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={addSkill}
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
                  </div>
                  {form.skills.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {form.skills.map(s => (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', padding: '3px 10px', borderRadius: 20 }}>
                          {s}
                          <button onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))}
                            aria-label={`Remove ${s}`}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : profile?.skills?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.skills.map((s: string) => (
                    <span key={s} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 20 }}>{s}</span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No skills yet. Add skills to get sharper AI matches on opportunities. ✨</p>
              )}
            </div>
          </div>
        </div>

        {/* Connections — requests + accepted, with messaging */}
        <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>🤝 Connections</h3>

          {connRequests.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 4px' }}>Requests ({connRequests.length})</p>
              {connRequests.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <Avatar name={r.profile?.full_name} avatarUrl={r.profile?.avatar_url} size={36}
                    onClick={() => r.profile?.username && router.push(`/profile/${r.profile.username}`)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{r.profile?.full_name || 'Student'}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{r.profile?.username}</p>
                  </div>
                  <button onClick={() => respondConnection(r.id, true)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Accept</button>
                  <button onClick={() => respondConnection(r.id, false)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--bg)', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Decline</button>
                </div>
              ))}
            </>
          )}

          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 4px' }}>Your connections ({connections.length})</p>
          {connections.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              No connections yet. Connect with people from the Talent directory — only connected people can message each other.
            </p>
          ) : connections.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <Avatar name={c.profile?.full_name} avatarUrl={c.profile?.avatar_url} size={36}
                onClick={() => c.profile?.username && router.push(`/profile/${c.profile.username}`)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{c.profile?.full_name || 'Student'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{c.profile?.username}</p>
              </div>
              <button onClick={() => c.profile?.id && openConversation(c.profile.id)}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>💬 Message</button>
            </div>
          ))}
        </div>

        {/* Campus Info */}
        <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Campus Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'College', value: profile?.colleges?.name || (profile?.campus_id ? null : '🌐 Global Campus') },
              { label: 'Campus', value: profile?.campuses?.name || (!profile?.campus_id ? '🌐 Global Campus' : null) },
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

        {/* Join your campus later — for users who joined globally */}
        {!profile?.campus_id && (
          <div style={{ background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--accent-border)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🎓 You&apos;re at the Global Campus</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>Anyone can join the Global Campus. When your college goes live, move to your own campus — your posts and profile stay with you.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={campusPick.college_id} onChange={e => setCampusPick(p => ({ ...p, college_id: e.target.value, campus_id: '', department_id: '' }))} style={inputStyle}>
                <option value="">Select your college…</option>
                {campusColleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {campusPick.college_id && (
                <select value={campusPick.campus_id} onChange={e => setCampusPick(p => ({ ...p, campus_id: e.target.value, department_id: '' }))} style={inputStyle}>
                  <option value="">Select your campus…</option>
                  {campusCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {campusPick.campus_id && (
                <select value={campusPick.department_id} onChange={e => setCampusPick(p => ({ ...p, department_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select your department (optional)…</option>
                  {campusDepartments.map(d => <option key={d.id} value={d.id}>{d.short_name} — {d.name}</option>)}
                </select>
              )}
              <button
                onClick={attachCampus}
                disabled={!campusPick.college_id || !campusPick.campus_id || campusSaving}
                style={{ background: !campusPick.college_id || !campusPick.campus_id || campusSaving ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {campusSaving ? 'Joining…' : 'Move to my campus'}
              </button>
            </div>
          </div>
        )}

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

      <MobileBottomNav pathname={pathname} onNavigate={href => router.push(href)} />
      <MobileMenu open={menuOpen} top={52} pathname={pathname} onClose={() => setMenuOpen(false)} onNavigate={href => router.push(href)} />
    </div>
  )
}
