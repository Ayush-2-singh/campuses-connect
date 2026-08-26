'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const TYPE_EMOJI: Record<string, string> = { deadline: '⏰', event: '🎪', custom: '📝', streak: '🔥', goal: '🎯' }
const TYPE_COLOR: Record<string, string> = { deadline: 'var(--danger)', event: 'var(--accent)', custom: 'var(--text-secondary)', streak: 'var(--orange-text)', goal: 'var(--success-text)' }

export default function RemindersPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [reminders, setReminders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', reminder_type: 'custom', remind_at: '', is_recurring: false, recurrence: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/auth/login?redirect=/reminders'); return }
      setUser(authUser)
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(data)

      // Check push support
      const supported = 'Notification' in window && 'serviceWorker' in navigator
      setPushSupported(supported)
      if (supported) {
        setPushEnabled(Notification.permission === 'granted')
      }

      const res = await fetch('/api/reminders')
      if (res.ok) {
        const d = await res.json()
        setReminders(d.reminders || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const enablePush = async () => {
    if (!pushSupported) return
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setPushEnabled(true)
      // Register for push
      try {
        const reg = await navigator.serviceWorker.ready
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_KEY || undefined,
        })
        const sub = subscription.toJSON() as any
        await fetch('/api/notifications/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth }),
        })
      } catch { /* ignore */ }
    }
  }

  const createReminder = async () => {
    if (!form.title || !form.remind_at) { setError('Title and time required'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(false)
      setForm({ title: '', description: '', reminder_type: 'custom', remind_at: '', is_recurring: false, recurrence: '' })
      // Reload
      const r2 = await fetch('/api/reminders')
      if (r2.ok) { const d = await r2.json(); setReminders(d.reminders || []) }
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const deleteReminder = async (id: string) => {
    await fetch(`/api/reminders?id=${id}`, { method: 'DELETE' })
    setReminders(r => r.filter(x => x.id !== id))
  }

  const upcoming = reminders.filter(r => !r.is_sent && new Date(r.remind_at) > new Date())
  const past = reminders.filter(r => r.is_sent || new Date(r.remind_at) <= new Date())

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/more')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>⏰ Smart Reminders</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', marginLeft: 34 }}>
          Never miss a deadline, event, or streak
        </p>

        {/* Push notification banner */}
        {pushSupported && !pushEnabled && (
          <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>Enable Push Notifications</p>
              <p style={{ fontSize: 11, color: 'var(--accent-text)', margin: '2px 0 0' }}>Get real-time reminders even when the app is closed</p>
            </div>
            <button onClick={enablePush}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              Enable
            </button>
          </div>
        )}

        {error && <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}

        <button onClick={() => setShowForm(!showForm)}
          style={{ width: '100%', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          {showForm ? '✕ Cancel' : '+ New Reminder'}
        </button>

        {/* Form */}
        {showForm && (
          <div style={{ background: 'var(--bg)', border: '2px solid var(--accent)', borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>📝 New Reminder</h3>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Reminder title (e.g. Hackathon deadline)"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'none', marginBottom: 10, boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <select value={form.reminder_type} onChange={e => setForm({ ...form, reminder_type: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="deadline">⏰ Deadline</option>
                <option value="event">🎪 Event</option>
                <option value="streak">🔥 Streak</option>
                <option value="goal">🎯 Goal</option>
                <option value="custom">📝 Custom</option>
              </select>
              <input type="datetime-local" value={form.remind_at} onChange={e => setForm({ ...form, remind_at: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} id="recurring" />
              <label htmlFor="recurring" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🔄 Recurring</label>
              {form.is_recurring && (
                <select value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              )}
            </div>
            <button onClick={createReminder} disabled={submitting}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: submitting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {submitting ? 'Creating...' : '✓ Create Reminder'}
            </button>
          </div>
        )}

        {/* Upcoming reminders */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px' }}>📌 Upcoming ({upcoming.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcoming.map(r => {
                    const remindDate = new Date(r.remind_at)
                    const isPast = remindDate < new Date()
                    const hoursAway = Math.round((remindDate.getTime() - Date.now()) / 3600000)
                    return (
                      <div key={r.id} style={{ background: 'var(--bg)', border: `1px solid ${isPast ? 'var(--danger-border)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{TYPE_EMOJI[r.reminder_type] || '📝'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{r.title}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                              {remindDate.toLocaleString()} {r.is_recurring && `· 🔄 ${r.recurrence}`}
                            </p>
                          </div>
                          <button onClick={() => deleteReminder(r.id)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                            ✕
                          </button>
                        </div>
                        {r.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>{r.description}</p>}
                        <p style={{ fontSize: 11, color: hoursAway <= 2 ? 'var(--danger)' : 'var(--text-muted)', margin: '4px 0 0', fontWeight: hoursAway <= 2 ? 600 : 400 }}>
                          {isPast ? '⚠️ Past due!' : hoursAway < 1 ? '🔥 Due in < 1 hour!' : hoursAway < 24 ? `⏰ In ${hoursAway} hours` : `📅 In ${Math.ceil(hoursAway / 24)} days`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px' }}>📋 Past ({past.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {past.slice(0, 10).map(r => (
                    <div key={r.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', opacity: 0.6 }}>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        {TYPE_EMOJI[r.reminder_type]} {r.title} · {new Date(r.remind_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcoming.length === 0 && past.length === 0 && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>⏰</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No reminders yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Create your first reminder to never miss a deadline!</p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
