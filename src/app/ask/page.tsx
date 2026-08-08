'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function AskPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [showAsk, setShowAsk] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '', body: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<any[]>([])
  const [answerText, setAnswerText] = useState('')
  const [answering, setAnswering] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const loadQuestions = async () => {
    const { data } = await supabase
      .from('questions')
      .select('*, profiles(full_name, username), answers(count)')
      .order('created_at', { ascending: false })
      .limit(50)
    setQuestions(data || [])
  }

  const loadAnswers = async (questionId: string) => {
    const { data } = await supabase
      .from('answers')
      .select('*, profiles(full_name, username)')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })
    setAnswers(data || [])
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }
      await loadQuestions()
      setLoading(false)
    }
    load()
  }, [])

  const handleAsk = async () => {
    if (!form.title.trim() || !user) return
    setPosting(true)
    setError('')
    const { error: err } = await supabase.from('questions').insert({
      asked_by: user.id,
      campus_id: profile?.campus_id,
      title: form.title.trim(),
      subject: form.subject.trim() || null,
      body: form.body.trim() || null,
    })
    if (err) setError('Could not post your question. Please try again.')
    else {
      setForm({ title: '', subject: '', body: '' })
      setShowAsk(false)
      await loadQuestions()
    }
    setPosting(false)
  }

  const toggleQuestion = async (q: any) => {
    if (expandedId === q.id) { setExpandedId(null); return }
    setExpandedId(q.id)
    setAnswerText('')
    await loadAnswers(q.id)
  }

  const handleAnswer = async (questionId: string) => {
    if (!answerText.trim() || !user) return
    setAnswering(true)
    setError('')
    // Server-gated: blocks self-answering, awards +5 once per question per student
    const { data: ok, error: err } = await supabase.rpc('submit_answer', {
      p_question_id: questionId,
      p_body: answerText.trim(),
    })
    if (err || !ok) setError(err?.message || 'Could not post your answer (you cannot answer your own question).')
    else {
      // streak is advanced inside the validated submit_answer RPC
      setAnswerText('')
      await loadAnswers(questionId)
      await loadQuestions()
    }
    setAnswering(false)
  }

  const handleAccept = async (question: any, answer: any) => {
    if (!confirm('Accept this answer? The student earns 15 karma ⭐.')) return
    // accept_answer returns FALSE (not an error) when the caller can't accept
    const { data: ok, error: err } = await supabase.rpc('accept_answer', { p_answer_id: answer.id })
    if (err || !ok) {
      setError('Could not accept. Only the question owner can accept, and only one answer per question.')
      return
    }
    setError('')
    await loadAnswers(question.id)
    await loadQuestions()
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', margin: '0 0 4px' }}>❓ Ask a Senior</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Doubt-solving with students of your college — answerers earn karma ⭐
            </p>
          </div>
          {user && (
            <button onClick={() => { setShowAsk(s => !s); setError('') }}
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Ask
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {/* Compose */}
        {showAsk && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Ask your question</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Question title * (e.g. How do you prepare for OS viva?)" style={inputStyle} />
                <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Subject (e.g. DBMS)" style={inputStyle} />
              </div>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Add more detail (optional)" rows={3} style={{ ...inputStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowAsk(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAsk} disabled={!form.title.trim() || posting}
                style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post Question'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❓</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No questions yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to ask — seniors earn karma for helping!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {questions.map(q => {
              const answerCount = q.answers?.[0]?.count || 0
              return (
                <div key={q.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div onClick={() => toggleQuestion(q)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: q.subject ? 'var(--purple-light)' : 'var(--bg-tertiary)', color: q.subject ? 'var(--purple-text)' : 'var(--text-secondary)', fontWeight: 600 }}>
                            {q.subject || 'General'}
                          </span>
                          {q.is_resolved && <span style={{ fontSize: 11, background: 'var(--success-light)', color: 'var(--success-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>✅ Resolved</span>}
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{q.title}</p>
                        {q.body && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>{q.body.slice(0, 140)}{q.body.length > 140 ? '…' : ''}</p>}
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                          @{q.profiles?.username} · 💬 {answerCount} answer{answerCount === 1 ? '' : 's'} · {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 16, flexShrink: 0 }}>{expandedId === q.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Answers */}
                  {expandedId === q.id && (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {answers.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No answers yet. Be the first to help! ⭐ +5 karma</p>
                      )}
                      {answers.map(a => (
                        <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, background: a.is_accepted ? 'var(--success-light)' : 'var(--bg-secondary)', border: a.is_accepted ? '1px solid var(--success-border)' : 'none', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>@{a.profiles?.username}</p>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {a.is_accepted && <span style={{ fontSize: 11, background: 'var(--success-light)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>✓ Accepted</span>}
                                {user?.id === q.asked_by && !a.is_accepted && !q.is_resolved && (
                                  <button onClick={() => handleAccept(q, a)}
                                    style={{ fontSize: 11, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '4px 10px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Accept +15⭐
                                  </button>
                                )}
                              </div>
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{a.body}</p>
                          </div>
                        </div>
                      ))}
                      {user && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input type="text" value={answerText} onChange={e => setAnswerText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAnswer(q.id)}
                            placeholder="Write an answer... (+5 karma)" style={{ ...inputStyle, flex: 1, background: 'var(--bg-secondary)' }} />
                          <button onClick={() => handleAnswer(q.id)} disabled={!answerText.trim() || answering}
                            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: !answerText.trim() || answering ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {answering ? '...' : 'Answer'}
                          </button>
                        </div>
                      )}
                      {!user && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                          <span onClick={() => router.push('/auth/login')} style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Sign in</span> to answer
                        </p>
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
