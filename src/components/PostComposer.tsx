'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listCreatableCategories, useAdminContext } from '@/lib/permissions'
import type { CreatableCategory, PostScope } from '@/types'

const SCOPE_LABELS: Record<string, string> = {
  campus: 'This Campus',
  college_network: 'Whole College',
  global: 'Global',
}

export default function PostComposer({
  userId,
  profile,
  onPosted,
  context,
  placeholder = 'Share with your community...',
}: {
  userId: string
  profile?: any
  onPosted: () => void
  context: { communityId?: string; campusId?: string; collegeId?: string }
  placeholder?: string
}) {
  const [creatable, setCreatable] = useState<CreatableCategory[]>([])
  const [category, setCategory] = useState<CreatableCategory | null>(null)
  const [scope, setScope] = useState<PostScope>('campus')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [heldNotice, setHeldNotice] = useState('')
  const [postError, setPostError] = useState('')
  const admin = useAdminContext(userId)

  useEffect(() => {
    listCreatableCategories(userId, context).then(list => {
      setCreatable(list)
      if (list.length) {
        setCategory(list[0])
        setScope((list[0].max_scope as PostScope) || 'campus')
      }
    })
  }, [userId, context.communityId, context.campusId, context.collegeId])

  const scopeLevel = (s?: string) => (s === 'global' ? 3 : s === 'college_network' ? 2 : s === 'campus' ? 1 : 0)
  // Community posts are always global. Students get campus | global
  // (college_network stays admin territory).
  const baseScopes = context.communityId ? (['global'] as PostScope[]) : (['campus', 'college_network', 'global'] as PostScope[])
  // A scope is valid only if the actor may use it here: college_network is
  // admin-only, and 'campus' requires an actual campus/college context.
  const scopeUsable = (s: PostScope) =>
    (admin.isAdmin || s !== 'college_network')
    && (s !== 'campus' || !!(context.campusId || context.collegeId))
  const hasValidScope = (c: CreatableCategory) => baseScopes.some(s => scopeLevel(c.max_scope) >= scopeLevel(s) && scopeUsable(s))
  const visibleCategories = creatable.filter(hasValidScope)
  const current = visibleCategories.find(c => c.category_key === category?.category_key) || visibleCategories[0] || null
  const maxScope = current?.max_scope
  const scopeOptions = baseScopes.filter(s => scopeLevel(maxScope) >= scopeLevel(s) && scopeUsable(s))

  if (!current) return null // no posting rights in this context

  const handlePost = async () => {
    if (!body.trim() || !current || posting) return
    setPosting(true)
    setChecking(true)
    setPostError('')
    setHeldNotice('')
    const supabase = createClient()

    // 1. AI Admin Copilot pre-check — Gemini never blocks; on failure we allow.
    let flagged = false
    let aiVerdict: any = null
    try {
      const res = await fetch('/api/admin/copilot/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body.trim(), contentType: current.category_key }),
      })
      if (res.ok) {
        const data = await res.json()
        flagged = !!data.verdict?.flagged
        aiVerdict = data.verdict
      }
    } catch {
      /* fail open — post normally */
    }

    // 2. Insert (held when flagged so only the author + moderators see it)
    const insertPayload: any = {
      author_id: userId,
      category_id: current.category_id,
      scope,
      community_id: context.communityId || null,
      college_id: context.collegeId || null,
      campus_id: context.campusId || null,
      body: body.trim(),
      status: flagged ? 'held' : 'published',
    }
    if (flagged) insertPayload.held_reason = aiVerdict?.reason || 'Pending AI review'

    const { data: inserted, error } = await supabase.from('posts').insert(insertPayload).select('id').single()
    if (error) {
      setPostError('Could not post. Please try again.')
      setChecking(false)
      setPosting(false)
      return
    }

    // 3. When flagged, enqueue for moderation + notify author.
    //    Fallback: if the API route fails, call the RPC directly so the
    //    post is never left in held-limbo (invisible + unqueued).
    if (flagged && inserted?.id) {
      let queued = false
      try {
        const res = await fetch('/api/admin/copilot/flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_type: 'post',
            content_id: inserted.id,
            reason: aiVerdict?.reason || 'Pending AI review',
            ai_verdict: aiVerdict,
          }),
        })
        queued = res.ok
      } catch { /* try direct RPC below */ }
      if (!queued) {
        try {
          await supabase.rpc('flag_content', {
            p_content_type: 'post',
            p_content_id: inserted.id,
            p_reason: aiVerdict?.reason || 'Pending AI review',
            p_ai_verdict: aiVerdict,
            p_author_id: userId,
          })
        } catch {
          /* last resort: leave held, moderator can still find via author */
        }
      }
      setHeldNotice('Your post was sent for review by our AI moderator. It will appear once approved.')
      setBody('')
      setOpen(false)
      setChecking(false)
      setPosting(false)
      onPosted()
      return
    }

    setBody('')
    setOpen(false)
    setChecking(false)
    setPosting(false)
    onPosted()
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
      {!open ? (
        <div onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
            {profile?.full_name?.[0] || 'A'}
          </div>
          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: 'var(--text-muted)' }}>
            {placeholder}
          </div>
        </div>
      ) : (
        <div>
          <textarea autoFocus value={body} onChange={e => setBody(e.target.value)} rows={4}
            placeholder={placeholder}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', marginBottom: 10, background: 'var(--bg-secondary)', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {visibleCategories.map(c => (
              <button key={c.category_key} onClick={() => { setCategory(c); setScope((c.max_scope as PostScope) || 'campus') }}
                style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: category?.category_key === c.category_key ? 'none' : '1px solid var(--border)', background: category?.category_key === c.category_key ? 'var(--accent)' : 'var(--bg)', color: category?.category_key === c.category_key ? 'var(--on-accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {c.label}
              </button>
            ))}
          </div>
          {heldNotice && (
            <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--warning-text)', marginBottom: 10, lineHeight: 1.5 }}>
              🛡️ {heldNotice}
            </div>
          )}
          {postError && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>
              {postError}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <select value={scope} onChange={e => setScope(e.target.value as PostScope)}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, background: 'var(--bg)', outline: 'none', fontFamily: 'inherit' }}>
              {scopeOptions.map(s => <option key={s} value={s}>🌍 {SCOPE_LABELS[s]}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!body.trim() || posting || checking}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: !body.trim() || posting || checking ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {checking ? '🛡️ Checking...' : posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
