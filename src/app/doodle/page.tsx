'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import DoodleCanvas from '@/components/DoodleCanvas'
import EmptyState from '@/components/EmptyState'
import ErrorBoundary from '@/components/ErrorBoundary'

interface Doodle {
  id: string
  user_id: string
  image_url: string
  title?: string
  created_at: string
}

export default function DoodlePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [myDoodles, setMyDoodles] = useState<Doodle[]>([])
  const [showCanvas, setShowCanvas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        // Fetch user's doodles
        const { data: doodles } = await supabase
          .from('doodles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        setMyDoodles(doodles || [])
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  const handleSave = useCallback(
    async (dataUrl: string) => {
      if (!user) return
      setSaving(true)
      try {
        // Convert data URL to blob
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const ext = 'png'
        const path = `${user.id}/${Date.now()}.${ext}`

        // Upload to Supabase Storage
        const { error: uploadErr } = await supabase.storage
          .from('doodles')
          .upload(path, blob, { contentType: 'image/png' })
        if (uploadErr) throw uploadErr

        // Get public URL
        const { data: urlData } = supabase.storage.from('doodles').getPublicUrl(path)

        // Save to DB
        const { error: dbErr } = await supabase.from('doodles').insert({
          user_id: user.id,
          image_url: urlData.publicUrl,
          storage_path: path,
        })
        if (dbErr) throw dbErr

        // Refresh list
        const { data: doodles } = await supabase
          .from('doodles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        setMyDoodles(doodles || [])
        setShowCanvas(false)
      } catch (err) {
        console.error('Failed to save doodle:', err)
        alert('Failed to save doodle. Please try again.')
      } finally {
        setSaving(false)
      }
    },
    [user, supabase]
  )

  const handleDelete = useCallback(
    async (doodle: Doodle) => {
      if (!confirm('Delete this doodle?')) return
      try {
        // Delete from storage
        const path = doodle.image_url.split('/doodles/')[1]
        if (path) {
          await supabase.storage.from('doodles').remove([path])
        }
        // Delete from DB
        await supabase.from('doodles').delete().eq('id', doodle.id)
        setMyDoodles((prev) => prev.filter((d) => d.id !== doodle.id))
      } catch (err) {
        console.error('Failed to delete doodle:', err)
      }
    },
    [supabase]
  )

  const handleShare = useCallback(async (doodle: Doodle) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Doodle',
          text: 'Check out my doodle on ConnectToCampus!',
          url: doodle.image_url,
        })
      } catch {
        /* cancelled */
      }
    } else {
      // Fallback: copy URL
      await navigator.clipboard.writeText(doodle.image_url)
      alert('Doodle URL copied to clipboard!')
    }
  }, [])

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="doodle">
        <div className="ambient" style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  ✏️ Doodle
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Sketch, draw, and express yourself — WhatsApp style
                </p>
              </div>
              {!showCanvas && (
                <button
                  onClick={() => (user ? setShowCanvas(true) : router.push('/auth/login'))}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New Doodle
                </button>
              )}
              {showCanvas && (
                <button
                  onClick={() => setShowCanvas(false)}
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ← Back
                </button>
              )}
            </div>
          </div>

          {/* Canvas view */}
          {showCanvas && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                height: 'calc(100vh - 220px)',
                minHeight: 400,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <DoodleCanvas onSave={handleSave} />
            </div>
          )}

          {saving && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
              }}
            >
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '24px 32px',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎨</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Saving doodle...
                </p>
              </div>
            </div>
          )}

          {/* Gallery */}
          {!showCanvas && (
            <>
              {!user ? (
                <EmptyState
                  icon="sparkles"
                  title="Sign in to start doodling"
                  body="Create your account to save and share your doodles with campus."
                  cta="Sign In"
                  onCta={() => router.push('/auth/login')}
                />
              ) : loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 180, borderRadius: 'var(--radius)' }} />
                  ))}
                </div>
              ) : myDoodles.length === 0 ? (
                <EmptyState
                  icon="notebook"
                  title="No doodles yet"
                  body="Tap 'New Doodle' to start sketching. Your drawings will appear here."
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                  {myDoodles.map((doodle) => (
                    <div
                      key={doodle.id}
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        overflow: 'hidden',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                        cursor: 'pointer',
                      }}
                      className="card-hover"
                    >
                      <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#fff' }}>
                        <img
                          src={doodle.image_url}
                          alt="Doodle"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                      <div
                        style={{
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(doodle.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleShare(doodle)
                            }}
                            title="Share"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--accent-light)',
                              color: 'var(--accent-text)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16,6 12,2 8,6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(doodle)
                            }}
                            title="Delete"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--danger-light)',
                              color: 'var(--danger-text)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Tips */}
          {!showCanvas && user && myDoodles.length > 0 && (
            <div
              style={{
                marginTop: 24,
                padding: '16px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                💡 Doodle Tips
              </p>
              <ul style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                <li>Use the pen tool to sketch freely with black ink</li>
                <li>Eraser removes your strokes — use different brush sizes</li>
                <li>Undo/redo buttons help fix mistakes</li>
                <li>Save your doodles and share them with friends</li>
              </ul>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}
