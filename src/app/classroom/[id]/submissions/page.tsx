'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Layout from '@/components/Layout'

export default function SubmissionsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: a } = await supabase.from('assignments').select('*').eq('id', params.id).single()
      setAssignment(a)

      const { data: subs } = await supabase
        .from('assignment_submissions')
        .select('*, profiles(full_name, username, current_year)')
        .eq('assignment_id', params.id)
        .order('submitted_at', { ascending: false })
      setSubmissions(subs || [])

      // Get all students in this campus/dept
      const { data: students } = await supabase
        .from('profiles')
        .select('id, full_name, username, current_year')
        .eq('campus_id', a?.campus_id)
        .eq('role', 'student')
        .order('full_name')
      setAllStudents(students || [])

      // Pre-fill marks
      const marksMap: Record<string, string> = {}
      const feedbackMap: Record<string, string> = {}
      subs?.forEach(s => {
        if (s.manual_marks !== null) marksMap[s.id] = String(s.manual_marks)
        if (s.feedback) feedbackMap[s.id] = s.feedback
      })
      setMarks(marksMap)
      setFeedback(feedbackMap)
    }
    load()
  }, [])

  const saveMarks = async (subId: string) => {
    setSaving(s => ({ ...s, [subId]: true }))
    const m = parseInt(marks[subId] || '0')
    await supabase.from('assignment_submissions').update({
      manual_marks: m,
      final_marks: m,
      feedback: feedback[subId] || null,
    }).eq('id', subId)
    setSaving(s => ({ ...s, [subId]: false }))
  }

  const submittedIds = new Set(submissions.map(s => s.student_id))
  const notSubmitted = allStudents.filter(s => !submittedIds.has(s.id))

  const sendReminder = async () => {
    // Create notifications for non-submitted students
    for (const student of notSubmitted) {
      await supabase.from('notifications').insert({
        user_id: student.id,
        type: 'reminder',
        content: `⏰ Reminder: "${assignment?.title}" is due soon!`,
        link: `/classroom/${assignment?.id}`,
        is_read: false,
      })
    }
    alert(`Reminder sent to ${notSubmitted.length} students!`)
  }

  if (!assignment) return (
    <Layout user={user} profile={profile}>
      <div style={{ textAlign: 'center', padding: '80px 0' }}><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>
    </Layout>
  )

  const submitted = submissions.length
  const total = allStudents.length
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.push(`/classroom/${assignment.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
          <div>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, margin: '0 0 2px' }}>{assignment.subject}</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{assignment.title} — Submissions</h2>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Submitted', value: submitted, bg: '#f0fdf4', color: '#15803d' },
            { label: 'Pending', value: notSubmitted.length, bg: '#fef2f2', color: '#dc2626' },
            { label: 'Total Students', value: total, bg: '#eff6ff', color: '#1d4ed8' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: s.color, margin: '0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: s.color, margin: 0, fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Submission Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{pct}%</span>
          </div>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 8 }}>
            <div style={{ background: '#16a34a', height: '100%', borderRadius: 20, width: `${pct}%`, transition: 'width 1s ease' }} />
          </div>
        </div>

        {/* Submitted list */}
        {submissions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>✅ Submitted ({submitted})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submissions.map(sub => (
                <div key={sub.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{sub.profiles?.full_name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        @{sub.profiles?.username} · Year {sub.profiles?.current_year}
                        {sub.is_late && <span style={{ color: '#dc2626', marginLeft: 8 }}>⚠️ Late</span>}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        {new Date(sub.submitted_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {sub.auto_marks !== null && (
                        <p style={{ fontSize: 12, color: '#15803d', fontWeight: 600, margin: '4px 0 0' }}>Auto: {sub.auto_marks}/{assignment.total_marks}</p>
                      )}
                    </div>
                  </div>

                  {/* Answer */}
                  {sub.text_answer && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {sub.text_answer}
                    </div>
                  )}
                  {sub.link_answer && (
                    <a href={sub.link_answer} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                      🔗 {sub.link_answer}
                    </a>
                  )}

                  {/* Mark input */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" value={marks[sub.id] || ''} onChange={e => setMarks(m => ({ ...m, [sub.id]: e.target.value }))}
                      placeholder={`Marks /${assignment.total_marks}`} min={0} max={assignment.total_marks}
                      style={{ width: 100, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <input value={feedback[sub.id] || ''} onChange={e => setFeedback(f => ({ ...f, [sub.id]: e.target.value }))}
                      placeholder="Feedback (optional)"
                      style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => saveMarks(sub.id)} disabled={saving[sub.id]}
                      style={{ background: saving[sub.id] ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {saving[sub.id] ? 'Saving...' : '💾 Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Not submitted */}
        {notSubmitted.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>⏳ Not Submitted ({notSubmitted.length})</h3>
              <button onClick={sendReminder}
                style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🔔 Send Reminder
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notSubmitted.map(s => (
                <div key={s.id} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{s.full_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{s.username} · Year {s.current_year}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
