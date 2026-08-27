'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'

type Event = {
  id: string
  title: string
  description: string
  category: string
  location: string
  starts_at: string
  ends_at: string
  cover_url: string
  max_attendees: number
  is_featured: boolean
  created_by: string
  profiles?: { full_name: string; username: string }
  attendee_count?: number
  is_attending?: boolean
}

const CATEGORIES = ['general', 'hackathon', 'workshop', 'tech-talk', 'fest', 'sports', 'meetup', 'other']

const catEmoji: Record<string, string> = {
  general: '📌', hackathon: '💻', workshop: '🛠️', 'tech-talk': '🎤', fest: '🎉', sports: '⚽', meetup: '🤝', other: '📅',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function EventsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [posting, setPosting] = useState(false)
  const [gallery, setGallery] = useState<Record<string, any[]>>({})
  const [galleryOpen, setGalleryOpen] = useState<string | null>(null)
  const [uploadUrl, setUploadUrl] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editTarget, setEditTarget] = useState<Event | null>(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'general', location: '', starts_at: '', ends_at: '', max_attendees: '' })

  const fetchEvents = async (campusId?: string | null) => {
    // NOTE: campus_events has no FK to profiles, so we can't embed profiles(...)
    // (PostgREST would error the whole query). Fetch host names separately.
    // Filter by campus_id so students only see events from their campus.
    let q = supabase
      .from('campus_events')
      .select('*')
      .eq('status', 'published')
      .order('starts_at', { ascending: false })
      .limit(30)
    if (campusId) {
      q = q.eq('campus_id', campusId)
    }
    const { data: evs } = await q
    const list = (evs || []) as Event[]
    const hostIds = [...new Set(list.map(e => e.created_by))]
    if (hostIds.length) {
      const { data: hosts } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .in('id', hostIds)
      const hostMap = new Map((hosts || []).map((h: any) => [h.id, h]))
      for (const e of list) e.profiles = hostMap.get(e.created_by) || undefined
    }
    return list
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const evs = await fetchEvents(prof?.campus_id)

      // Batch: fetch all attendance in one query instead of N+1
      const eventIds = evs.map(e => e.id)
      const [{ data: mine }, { data: allAttendees }] = await Promise.all([
        supabase.from('event_attendees').select('event_id').eq('user_id', user.id),
        eventIds.length
          ? supabase.from('event_attendees').select('event_id').in('event_id', eventIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const attending = new Set((mine || []).map((a: any) => a.event_id))
      const countMap = new Map<string, number>()
      for (const a of (allAttendees || []) as any[]) {
        countMap.set(a.event_id, (countMap.get(a.event_id) || 0) + 1)
      }
      for (const e of evs) {
        e.attendee_count = countMap.get(e.id) || 0
        e.is_attending = attending.has(e.id)
      }
      setEvents([...evs])
      setLoading(false)
    }
    load()
  }, [])

  const openGallery = async (ev: Event) => {
    setGalleryOpen(ev.id)
    const { data } = await supabase.from('event_gallery').select('*').eq('event_id', ev.id).order('created_at', { ascending: false })
    setGallery(g => ({ ...g, [ev.id]: data || [] }))
  }

  const reloadEvents = async () => {
    const evs = await fetchEvents(profile?.campus_id)
    setEvents(evs)
  }

  const createEvent = async () => {
    if (!form.title.trim() || !form.starts_at) return
    setPosting(true)
    if (editTarget) {
      await supabase.from('campus_events').update({
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        location: form.location,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null,
      }).eq('id', editTarget.id)
      setEditTarget(null)
      setShowCreate(false)
      setForm({ title: '', description: '', category: 'general', location: '', starts_at: '', ends_at: '', max_attendees: '' })
      await reloadEvents()
      setPosting(false)
      return
    }
    const { data, error } = await supabase.from('campus_events').insert({
      campus_id: profile?.campus_id,
      college_id: profile?.college_id,
      created_by: user.id,
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      location: form.location,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null,
      status: 'published',
    }).select('id').single()
    if (data) {
      try { await supabase.rpc('reward_event_host', { p_event_id: data.id }) } catch {}
    }
    if (!error) {
      setShowCreate(false)
      setForm({ title: '', description: '', category: 'general', location: '', starts_at: '', ends_at: '', max_attendees: '' })
      await reloadEvents()
    }
    setPosting(false)
  }

  const openEdit = (ev: Event) => {
    setEditTarget(ev)
    setShowCreate(true)
    setForm({
      title: ev.title,
      description: ev.description || '',
      category: ev.category || 'general',
      location: ev.location || '',
      starts_at: ev.starts_at ? ev.starts_at.slice(0, 16) : '',
      ends_at: ev.ends_at ? ev.ends_at.slice(0, 16) : '',
      max_attendees: ev.max_attendees ? String(ev.max_attendees) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteEvent = async (ev: Event) => {
    if (!window.confirm(`Delete "${ev.title}"? This removes the event and its gallery.`)) return
    await supabase.from('campus_events').update({ status: 'cancelled' }).eq('id', ev.id)
    await reloadEvents()
  }

  const toggleAttend = async (ev: Event) => {
    if (!user) return
    if (ev.is_attending) {
      await supabase.from('event_attendees').delete().eq('event_id', ev.id).eq('user_id', user.id)
      ev.is_attending = false
      ev.attendee_count = Math.max(0, (ev.attendee_count || 1) - 1)
    } else {
      await supabase.rpc('attend_event', { p_event_id: ev.id })
      ev.is_attending = true
      ev.attendee_count = (ev.attendee_count || 0) + 1
    }
    setEvents([...events])
  }

  const uploadGallery = async (ev: Event) => {
    if (!uploadUrl.trim()) return
    setUploading(true)
    await supabase.from('event_gallery').insert({
      event_id: ev.id,
      uploaded_by: user.id,
      media_url: uploadUrl.trim(),
      media_type: uploadUrl.includes('.mp4') || uploadUrl.includes('.webm') ? 'video' : 'image',
      caption: uploadCaption,
    })
    setUploadUrl(''); setUploadCaption('')
    const { data } = await supabase.from('event_gallery').select('*').eq('event_id', ev.id).order('created_at', { ascending: false })
    setGallery(g => ({ ...g, [ev.id]: data || [] }))
    setUploading(false)
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>🎪 Events</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Campus events, hackathons & meetups — attend, share memories, earn karma.</p>
          </div>
          <button onClick={() => { setShowCreate(s => !s); if (!showCreate) setEditTarget(null) }}
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Host Event
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>{editTarget ? 'Edit event' : 'Host a campus event 🎉'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event title *"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's this event about?" rows={3}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location / online"
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                <input value={form.max_attendees} onChange={e => setForm(f => ({ ...f, max_attendees: e.target.value }))} placeholder="Max attendees (optional)" type="number"
                  style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setShowCreate(false); setEditTarget(null) }} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={createEvent} disabled={!form.title.trim() || !form.starts_at || posting}
                style={{ flex: 2, background: !form.title.trim() || !form.starts_at ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Saving…' : editTarget ? 'Save Changes' : '🚀 Publish Event (+20 karma)'}
              </button>
            </div>
          </div>
        )}

        {/* Event list */}
        {loading ? <ListSkeleton count={2} /> :
          events.length === 0 ? (
            <EmptyState icon="calendar" title="No events yet" body="Be the first to host something on your campus — fests, hackathons, tech talks." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {events.map(ev => {
                const isPast = new Date(ev.starts_at).getTime() < Date.now()
                return (
                  <div key={ev.id} style={{ background: 'var(--bg)', border: ev.is_featured ? '1px solid var(--accent-border)' : '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                          <span style={{ fontSize: 26, flexShrink: 0 }}>{catEmoji[ev.category] || '📌'}</span>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{ev.title}</h3>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                              {fmtDate(ev.starts_at)} {ev.location ? `· 📍 ${ev.location}` : ''}
                            </p>
                            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                              by @{ev.profiles?.username || 'someone'} · {ev.attendee_count || 0} going
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => toggleAttend(ev)} disabled={isPast}
                            style={{
                              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: isPast ? 'default' : 'pointer', fontFamily: 'inherit', border: 'none',
                              background: ev.is_attending ? 'var(--success)' : 'var(--accent)',
                              color: ev.is_attending || !ev.is_attending ? 'var(--on-accent)' : 'var(--on-accent)',
                              opacity: isPast ? 0.5 : 1,
                            }}>
                            {isPast ? 'Ended' : ev.is_attending ? '✓ Going' : '+ RSVP'}
                          </button>
                          <button onClick={() => openGallery(ev)} style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                            📸 Gallery ({gallery[ev.id]?.length || 0})
                          </button>
                          {user?.id === ev.created_by && (
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button onClick={() => openEdit(ev)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                              <button onClick={() => deleteEvent(ev)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger-text)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {ev.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{ev.description}</p>}
                    </div>

                    {/* Gallery */}
                    {galleryOpen === ev.id && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg-secondary)' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <input value={uploadUrl} onChange={e => setUploadUrl(e.target.value)} placeholder="Paste image/video URL to share a memory"
                            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                          <input value={uploadCaption} onChange={e => setUploadCaption(e.target.value)} placeholder="Caption"
                            style={{ width: 130, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                          <button onClick={() => uploadGallery(ev)} disabled={!uploadUrl.trim() || uploading}
                            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: !uploadUrl.trim() ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)' }}>
                            {uploading ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                        {gallery[ev.id]?.length ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                            {gallery[ev.id].map((g: any) => (
                              <div key={g.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                                {g.media_type === 'video' ? (
                                  <video src={g.media_url} controls style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                                ) : (
                                  <img src={g.media_url} alt={g.caption || 'memory'} loading="lazy" decoding="async" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                                )}
                                {g.caption && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0, padding: '4px 8px' }}>{g.caption}</p>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No memories yet — be the first to add one from this event!</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </Layout>
  )
}
