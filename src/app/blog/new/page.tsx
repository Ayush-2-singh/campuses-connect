'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { useHaptic } from '@/hooks/useMobile'

const CATEGORIES = [
  { value: 'interview_experience', label: '🎯 Interview Experience' },
  { value: 'tech_blog', label: '💻 Tech Blog' },
  { value: 'campus_life', label: '🏫 Campus Life' },
  { value: 'how_to', label: '📚 How-To Guide' },
  { value: 'project', label: '🚀 Project' },
  { value: 'review', label: '⭐ Review' },
  { value: 'general', label: '📄 General' },
]

const COMPANIES = [
  'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Flipkart', 'Adobe',
  'Goldman Sachs', 'JP Morgan', 'Uber', 'Atlassian', 'Razorpay', 'Zomato',
  'Swiggy', 'Paytm', 'PhonePe', 'Other',
]

export default function NewBlogPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const haptic = useHaptic()

  const [form, setForm] = useState({
    title: '',
    excerpt: '',
    body: '',
    cover_url: '',
    category: 'general',
    tags: [] as string[],
    tagInput: '',
    company_name: '',
    role: '',
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=/blog/new'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      setLoading(false)
    }
    load()
  }, [])

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
  }

  const addTag = () => {
    const tag = form.tagInput.trim().toLowerCase()
    if (tag && !form.tags.includes(tag) && form.tags.length < 10) {
      setForm(f => ({ ...f, tags: [...f.tags, tag], tagInput: '' }))
    }
  }

  const removeTag = (tag: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))
  }

  const handlePublish = async () => {
    if (!form.title.trim() || !form.body.trim() || !user) return
    setSaving(true)
    haptic.success()

    try {
      const slug = generateSlug(form.title) + '-' + Date.now().toString(36)

      const { error } = await supabase.from('blog_posts').insert({
        author_id: user.id,
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim() || form.body.slice(0, 150).trim(),
        body: form.body.trim(),
        cover_url: form.cover_url.trim() || null,
        category: form.category,
        tags: form.tags,
        company_name: form.company_name || null,
        role: form.role || null,
        status: 'published',
        published_at: new Date().toISOString(),
      })

      if (error) throw error
      router.push(`/blog/${slug}`)
    } catch (err: any) {
      alert(err.message || 'Failed to publish')
    }
    setSaving(false)
  }

  const handleSaveDraft = async () => {
    if (!form.title.trim() || !user) return
    setSaving(true)
    try {
      const slug = generateSlug(form.title) + '-draft-' + Date.now().toString(36)
      await supabase.from('blog_posts').insert({
        author_id: user.id,
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim(),
        body: form.body.trim(),
        cover_url: form.cover_url.trim() || null,
        category: form.category,
        tags: form.tags,
        company_name: form.company_name || null,
        role: form.role || null,
        status: 'draft',
      })
      router.push('/blog')
    } catch { /* ignore */ }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  if (loading) return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>
        <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius)' }} />
      </div>
    </Layout>
  )

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            ✍️ Write a Blog
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPreview(p => !p)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: preview ? 'var(--accent-light)' : 'var(--bg)',
                color: preview ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {preview ? '✏️ Edit' : '👁 Preview'}
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Blog title *"
            style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: '14px 16px' }}
          />

          {/* Excerpt */}
          <textarea
            value={form.excerpt}
            onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
            placeholder="Short description (shown in cards, ~150 chars)"
            rows={2}
            style={{ ...inputStyle, resize: 'none' }}
          />

          {/* Cover URL */}
          <input
            type="url"
            value={form.cover_url}
            onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))}
            placeholder="Cover image URL (optional)"
            style={inputStyle}
          />

          {/* Category & Company */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...inputStyle, padding: '10px 12px' }}
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {(form.category === 'interview_experience' || form.category === 'review') && (
              <select
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                style={{ ...inputStyle, padding: '10px 12px' }}
              >
                <option value="">Select company</option>
                {COMPANIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Role (for interview experiences) */}
          {form.category === 'interview_experience' && (
            <input
              type="text"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="Role (e.g. SDE Intern, Frontend Engineer)"
              style={inputStyle}
            />
          )}

          {/* Tags */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Tags (press Enter or + to add)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={form.tagInput}
                onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="e.g. react, dsa, system-design"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addTag}
                style={{
                  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >+ Add</button>
            </div>
            {form.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {form.tags.map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 600, color: 'var(--accent-text)',
                    background: 'var(--accent-light)', border: '1px solid var(--accent-border)',
                    padding: '3px 10px', borderRadius: 20,
                  }}>
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 14 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          {preview ? (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              padding: 20, minHeight: 300, fontSize: 15, color: 'var(--text-secondary)',
              lineHeight: 1.8, whiteSpace: 'pre-wrap',
            }}>
              {form.body || 'Nothing to preview yet...'}
            </div>
          ) : (
            <textarea
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your blog post here... (supports plain text, paragraphs will auto-format)"
              rows={15}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 300, lineHeight: 1.7 }}
            />
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => router.back()}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-secondary)',
                fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={!form.title.trim() || saving}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-secondary)',
                fontSize: 14, cursor: !form.title.trim() || saving ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={!form.title.trim() || !form.body.trim() || saving}
              className="btn-shine"
              style={{
                flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                background: !form.title.trim() || !form.body.trim() ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)', fontSize: 14, fontWeight: 700,
                cursor: !form.title.trim() || !form.body.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Publishing…' : '🚀 Publish'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
