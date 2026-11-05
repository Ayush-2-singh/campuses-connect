'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

import MobileBottomNav from '@/components/MobileBottomNav'
import MobileMenu from '@/components/MobileMenu'
import Avatar from '@/components/Avatar'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'
import { useToast } from '@/components/Toast'
import { CountUpStat } from '@/components/CountUpStat'
import CollegeSearch from '@/components/CollegeSearch'
import { isNativePlatform } from '@/lib/native'

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
    full_name: '',
    bio: '',
    headline: '',
    github_url: '',
    linkedin_url: '',
    portfolio_url: '',
    twitter_url: '',
    skills: [] as string[],
    skillsInput: '',
  })
  const [isAdmin, setIsAdmin] = useState(false)

  const updateInteraction = async (scope: string) => {
    if (!user) return
    const sb = createClient()
    const { error } = await sb.from('profiles').update({ interaction_scope: scope }).eq('id', user.id)
    if (error) {
      toast('Could not update — try again.', { tone: 'danger' })
      return
    }
    setProfile((p: any) => ({ ...p, interaction_scope: scope }))
    toast(scope === 'campus' ? 'Now only your campus can connect with you' : 'Now every student can connect with you', {
      tone: 'success',
    })
  }
  const [menuOpen, setMenuOpen] = useState(false)
  // attach-campus-later pickers (shown when the user joined globally)

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

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (campusPick.college_id)
      supabase
        .from('campuses')
        .select('*')
        .eq('college_id', campusPick.college_id)
        .then(({ data }) => setCampusCampuses(data || []))
    else setCampusCampuses([])
  }, [campusPick.college_id, supabase])

  useEffect(() => {
    if (campusPick.campus_id)
      supabase
        .from('departments')
        .select('*')
        .eq('campus_id', campusPick.campus_id)
        .then(({ data }) => setCampusDepartments(data || []))
    else setCampusDepartments([])
  }, [campusPick.campus_id, supabase])

  const attachCampus = async () => {
    if (!campusPick.college_id || !campusPick.campus_id) return
    setCampusSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        college_id: campusPick.college_id,
        campus_id: campusPick.campus_id,
        department_id: campusPick.department_id || null,
      })
      .eq('id', user.id)
    setCampusSaving(false)
    if (error) {
      toast('Could not attach your campus', { tone: 'danger' })
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*, colleges(name), campuses(name), departments(name, short_name)')
      .eq('id', user.id)
      .single()
    setProfile(data)
    toast('Welcome to your campus!', { tone: 'success' })
  }

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace(
          '/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')
        )
        return
      }
      setUser(user)
      const { data } = await supabase
        .from('profiles')
        .select('*, colleges(name), campuses(name), departments(name, short_name)')
        .eq('id', user.id)
        .single()
      setProfile(data)

      // Connections: pending requests I received + my accepted connections
      const [reqRes, connRes] = await Promise.all([
        supabase.from('connections').select('id, requester_id').eq('receiver_id', user.id).eq('status', 'pending'),
        supabase
          .from('connections')
          .select('id, requester_id, receiver_id')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted'),
      ])
      const reqs = reqRes.data || []
      const conns = connRes.data || []
      const peerIds = [
        ...new Set([
          ...reqs.map((r) => r.requester_id),
          ...conns.map((c) => (c.requester_id === user.id ? c.receiver_id : c.requester_id)),
        ]),
      ]
      let profs: any[] = []
      if (peerIds.length) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', peerIds)
        profs = p || []
      }
      const profMap = Object.fromEntries(profs.map((p) => [p.id, p]))
      setConnRequests(reqs.map((r) => ({ id: r.id, profile: profMap[r.requester_id] })))
      setConnections(
        conns.map((c) => ({ id: c.id, profile: profMap[c.requester_id === user.id ? c.receiver_id : c.requester_id] }))
      )

      const { data: grants } = await supabase.rpc('my_admin_grants')
      setIsAdmin(
        (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin') ||
          false
      )
      setForm({
        full_name: data?.full_name || '',
        bio: data?.bio || '',
        headline: data?.headline || '',
        github_url: data?.github_url || '',
        linkedin_url: data?.linkedin_url || '',
        portfolio_url: data?.portfolio_url || '',
        twitter_url: data?.twitter_url || '',
        skills: Array.isArray(data?.skills) ? data.skills : [],
        skillsInput: '',
      })
      setLoading(false)
    }
    load()
  }, [])

  // ── Photo upload: pick → preview → upload to storage → save avatar_url ───────
  const pickPhoto = async () => {
    // Android shell: use the native sheet (Take photo / Choose from gallery).
    // pickImageFile() resolves to a real File, so uploadPhoto() below — and the
    // compress → storage → profiles update chain — is reused verbatim.
    if (!isNativePlatform()) {
      fileRef.current?.click()
      return
    }
    try {
      const { pickImageFile } = await import('@/lib/native')
      const file = await pickImageFile()
      if (file) await uploadPhoto(file)
    } catch (e: any) {
      toast(e?.message || 'Could not open the camera', { tone: 'danger' })
    }
  }

  const uploadPhoto = async (file: File) => {
    if (!user) return
    setUploading(true)
    try {
      // Compress image before upload to save storage
      const { compressImage } = await import('@/lib/compressImage')
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8 })
      const ext = 'jpg' // always use jpg after compression
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
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
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file', { tone: 'danger' })
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast('Image must be under 4MB', { tone: 'danger' })
      return
    }
    setPreviewUrl(URL.createObjectURL(file))
    uploadPhoto(file)
  }

  const respondConnection = async (id: string, accept: boolean) => {
    const { data: ok } = await supabase.rpc('respond_to_connection', { p_connection_id: id, p_accept: accept })
    if (!ok) {
      toast('Could not update the request', { tone: 'danger' })
      return
    }
    setConnRequests((prev) => prev.filter((r) => r.id !== id))
    if (accept) toast('Connected!', { tone: 'success' })
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        bio: form.bio,
        headline: form.headline,
        github_url: form.github_url,
        linkedin_url: form.linkedin_url,
        portfolio_url: form.portfolio_url,
        twitter_url: form.twitter_url,
        skills: form.skills,
      })
      .eq('id', user.id)
    const { data } = await supabase
      .from('profiles')
      .select('*, colleges(name), campuses(name), departments(name, short_name)')
      .eq('id', user.id)
      .single()
    setProfile(data)
    setEditing(false)
    setSaving(false)
    toast('Profile saved', { tone: 'success' })
  }

  const addSkill = () => {
    const v = form.skillsInput.trim()
    if (v && !form.skills.includes(v)) setForm((f) => ({ ...f, skills: [...f.skills, v], skillsInput: '' }))
  }

  // Two badge tones only: neutral for role, accent for the one verified signal.
  // Colour is never the only cue — each badge keeps its icon and its label.
  const badgeStyle = (tone: 'neutral' | 'accent') => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    padding: '3px 9px',
    borderRadius: 20,
    fontWeight: 600,
    ...(tone === 'accent'
      ? {
          background: 'var(--accent-light)',
          color: 'var(--accent-text)',
          border: '1px solid var(--accent-border)',
        }
      : {
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }),
  })

  // No `outline: none` here — it used to kill the global :focus-visible ring on
  // every field. The border is mixed from --text-secondary so the field edge
  // clears 3:1 against the card in both themes (WCAG 1.4.11), and 11px of
  // vertical padding keeps the field at the 44px touch minimum.
  const inputStyle = {
    width: '100%',
    border: '1px solid color-mix(in srgb, var(--text-secondary) 55%, transparent)',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--bg)',
    boxSizing: 'border-box' as const,
  }

  if (loading)
    return (
      <div style={{ minHeight: 'var(--app-vh)', padding: '24px 16px', maxWidth: 640, margin: '0 auto' }}>
        <ListSkeleton count={2} />
      </div>
    )

  return (
    // One accent — the product blue — and neutrals everywhere else. The gold
    // section override this page used to set made /profile the only screen in a
    // second brand colour, and orange-on-dark reads weaker than the blue.
    <div style={{ minHeight: 'var(--app-vh)', paddingBottom: 80 }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          padding: '10px 16px',
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => router.push('/experiences')}
              aria-label="Back"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 18,
                width: 44,
                height: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                margin: '-10px 0 -10px -12px',
                flexShrink: 0,
              }}
            >
              ←
            </button>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Profile</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => (editing ? handleSave() : setEditing(true))}
              disabled={saving}
              aria-label={editing ? 'Save profile changes' : 'Edit profile'}
              style={{
                background: editing ? 'var(--accent)' : 'transparent',
                color: editing ? 'var(--on-accent)' : 'var(--accent-text)',
                border: `1px solid ${editing ? 'var(--accent)' : 'var(--accent-border)'}`,
                padding: '0 18px',
                minHeight: 40,
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving…' : editing ? 'Save' : 'Edit profile'}
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 10,
                border: `1px solid ${menuOpen ? 'var(--accent-border)' : 'var(--border)'}`,
                background: menuOpen ? 'var(--accent-light)' : 'var(--bg)',
                color: menuOpen ? 'var(--accent-text)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="menu" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Stat tiles — the identity numbers, animated count-up ── */}
        <ProfileStats
          aura={profile?.aura_points || 0}
          karma={profile?.karma_points || 0}
          streak={profile?.streak_days || 0}
          connections={connections.length}
        />
        {/* ── Identity card ── */}
        <div
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Header band — one flat neutral wash. The gradient, the glow and the
              dot grid were three decorative layers competing with the face
              sitting on top of them. */}
          <div
            aria-hidden="true"
            style={{
              height: 'clamp(56px, 12vw, 84px)',
              background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg) 100%)',
            }}
          />

          <div style={{ padding: '0 20px 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 14,
                // Wraps instead of squeezing the name column on a narrow phone.
                flexWrap: 'wrap',
                marginTop: -34,
                marginBottom: 14,
                position: 'relative',
              }}
            >
              {/* The photo sits on its own surface ring (neutral, one hairline)
                  so it stays legible over the band in BOTH themes — the old
                  accent glow melted into the gradient on dark. */}
              <div
                style={{
                  padding: 4,
                  borderRadius: '50%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-strong)',
                  display: 'inline-flex',
                  flexShrink: 0,
                }}
              >
                <Avatar
                  name={profile?.full_name}
                  avatarUrl={previewUrl || profile?.avatar_url}
                  size={76}
                  fontSize={30}
                />
              </div>
              {editing && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
                  <button
                    onClick={pickPhoto}
                    disabled={uploading}
                    style={{
                      position: 'absolute',
                      left: 54,
                      bottom: 0,
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      border: '2px solid var(--bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: uploading ? 'wait' : 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    aria-label="Upload photo"
                  >
                    <Icon name={uploading ? 'more' : 'plus'} size={16} />
                  </button>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                    {uploading ? 'Uploading…' : 'Tap the + to add a photo'}
                  </p>
                </>
              )}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                {editing ? (
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Full name"
                    aria-label="Full name"
                    style={{ ...inputStyle, marginBottom: 6 }}
                  />
                ) : (
                  <h2
                    style={{
                      fontSize: 21,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: '0 0 2px',
                      letterSpacing: '-0.02em',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {profile?.full_name || 'No name'}
                  </h2>
                )}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  @{profile?.username || 'no username'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {isAdmin && (
                <span style={badgeStyle('neutral')}>
                  <Icon name="shield" size={12} style={{ verticalAlign: '-1px' }} /> Admin
                </span>
              )}
              {profile?.college_email_verified && (
                <span style={badgeStyle('accent')}>
                  <Icon name="check" size={12} style={{ verticalAlign: '-1px' }} /> College verified
                </span>
              )}
            </div>

            {/* Headline — reads as body copy, not as accent-coloured text: at
                13.5px the accent was the weakest contrast on the card. */}
            {editing ? (
              <input
                type="text"
                value={form.headline}
                onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                placeholder="Full-stack dev · SIH finalist · DSA 500+"
                aria-label="Headline"
                style={{ ...inputStyle, marginBottom: 10, fontWeight: 600 }}
              />
            ) : profile?.headline ? (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: '0 0 10px',
                  lineHeight: 1.5,
                  overflowWrap: 'anywhere',
                }}
              >
                {profile.headline}
              </p>
            ) : null}

            {/* Bio */}
            {editing ? (
              <textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Your skills, projects, what you're looking for…"
                aria-label="Bio"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 10, lineHeight: 1.6 }}
              />
            ) : (
              profile?.bio && (
                <p
                  style={{
                    fontSize: 14.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    margin: '0 0 14px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {profile.bio}
                </p>
              )
            )}

            {/* Skills — power the AI match */}
            <div>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  margin: '0 0 8px',
                }}
              >
                Skills{' '}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  (used for AI-matched opportunities)
                </span>
              </p>
              {editing ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      value={form.skillsInput}
                      onChange={(e) => setForm((f) => ({ ...f, skillsInput: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          addSkill()
                        }
                      }}
                      placeholder="e.g. React, Python, Figma — Enter to add"
                      aria-label="Add a skill"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={addSkill}
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid color-mix(in srgb, var(--text-secondary) 55%, transparent)',
                        borderRadius: 10,
                        padding: '0 16px',
                        minHeight: 44,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {form.skills.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {form.skills.map((s) => (
                        <span
                          key={s}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            padding: '4px 10px',
                            borderRadius: 20,
                          }}
                        >
                          {s}
                          <button
                            onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))}
                            aria-label={`Remove ${s}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: 15,
                              lineHeight: 1,
                              fontFamily: 'inherit',
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : profile?.skills?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.skills.map((s: string) => (
                    <span
                      key={s}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        padding: '4px 10px',
                        borderRadius: 20,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                  No skills yet — add a few and opportunities get matched to them.{' '}
                  <Icon name="sparkles" size={12} style={{ verticalAlign: '-2px' }} />
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Connections — requests + accepted, with messaging */}
        <div
          className="profile-reveal-2"
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 14px',
            }}
          >
            <Icon name="users" size={15} style={{ color: 'var(--text-secondary)' }} /> Connections
          </h2>

          {connRequests.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  margin: '0 0 4px',
                }}
              >
                Requests ({connRequests.length})
              </p>
              {connRequests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <Avatar
                    name={r.profile?.full_name}
                    avatarUrl={r.profile?.avatar_url}
                    size={36}
                    onClick={() => r.profile?.username && router.push(`/profile/${r.profile.username}`)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {r.profile?.full_name || 'Student'}
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>@{r.profile?.username}</p>
                  </div>
                  {/* One filled action per row (accept, the accent) and one
                      neutral outline. The labels carry the meaning — green +
                      red were a second colour system for the same two choices. */}
                  <button
                    onClick={() => respondConnection(r.id, true)}
                    aria-label={`Accept connection request from ${r.profile?.full_name || 'this student'}`}
                    style={{
                      padding: '0 14px',
                      minHeight: 40,
                      borderRadius: 10,
                      border: '1px solid var(--accent)',
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondConnection(r.id, false)}
                    aria-label={`Decline connection request from ${r.profile?.full_name || 'this student'}`}
                    style={{
                      padding: '0 14px',
                      minHeight: 40,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Decline
                  </button>
                </div>
              ))}
            </>
          )}

          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              margin: '14px 0 4px',
            }}
          >
            Your connections ({connections.length})
          </p>
          {connections.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
              No connections yet. Requests appear here once someone connects with you.
            </p>
          ) : (
            connections.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Avatar
                  name={c.profile?.full_name}
                  avatarUrl={c.profile?.avatar_url}
                  size={36}
                  onClick={() => c.profile?.username && router.push(`/profile/${c.profile.username}`)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    {c.profile?.full_name || 'Student'}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>@{c.profile?.username}</p>
                </div>
                {c.profile?.username && (
                  <button
                    onClick={() => router.push(`/profile/${c.profile.username}`)}
                    aria-label={`View ${c.profile?.full_name || 'this student'}'s profile`}
                    style={{
                      padding: '0 14px',
                      minHeight: 40,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    View profile
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Campus Info */}
        <div
          className="profile-reveal-3"
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>
            Campus info
          </h2>
          {/* `minmax(0, 1fr)` + `.mg-stack`: a bare `1fr` track cannot shrink
              below its content, so a long email address (one unbreakable
              token) widened both columns and the whole page to 425px on a
              360px phone. Cards stack on a phone now. */}
          <div
            className="mg-stack"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}
          >
            {[
              { label: 'College', value: profile?.colleges?.name || (profile?.campus_id ? null : 'Global Campus') },
              { label: 'Campus', value: profile?.campuses?.name || (!profile?.campus_id ? 'Global Campus' : null) },
              { label: 'Department', value: profile?.departments?.short_name },
              { label: 'Year', value: profile?.current_year ? `Year ${profile.current_year}` : null },
              { label: 'Batch', value: profile?.batch_year },
              { label: 'Email', value: user?.email },
            ].map((item) => (
              <div
                key={item.label}
                style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}
              >
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 3px', fontWeight: 500 }}>
                  {item.label}
                </p>
                <p
                  style={{
                    fontSize: 13.5,
                    color: 'var(--text-primary)',
                    margin: 0,
                    fontWeight: 600,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.value || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Join your campus later — for users who joined globally */}
        {!profile?.campus_id && (
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 16,
              border: '1px solid var(--accent-border)',
              padding: 20,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h2
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: '0 0 6px',
              }}
            >
              <Icon name="grad" size={15} style={{ color: 'var(--accent-text)' }} /> You&apos;re at the Global Campus
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              Anyone can join the Global Campus. When your college goes live, move to your own campus — your posts and
              profile stay with you.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <CollegeSearch
                selectedId={campusPick.college_id}
                onSelect={(c) => setCampusPick((p) => ({ ...p, college_id: c.id, campus_id: '', department_id: '' }))}
                maxHeight={220}
              />
              {campusPick.college_id && (
                <select
                  value={campusPick.campus_id}
                  onChange={(e) => setCampusPick((p) => ({ ...p, campus_id: e.target.value, department_id: '' }))}
                  style={inputStyle}
                >
                  <option value="">Select your campus…</option>
                  {campusCampuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {campusPick.campus_id && (
                <select
                  value={campusPick.department_id}
                  onChange={(e) => setCampusPick((p) => ({ ...p, department_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select your department (optional)…</option>
                  {campusDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.short_name} — {d.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={attachCampus}
                disabled={!campusPick.college_id || !campusPick.campus_id || campusSaving}
                style={{
                  background:
                    !campusPick.college_id || !campusPick.campus_id || campusSaving
                      ? 'var(--disabled)'
                      : 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  minHeight: 48,
                  padding: '11px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {campusSaving ? 'Joining…' : 'Move to my campus'}
              </button>
            </div>
          </div>
        )}

        {/* Links */}
        <div
          className="profile-reveal-4"
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Links</h2>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'github_url', label: 'GitHub', placeholder: 'https://github.com/username' },
                { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
                { key: 'portfolio_url', label: 'Portfolio', placeholder: 'https://yoursite.com' },
                { key: 'twitter_url', label: 'Twitter/X', placeholder: 'https://twitter.com/username' },
              ].map((link) => (
                <div key={link.key}>
                  {/* Real label/input pairing: the label used to be decoration,
                      so a screen reader announced four unnamed URL fields. */}
                  <label
                    htmlFor={`profile-${link.key}`}
                    style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}
                  >
                    {link.label}
                  </label>
                  <input
                    id={`profile-${link.key}`}
                    type="url"
                    value={(form as any)[link.key]}
                    onChange={(e) => setForm((f) => ({ ...f, [link.key]: e.target.value }))}
                    placeholder={link.placeholder}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { url: profile?.github_url, label: 'GitHub', icon: 'github', filled: true },
                { url: profile?.linkedin_url, label: 'LinkedIn', icon: 'linkedin', filled: true },
                { url: profile?.portfolio_url, label: 'Portfolio', icon: 'globe', filled: false },
                { url: profile?.twitter_url, label: 'Twitter/X', icon: 'twitter', filled: true },
              ]
                .filter((l) => l.url)
                .map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} — ${link.url} (opens in a new tab)`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      textDecoration: 'none',
                      minHeight: 56,
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        borderRadius: 8,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Icon name={link.icon} size={15} filled={link.filled} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {link.label}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12.5,
                          color: 'var(--text-secondary)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {link.url}
                      </span>
                    </span>
                  </a>
                ))}
              {!profile?.github_url && !profile?.linkedin_url && !profile?.portfolio_url && !profile?.twitter_url && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                  No links added yet — use Edit profile to add GitHub, LinkedIn, your portfolio or X.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Interaction scope — who can connect with you */}
        <div
          className="profile-reveal-5"
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            <Icon name="lock" size={15} style={{ color: 'var(--text-secondary)' }} /> Who can connect with you?
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
            Choose who can send you connect requests and start chats with you.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                val: 'global',
                icon: 'globe',
                title: 'Everyone (Global)',
                desc: 'Any student can connect with you and message you.',
              },
              ...(profile?.campus_id
                ? [
                    {
                      val: 'campus',
                      icon: 'school',
                      title: 'My campus only',
                      desc: 'Only students from your own campus can connect with you.',
                    },
                  ]
                : []),
            ].map((opt) => {
              const active = (profile?.interaction_scope || 'global') === opt.val
              return (
                <button
                  key={opt.val}
                  onClick={() => {
                    if (!active) updateInteraction(opt.val)
                  }}
                  // The current choice is exposed to assistive tech, not just
                  // painted: aria-pressed + a check icon + the border ring.
                  aria-pressed={active}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    padding: '12px 14px',
                    minHeight: 56,
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxShadow: active ? '0 0 0 1px var(--accent)' : 'none',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexShrink: 0,
                      color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon name={opt.icon} size={20} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                      {opt.title} {active && <Icon name="check" size={13} style={{ verticalAlign: '-2px' }} />}
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {opt.desc}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={() => router.push('/admin')}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '16px 20px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: '0 0 2px',
              }}
            >
              <Icon name="wrench" size={15} style={{ color: 'var(--text-secondary)' }} /> Admin panel
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
              Manage users, posts and colleges
            </p>
          </button>
        )}

        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/')
          }}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 16,
            minHeight: 48,
            padding: '14px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--danger-text)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          Sign out
        </button>
      </main>

      <MobileBottomNav pathname={pathname} onNavigate={(href) => router.push(href)} />
      <MobileMenu
        open={menuOpen}
        top={52}
        pathname={pathname}
        onClose={() => setMenuOpen(false)}
        onNavigate={(href) => router.push(href)}
      />
    </div>
  )
}

/**
 * STAT TILES — Aura / Karma / Streak / Connections, each a count-up number.
 *
 * All four share ONE neutral surface and one text colour: the numbers are the
 * information, not the four hues (blue/yellow/orange/green) the tiles used to
 * wear. Rank comes from position and size, so nothing relies on colour alone,
 * and the value reads at full text-primary contrast in both themes.
 */
function ProfileStats({
  aura,
  karma,
  streak,
  connections,
}: {
  aura: number
  karma: number
  streak: number
  connections: number
}) {
  return (
    <div
      className="profile-reveal mg-2"
      role="group"
      aria-label="Your profile statistics"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}
    >
      <CountUpStat label="Aura" value={aura} />
      <CountUpStat label="Karma" value={karma} />
      <CountUpStat label="Streak" value={streak} />
      <CountUpStat label="Friends" value={connections} />
    </div>
  )
}
