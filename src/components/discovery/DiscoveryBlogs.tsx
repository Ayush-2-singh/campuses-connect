'use client'

/**
 * DISCOVERY → Blogs — surfaces the EXISTING blog system inside Discovery
 * (spec §9: developer blogs are discovery content). No second blog engine:
 * data comes from the same search_blog_posts RPC /blog uses, and rows link
 * to the real /blog/[slug] pages.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

interface BlogRow {
  id: string
  title: string
  slug: string
  excerpt: string | null
  author_name: string | null
  author_username: string | null
  like_count: number | null
  view_count: number | null
}

export default function DiscoveryBlogs() {
  const supabase = createClient()
  const [rows, setRows] = useState<BlogRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: err } = await supabase.rpc('search_blog_posts', {
        search_query: '',
        p_category: null,
        p_limit: 12,
        p_offset: 0,
      })
      if (cancelled) return
      if (err) setError(err.message)
      setRows((data as unknown as BlogRow[]) || [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  if (rows === null && !error) return <ListSkeleton count={3} />
  if (error)
    return (
      <EmptyState
        icon="⚠️"
        title="Could not load blogs"
        body={error}
        cta="Open the blog hub"
        onCta={() => (window.location.href = '/blog')}
      />
    )
  if (!rows || rows.length === 0)
    return (
      <EmptyState
        icon="✍️"
        title="No blogs yet"
        body="Share how you built your project, your first SaaS or your hackathon story."
        cta="Write the first one"
        onCta={() => (window.location.href = '/blog/new')}
      />
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((b) => (
        <Link
          key={b.id}
          href={`/blog/${b.slug}`}
          style={{
            display: 'block',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 14,
            textDecoration: 'none',
          }}
        >
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{b.title}</p>
          {b.excerpt && (
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                margin: '4px 0 0',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {b.excerpt}
            </p>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            {b.author_name ? `@${b.author_username || b.author_name}` : 'Student writer'}
            {' · '}👁 {b.view_count ?? 0} {' · '}❤️ {b.like_count ?? 0}
          </p>
        </Link>
      ))}
      <Link
        href="/blog"
        style={{
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--accent)',
          textDecoration: 'none',
          padding: 8,
        }}
      >
        All developer blogs →
      </Link>
    </div>
  )
}
