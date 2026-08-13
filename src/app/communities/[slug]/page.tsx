'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import PostCard from '@/components/PostCard'
import PostComposer from '@/components/PostComposer'
import EmptyState from '@/components/EmptyState'
import Avatar from '@/components/Avatar'
import { CardSkeleton } from '@/components/Skeleton'

type TestQuestion = { q: string; options: string[]; answer: number }

const emptyTestQ = (): TestQuestion => ({ q: '', options: ['', ''], answer: 0 })

export default function CommunityPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [community, setCommunity] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [membership, setMembership] = useState<{ id: string; status: string } | null>(null)
  const [isCommunityAdmin, setIsCommunityAdmin] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [joinMsg, setJoinMsg] = useState('')
  // entry test
  const [showTest, setShowTest] = useState(false)
  const [testAnswers, setTestAnswers] = useState<number[]>([])
  const [testSubmitting, setTestSubmitting] = useState(false)
  const [testResult, setTestResult] = useState<{ passed: boolean; score?: number; total?: number } | null>(null)
  // password (private communities)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordSending, setPasswordSending] = useState(false)
  // owner tools
  const [showTestEditor, setShowTestEditor] = useState(false)
  const [testDraft, setTestDraft] = useState<TestQuestion[]>([])
  const [savingTest, setSavingTest] = useState(false)
  const [pendingMembers, setPendingMembers] = useState<any[]>([])
  const supabase = createClient()

  const isMember = membership?.status === 'approved'
  const isPending = membership?.status === 'pending'
  const hasTest = Array.isArray(community?.join_test) && community.join_test.length > 0

  const loadPosts = async () => {
    if (!community) return
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
      .eq('community_id', community.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }

  const loadPendingMembers = useCallback(async (commId: string) => {
    const { data } = await supabase
      .from('community_members')
      .select('*, profiles(full_name, username, avatar_url)')
      .eq('community_id', commId)
      .eq('status', 'pending')
    setPendingMembers(data || [])
  }, [supabase])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data: comm } = await supabase.from('communities').select('*').eq('key', slug).single()
      if (!comm) { router.push('/communities'); return }
      setCommunity(comm)
      if (user) {
        const { data: mem } = await supabase.from('community_members').select('id, status').eq('community_id', comm.id).eq('user_id', user.id).maybeSingle()
        setMembership(mem || null)
        const { data: grants } = await supabase.rpc('my_admin_grants')
        const g = (grants as any[]) || []
        const isCommAdmin = g.some((x: any) => x.admin_type === 'community_admin' && x.community_id === comm.id)
        const isPlatAdmin = g.some((x: any) => x.admin_type === 'platform_admin')
        setIsCommunityAdmin(isCommAdmin)
        setIsPlatformAdmin(isPlatAdmin)
        if (isCommAdmin || isPlatAdmin) loadPendingMembers(comm.id)
      }
      const { data: ps } = await supabase
        .from('posts')
        .select('*, profiles!posts_author_id_fkey(full_name, username, is_verified), content_categories(key, label)')
        .eq('community_id', comm.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setPosts(ps || [])
    }
    load()
  }, [slug, supabase, router, loadPendingMembers])

  // ── Join flows ──────────────────────────────────────────────
  const handleJoin = async () => {
    if (!user) { router.push('/auth/login'); return }
    setJoinMsg('')
    const { data } = await supabase.rpc('join_community', { p_community_id: community.id })
    const res = data as string
    if (res === 'joined') { setMembership({ id: '', status: 'approved' }); return }
    if (res === 'pending') { setMembership({ id: '', status: 'pending' }); setJoinMsg('Request sent — the owners will review it.') ; return }
    if (res === 'test_required') { setTestAnswers((community.join_test || []).map(() => -1)); setTestResult(null); setShowTest(true); return }
    if (res === 'wrong_password') { setShowPassword(true); return }
    if (res === 'already') { setMembership({ id: '', status: 'approved' }); return }
    setJoinMsg('Could not join right now. Please try again.')
  }

  const submitPassword = async () => {
    setPasswordSending(true)
    setJoinMsg('')
    const { data } = await supabase.rpc('join_community', { p_community_id: community.id, p_password: password })
    const res = data as string
    setPasswordSending(false)
    if (res === 'joined') { setMembership({ id: '', status: 'approved' }); setShowPassword(false); return }
    if (res === 'test_required') { setShowPassword(false); setTestAnswers((community.join_test || []).map(() => -1)); setTestResult(null); setShowTest(true); return }
    if (res === 'already') { setMembership({ id: '', status: 'approved' }); setShowPassword(false); return }
    setJoinMsg('Wrong password. Try again.')
  }

  const submitTest = async () => {
    if (!community || testSubmitting) return
    if (testAnswers.some(a => a < 0)) { setJoinMsg('Answer every question before submitting.'); return }
    setJoinMsg('')
    setTestSubmitting(true)
    const { data } = await supabase.rpc('submit_community_test', {
      p_community_id: community.id,
      p_answers: testAnswers,
    })
    setTestSubmitting(false)
    const passed = !!data
    const total = (community.join_test || []).length
    const score = passed ? total : testAnswers.filter((a, i) => a === community.join_test[i]?.answer).length
    setTestResult({ passed, score, total })
    if (passed) {
      setMembership({ id: '', status: community.visibility === 'approval' ? 'pending' : 'approved' })
      setShowTest(false)
    }
  }

  const leaveCommunity = async () => {
    if (!user) return
    await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', user.id)
    setMembership(null)
  }

  // ── Owner tools ─────────────────────────────────────────────
  const openTestEditor = () => {
    const existing: TestQuestion[] = Array.isArray(community?.join_test)
      ? community.join_test.map((t: any) => ({ q: t.q, options: [...(t.options || [])], answer: t.answer }))
      : []
    setTestDraft(existing.length ? existing : [emptyTestQ()])
    setShowTestEditor(true)
  }

  const saveTest = async () => {
    const clean = testDraft
      .map(t => ({ q: t.q.trim(), options: t.options.map(o => o.trim()).filter(Boolean), answer: t.answer }))
      .filter(t => t.q && t.options.length >= 2)
    if (clean.some(t => t.answer < 0 || t.answer >= t.options.length)) { setJoinMsg('Correct-answer index is out of range on a question.'); return }
    setSavingTest(true)
    setJoinMsg('')
    await supabase.rpc('set_community_test', { p_community_id: community.id, p_test: clean.length ? clean : null })
    const { data: comm } = await supabase.from('communities').select('*').eq('id', community.id).single()
    setCommunity(comm)
    setSavingTest(false)
    setShowTestEditor(false)
  }

  const reviewMember = async (uid: string, approve: boolean) => {
    await supabase.rpc('review_member', { p_community_id: community.id, p_user_id: uid, p_approve: approve })
    await loadPendingMembers(community.id)
  }

  if (!community) return <Layout user={user} profile={profile}><div style={{ padding: '24px 20px', maxWidth: 680, margin: '0 auto' }}><CardSkeleton rows={2} /></div></Layout>

  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{ fontSize: 44, lineHeight: 1 }}>{community.icon}</span>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>{community.name}</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{community.tagline}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{community.description}</p>
                {!isMember && !isPending && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {hasTest && <span style={{ fontSize: 11, background: 'var(--warning-light)', border: '1px solid var(--warning-border)', color: 'var(--warning-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>📝 Entry test required</span>}
                    {community.visibility === 'private' && <span style={{ fontSize: 11, background: 'var(--danger-light)', color: 'var(--danger-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>🔒 Private</span>}
                    {community.visibility === 'approval' && <span style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>🕐 Owner approval</span>}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {isMember ? (
                <button onClick={leaveCommunity}
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Joined
                </button>
              ) : isPending ? (
                <button disabled style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'default', fontFamily: 'inherit' }}>
                  ⏳ Pending approval
                </button>
              ) : (
                <button onClick={handleJoin}
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {hasTest ? 'Take entry test to join' : 'Join'}
                </button>
              )}
            </div>
          </div>

          {joinMsg && (
            <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '9px 14px', marginTop: 14, fontSize: 13, color: 'var(--warning-text)' }}>
              {joinMsg}
            </div>
          )}

          {(isCommunityAdmin || isPlatformAdmin) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={openTestEditor}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {hasTest ? '✏️ Edit entry test' : '➕ Set entry test'}
              </button>
              {pendingMembers.length > 0 && (
                <button onClick={() => document.getElementById('pending-approvals')?.scrollIntoView({ behavior: 'smooth' })}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🕐 {pendingMembers.length} approval{pendingMembers.length === 1 ? '' : 's'} pending
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Pending approvals (owner) ── */}
        {pendingMembers.length > 0 && (
          <div id="pending-approvals" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>🕐 Join requests awaiting approval</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingMembers.map(m => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 12px' }}>
                  <Avatar name={m.profiles?.full_name} avatarUrl={m.profiles?.avatar_url} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{m.profiles?.full_name || 'Student'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>@{m.profiles?.username}</span></p>
                  </div>
                  <button onClick={() => reviewMember(m.user_id, true)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                  <button onClick={() => reviewMember(m.user_id, false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {user && isMember && (
          <PostComposer
            userId={user.id}
            profile={profile}
            onPosted={loadPosts}
            context={{ communityId: community.id }}
            placeholder={`Post to ${community.name}...`}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.length === 0 ? (
            <EmptyState icon="users" title="Nothing here yet" body={isMember ? 'Owners can kick off the first discussion, resource or announcement in this community.' : 'Join the community to see posts and join in.'} />
          ) : posts.map((post: any) => (
            <PostCard key={post.id} post={post} currentUserId={user?.id} canInteract={!!user && isMember} onChanged={loadPosts} />
          ))}
        </div>
      </div>

      {/* ── Entry test modal (students) ── */}
      {showTest && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { if (!testSubmitting) { setShowTest(false); setTestResult(null) } }}>
          <div className="modal-sheet" style={{ width: '100%', maxWidth: 440, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Entry test">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>📝 {community.name} entry test</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>Answer correctly (60%+) to join this community.</p>

            {testResult && !testResult.passed && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--danger)' }}>
                You scored {testResult.score}/{testResult.total} — need 60%+ to join. You can retry.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(community.join_test || []).map((q: any, qi: number) => (
                <div key={qi}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>{qi + 1}. {q.q}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(q.options || []).map((opt: string, oi: number) => (
                      <button key={oi} onClick={() => setTestAnswers(a => a.map((v, i) => i === qi ? oi : v))}
                        style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 8, border: testAnswers[qi] === oi ? '2px solid var(--accent)' : '1px solid var(--border)', background: testAnswers[qi] === oi ? 'var(--accent-light)' : 'var(--bg)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setShowTest(false); setTestResult(null) }} disabled={testSubmitting}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={submitTest} disabled={testSubmitting || testAnswers.some(a => a < 0)}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: testSubmitting || testAnswers.some(a => a < 0) ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {testSubmitting ? 'Checking…' : 'Submit test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password modal (private communities) ── */}
      {showPassword && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { if (!passwordSending) setShowPassword(false) }}>
          <div className="modal-sheet" style={{ width: '100%', maxWidth: 380, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Enter community password">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🔒 Private community</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>This community is invite-only. Enter the password to join.</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitPassword()} placeholder="Community password" style={inputStyle} autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setShowPassword(false)} disabled={passwordSending} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={submitPassword} disabled={!password || passwordSending} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: !password || passwordSending ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{passwordSending ? 'Checking…' : 'Join'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Entry test editor (owner) ── */}
      {showTestEditor && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { if (!savingTest) setShowTestEditor(false) }}>
          <div className="modal-sheet" style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)', maxHeight: '82vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Configure entry test">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>📝 Entry test — {community.name}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>Students must score 60%+ to join. Leave all questions empty to remove the test.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {testDraft.map((q, qi) => (
                <div key={qi} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>Question {qi + 1}</span>
                    <button onClick={() => setTestDraft(d => d.filter((_, i) => i !== qi))} style={{ background: 'none', border: 'none', color: 'var(--danger-text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                  </div>
                  <input type="text" value={q.q} onChange={e => setTestDraft(d => d.map((x, i) => i === qi ? { ...x, q: e.target.value } : x))} placeholder="Question" style={{ ...inputStyle, marginBottom: 8 }} />
                  <input type="text" value={q.options.join(', ')} onChange={e => setTestDraft(d => d.map((x, i) => i === qi ? { ...x, options: e.target.value.split(',').map(s => s.trim()), answer: 0 } : x))} placeholder="Options, comma-separated (at least 2)" style={{ ...inputStyle, marginBottom: 8 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Correct answer:</span>
                    <select value={q.answer} onChange={e => setTestDraft(d => d.map((x, i) => i === qi ? { ...x, answer: parseInt(e.target.value) } : x))}
                      style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                      {q.options.map((opt, oi) => (
                        <option key={oi} value={oi} disabled={!opt.trim()}>Option {oi + 1}{opt.trim() ? ` — ${opt.trim()}` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setTestDraft(d => [...d, emptyTestQ()])} style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 10, border: '1px dashed var(--border)', background: 'var(--bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add question
            </button>

            {joinMsg && (
              <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '9px 14px', marginTop: 12, fontSize: 13, color: 'var(--warning-text)' }}>{joinMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setShowTestEditor(false); setJoinMsg('') }} disabled={savingTest} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveTest} disabled={savingTest} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: savingTest ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {savingTest ? 'Saving…' : 'Save test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
