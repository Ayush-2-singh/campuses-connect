'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function ClassroomPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [grouped, setGrouped] = useState<Record<string, Record<string, any[]>>>({})
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*, campuses(name), departments(name)').eq('id', user.id).single()
      setProfile(prof)

      const { data: assignData } = await supabase
        .from('assignments')
        .select('*, profiles(full_name, username)')
        .eq('campus_id', prof?.campus_id)
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      const assigns = assignData || []
      setAssignments(assigns)

      const { data: subData } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('student_id', user.id)

      const subMap: Record<string, any> = {}
      subData?.forEach((s: any) => { subMap[s.assignment_id] = s })
      setSubmissions(subMap)

      const g: Record<string, Record<string, any[]>> = {}
      assigns.forEach((a: any) => {
        const sem = `Semester ${a.semester || 1}`
        const subj = a.subject
        if (!g[sem]) g[sem] = {}
        if (!g[sem][subj]) g[sem][subj] = []
        g[sem][subj].push(a)
      })
      setGrouped(g)
      setLoading(false)
    }
    load()
  }, [])

  const isFaculty = ['faculty', 'campus_admin', 'platform_admin'].includes(profile?.role)

  const timeLeft = (due: string) => {
    if (!due) return null
    const diff = new Date(due).getTime() - Date.now()
    if (diff < 0) return { label: 'Overdue', color: '#dc2626' }
    const days = Math.floor(diff / 86400000)
    const hrs = Math.floor((diff % 86400000) / 3600000)
    if (days > 0) return { label: `${days}d left`, color: '#d97706' }
    return { label: `${hrs}h left`, color: '#dc2626' }
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>📚 Classroom</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {profile?.campuses?.name || 'PW IOI'} · {profile?.departments?.name || 'CSE'}
            </p>
          </div>
          {isFaculty && (
            <button onClick={() => router.push('/classroom/create')}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Create Assignment
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : assignments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📝</div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>No assignments yet</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              {isFaculty ? 'Create your first assignment' : 'Faculty will post assignments here'}
            </p>
            {isFaculty && (
              <button onClick={() => router.push('/classroom/create')}
                style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 20 }}>
                + Create Assignment
              </button>
            )}
          </div>
        ) : (
          Object.entries(grouped).map(([semester, subjects]) => (
            <div key={semester} style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{semester}</h3>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {Object.entries(subjects).map(([subject, subjectAssignments]) => (
                <div key={subject} style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>{subject}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16, borderLeft: '3px solid var(--border)' }}>
                    {(subjectAssignments as any[]).map((a: any) => {
                      const sub = submissions[a.id]
                      const due = timeLeft(a.due_date)
                      return (
                        <div key={a.id} onClick={() => router.push(`/classroom/${a.id}`)}
                          style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{a.title}</p>
                            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                              <span>{a.assignment_type === 'mcq' ? '❓ MCQ' : a.assignment_type === 'link' ? '🔗 Link' : '📝 Text'}</span>
                              <span>{a.total_marks} marks</span>
                              {a.due_date && <span>Due: {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                              <span>By {a.profiles?.full_name}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            {due && !sub && <span style={{ fontSize: 11, color: due.color, fontWeight: 600 }}>{due.label}</span>}
                            {sub ? (
                              <span style={{ fontSize: 12, background: '#f0fdf4', color: '#15803d', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>✅ Submitted</span>
                            ) : (
                              <span style={{ fontSize: 12, background: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>⏳ Pending</span>
                            )}
                            <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Layout>
  )
}
