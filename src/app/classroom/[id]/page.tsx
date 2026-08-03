'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Layout from '@/components/Layout'

export default function AssignmentPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [submission, setSubmission] = useState<any>(null)
  const [answer, setAnswer] = useState('')
  const [linkAnswer, setLinkAnswer] = useState('')
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({})
  const [currentQ, setCurrentQ] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<any>(null)
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const isFaculty = ['faculty', 'campus_admin', 'platform_admin'].includes(profile?.role)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*, campuses(name)').eq('id', user.id).single()
      setProfile(prof)

      const { data: a } = await supabase.from('assignments').select('*, profiles(full_name, username)').eq('id', params.id).single()
      setAssignment(a)

      if (a?.assignment_type === 'mcq') {
        const { data: qs } = await supabase.from('assignment_questions').select('*').eq('assignment_id', params.id).order('order_index')
        setQuestions(qs || [])
      }

      const { data: sub } = await supabase.from('assignment_submissions').select('*').eq('assignment_id', params.id).eq('student_id', user.id).single()
      if (sub) { setSubmission(sub); setSubmitted(true) }

      // Mark as seen
      await supabase.from('assignment_seen').upsert({ assignment_id: params.id as string, student_id: user.id })
    }
    load()
  }, [])

  const handleSubmit = async () => {
    if (!user || submitted) return
    setSubmitting(true)

    const isLate = assignment?.due_date && new Date() > new Date(assignment.due_date)

    const { data: sub } = await supabase.from('assignment_submissions').insert({
      assignment_id: assignment.id,
      student_id: user.id,
      submission_type: assignment.assignment_type,
      text_answer: assignment.assignment_type === 'text' ? answer : null,
      link_answer: assignment.assignment_type === 'link' ? linkAnswer : null,
      mcq_answers: assignment.assignment_type === 'mcq' ? mcqAnswers : null,
      is_late: isLate,
    }).select().single()

    if (sub) {
      setSubmission(sub)
      setSubmitted(true)
      if (assignment.assignment_type === 'mcq') {
        // Calculate score
        let correct = 0
        questions.forEach(q => {
          if (mcqAnswers[q.id] === q.correct_option) correct += q.marks
        })
        setScore({ got: correct, total: questions.reduce((s, q) => s + q.marks, 0) })
      }
    }
    setSubmitting(false)
  }

  if (!assignment) return (
    <Layout user={user} profile={profile}>
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    </Layout>
  )

  const isOverdue = assignment.due_date && new Date() > new Date(assignment.due_date)

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.push('/classroom')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
          <div>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase' }}>{assignment.subject}</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{assignment.title}</h2>
          </div>
        </div>

        {/* Info card */}
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>👤 {assignment.profiles?.full_name}</span>
            <span>⭐ {assignment.total_marks} marks</span>
            <span>{assignment.assignment_type === 'mcq' ? '❓ MCQ Quiz' : assignment.assignment_type === 'link' ? '🔗 Link Submission' : '📝 Text Submission'}</span>
            {assignment.due_date && (
              <span style={{ color: isOverdue ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                {isOverdue ? '🔴 Overdue' : '⏰'} Due: {new Date(assignment.due_date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {assignment.description && (
            <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: '12px 0 0', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 12 }}>{assignment.description}</p>
          )}
        </div>

        {/* Faculty view - go to submissions */}
        {isFaculty && (
          <button onClick={() => router.push(`/classroom/${assignment.id}/submissions`)}
            style={{ width: '100%', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
            📊 View All Submissions
          </button>
        )}

        {/* SUBMITTED STATE */}
        {submitted && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 14, padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#15803d', margin: '0 0 8px' }}>Assignment Submitted!</p>
            {score && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 32, fontWeight: 800, color: '#15803d', margin: '0 0 8px' }}>{score.got}/{score.total}</p>
                <div style={{ background: '#dcfce7', borderRadius: 20, height: 8, overflow: 'hidden', maxWidth: 300, margin: '0 auto 16px' }}>
                  <div style={{ background: '#16a34a', height: '100%', width: `${(score.got / score.total) * 100}%`, transition: 'width 1s ease' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', maxWidth: 400, margin: '0 auto' }}>
                  {questions.map((q, i) => {
                    const isCorrect = mcqAnswers[q.id] === q.correct_option
                    return (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span>{isCorrect ? '✅' : '❌'}</span>
                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Q{i + 1}. {q.question.slice(0, 50)}...</span>
                        <span style={{ fontWeight: 600, color: isCorrect ? '#15803d' : '#dc2626' }}>{isCorrect ? `+${q.marks}` : '0'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {submission?.manual_marks !== null && submission?.manual_marks !== undefined && (
              <p style={{ fontSize: 14, color: '#15803d', marginTop: 12 }}>Faculty marks: <strong>{submission.manual_marks}/{assignment.total_marks}</strong></p>
            )}
            {submission?.feedback && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>Feedback: {submission.feedback}</p>
            )}
          </div>
        )}

        {/* SUBMIT FORM */}
        {!submitted && !isFaculty && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Your Submission</h3>

            {/* TEXT submission */}
            {assignment.assignment_type === 'text' && (
              <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="Write your answer here..."
                rows={6}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: 'var(--text-primary)' }} />
            )}

            {/* LINK submission */}
            {assignment.assignment_type === 'link' && (
              <input type="url" value={linkAnswer} onChange={e => setLinkAnswer(e.target.value)}
                placeholder="Paste your link here (GitHub, Google Drive, etc.)"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: 'var(--text-primary)' }} />
            )}

            {/* MCQ submission */}
            {assignment.assignment_type === 'mcq' && questions.length > 0 && (
              <div>
                {/* Progress */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Question {currentQ + 1} of {questions.length}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Object.keys(mcqAnswers).length} answered</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 6, marginBottom: 20 }}>
                  <div style={{ background: 'var(--accent)', height: '100%', borderRadius: 20, width: `${((currentQ + 1) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
                </div>

                {/* Question */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Q{currentQ + 1}. {questions[currentQ].question}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{questions[currentQ].marks} mark{questions[currentQ].marks > 1 ? 's' : ''}</p>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {['a', 'b', 'c', 'd'].map(opt => {
                    const optText = questions[currentQ][`option_${opt}`]
                    if (!optText) return null
                    const selected = mcqAnswers[questions[currentQ].id] === opt
                    return (
                      <button key={opt} onClick={() => setMcqAnswers(prev => ({ ...prev, [questions[currentQ].id]: opt }))}
                        style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 10, border: selected ? '2px solid var(--accent)' : '1px solid var(--border)', background: selected ? '#eff6ff' : 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: selected ? 'var(--accent)' : 'var(--text-primary)', fontWeight: selected ? 600 : 400, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', border: selected ? '2px solid var(--accent)' : '2px solid var(--border)', background: selected ? 'var(--accent)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: selected ? 'white' : 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
                          {opt.toUpperCase()}
                        </span>
                        {optText}
                      </button>
                    )
                  })}
                </div>

                {/* Navigation */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {currentQ > 0 && (
                    <button onClick={() => setCurrentQ(q => q - 1)}
                      style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ← Previous
                    </button>
                  )}
                  {currentQ < questions.length - 1 ? (
                    <button onClick={() => setCurrentQ(q => q + 1)}
                      style={{ flex: 1, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Next →
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* Submit button */}
            {(assignment.assignment_type !== 'mcq' || currentQ === questions.length - 1) && (
              <button onClick={handleSubmit}
                disabled={submitting || (assignment.assignment_type === 'text' && !answer.trim()) || (assignment.assignment_type === 'link' && !linkAnswer.trim())}
                style={{ width: '100%', background: submitting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 16 }}>
                {submitting ? 'Submitting...' : assignment.assignment_type === 'mcq' ? `Submit Quiz (${Object.keys(mcqAnswers).length}/${questions.length} answered)` : 'Submit Assignment →'}
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
