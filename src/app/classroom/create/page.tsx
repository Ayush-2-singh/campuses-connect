'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function CreateAssignmentPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [campuses, setCampuses] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '', subject: '', description: '', semester: '1',
    assignment_type: 'text', total_marks: '10',
    due_date: '', due_time: '23:59',
    campus_id: '', department_id: '',
  })
  const [questions, setQuestions] = useState([
    { question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', marks: 1 }
  ])
  const [publishing, setPublishing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*, campuses(name), departments(name)').eq('id', user.id).single()
      setProfile(prof)

      if (!['faculty', 'campus_admin', 'platform_admin'].includes(prof?.role)) {
        router.push('/classroom'); return
      }

      const { data: campusData } = await supabase.from('campuses').select('*').order('name')
      setCampuses(campusData || [])

      const { data: deptData } = await supabase.from('departments').select('*').order('name')
      setDepartments(deptData || [])

      // Pre-fill with own campus/dept
      setForm(f => ({ ...f, campus_id: prof?.campus_id || '', department_id: prof?.department_id || '' }))
    }
    load()
  }, [])

  const addQuestion = () => {
    setQuestions(qs => [...qs, { question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', marks: 1 }])
  }

  const updateQuestion = (i: number, field: string, value: any) => {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  }

  const removeQuestion = (i: number) => {
    setQuestions(qs => qs.filter((_, idx) => idx !== i))
  }

  const handlePublish = async () => {
    if (!form.title || !form.subject) return
    setPublishing(true)

    const dueDateTime = form.due_date ? `${form.due_date}T${form.due_time}:00` : null

    const { data: assignment } = await supabase.from('assignments').insert({
      posted_by: user.id,
      campus_id: form.campus_id || profile?.campus_id,
      department_id: form.department_id || profile?.department_id,
      semester: parseInt(form.semester),
      subject: form.subject,
      title: form.title,
      description: form.description,
      due_date: dueDateTime,
      total_marks: parseInt(form.total_marks),
      assignment_type: form.assignment_type,
      is_published: true,
    }).select().single()

    if (assignment && form.assignment_type === 'mcq') {
      await supabase.from('assignment_questions').insert(
        questions.map((q, i) => ({ ...q, assignment_id: assignment.id, order_index: i }))
      )
    }

    router.push('/classroom')
    setPublishing(false)
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => router.push('/classroom')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Create Assignment</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Assignment Type */}
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>Assignment Type</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ v: 'text', l: '📝 Text', d: 'Written answer' }, { v: 'link', l: '🔗 Link', d: 'GitHub / Drive' }, { v: 'mcq', l: '❓ MCQ Quiz', d: 'Auto-graded' }].map(t => (
                <button key={t.v} onClick={() => setForm(f => ({ ...f, assignment_type: t.v }))}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 10, border: form.assignment_type === t.v ? '2px solid var(--accent)' : '1px solid var(--border)', background: form.assignment_type === t.v ? '#eff6ff' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: form.assignment_type === t.v ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 2px' }}>{t.l}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{t.d}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Basic Info */}
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input placeholder="Subject *" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={inputStyle} />
                <select value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} style={inputStyle}>
                  {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>
              <input placeholder="Assignment title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
              <textarea placeholder="Description / instructions" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <input placeholder="Total marks" type="number" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: e.target.value }))} style={inputStyle} />
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
                <input type="time" value={form.due_time} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Campus/Dept selector - for platform admin */}
          {profile?.role === 'platform_admin' && (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>Target Campus & Department</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.campus_id} onChange={e => setForm(f => ({ ...f, campus_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select Campus</option>
                  {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* MCQ Questions */}
          {form.assignment_type === 'mcq' && (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Questions</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {questions.map((q, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Question {i + 1}</p>
                      {questions.length > 1 && (
                        <button onClick={() => removeQuestion(i)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input placeholder="Question *" value={q.question} onChange={e => updateQuestion(i, 'question', e.target.value)} style={inputStyle} />
                      {['a', 'b', 'c', 'd'].map(opt => (
                        <div key={opt} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => updateQuestion(i, 'correct_option', opt)}
                            style={{ width: 32, height: 32, borderRadius: '50%', border: q.correct_option === opt ? '2px solid #15803d' : '2px solid var(--border)', background: q.correct_option === opt ? '#15803d' : 'white', color: q.correct_option === opt ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
                            {opt.toUpperCase()}
                          </button>
                          <input placeholder={`Option ${opt.toUpperCase()} ${q.correct_option === opt ? '✓ Correct' : ''}`} value={(q as any)[`option_${opt}`]} onChange={e => updateQuestion(i, `option_${opt}`, e.target.value)} style={{ ...inputStyle, borderColor: q.correct_option === opt ? '#15803d' : 'var(--border)' }} />
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Marks:</label>
                        <input type="number" value={q.marks} onChange={e => updateQuestion(i, 'marks', parseInt(e.target.value))} min={1} style={{ ...inputStyle, width: 80 }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addQuestion}
                  style={{ background: '#eff6ff', color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Add Question
                </button>
              </div>
            </div>
          )}

          {/* Publish */}
          <button onClick={handlePublish} disabled={!form.title || !form.subject || publishing}
            style={{ background: publishing ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {publishing ? 'Publishing...' : '🚀 Publish Assignment'}
          </button>
        </div>
      </div>
    </Layout>
  )
}
