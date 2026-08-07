'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listCreatableCategories } from '@/lib/permissions'
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

  useEffect(() => {
    listCreatableCategories(userId, context).then(list => {
      setCreatable(list)
      if (list.length) {
        setCategory(list[0])
        setScope((list[0].max_scope as PostScope) || 'campus')
      }
    })
  }, [userId, context.communityId, context.campusId, context.collegeId])

  if (!creatable.length) return null // no posting rights in this context

  const scopeLevel = (s?: string) => (s === 'global' ? 3 : s === 'college_network' ? 2 : s === 'campus' ? 1 : 0)
  const maxScope = creatable.find(c => c.category_key === category?.category_key)?.max_scope
  const scopeOptions = (['campus', 'college_network', 'global'] as PostScope[]).filter(
    s => scopeLevel(maxScope) >= scopeLevel(s)
  )

  const handlePost = async () => {
    if (!body.trim() || !category || posting) return
    setPosting(true)
    const supabase = createClient()
    const { error } = await supabase.from('posts').insert({
      author_id: userId,
      category_id: category.category_id,
      scope,
      community_id: context.communityId || null,
      college_id: context.collegeId || null,
      campus_id: context.campusId || null,
      body: body.trim(),
      status: 'published',
    })
    if (!error) {
      setBody('')
      setOpen(false)
      onPosted()
    }
    setPosting(false)
  }

  return (
    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
      {!open ? (
        <div onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
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
            {creatable.map(c => (
              <button key={c.category_key} onClick={() => { setCategory(c); setScope((c.max_scope as PostScope) || 'campus') }}
                style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: category?.category_key === c.category_key ? 'none' : '1px solid var(--border)', background: category?.category_key === c.category_key ? 'var(--accent)' : 'white', color: category?.category_key === c.category_key ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {c.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <select value={scope} onChange={e => setScope(e.target.value as PostScope)}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, background: 'white', outline: 'none', fontFamily: 'inherit' }}>
              {scopeOptions.map(s => <option key={s} value={s}>🌍 {SCOPE_LABELS[s]}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!body.trim() || posting}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: !body.trim() || posting ? '#93c5fd' : 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
