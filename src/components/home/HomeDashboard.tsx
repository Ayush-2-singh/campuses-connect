'use client'

/**
 * HOME DASHBOARD — "What's happening on CampusConnect right now?" (spec §3/§24).
 *
 * One compact strip of global, PUBLIC data: Trending, Discovery, Library,
 * Confessions, Leaderboard and What's New. Every query is anon-safe so the
 * exact same strip serves logged-out and logged-in users — authentication
 * personalizes the page around it (greeting, composer, feed), not this.
 * Rows link to the real sections; Home never duplicates them.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface HomeData {
  trending: { id: string; title: string; body: string; created_at: string }[]
  ideas: { id: string; title: string; category: string; created_at: string }[]
  resources: { id: string; title: string; subject: string; created_at: string }[]
  confessions: { id: string; body: string; reaction_count: number }[]
  leaders: { user_id: string; username: string; full_name: string; karma_points: number }[]
}

const WHATS_NEW = [
  { icon: '🤝', text: 'Discovery matching launched — swipe ideas, find builders' },
  { icon: '🏆', text: 'Combined leaderboard: karma + GitHub + LeetCode' },
  { icon: '🎧', text: 'Live Voice rooms across campuses' },
  { icon: '📚', text: 'Library upgrades — notes, PYQs and AI Brain' },
]

function SectionCard({
  icon,
  title,
  href,
  children,
}: {
  icon: string
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {icon} {title}
        </p>
        <Link
          href={href}
          style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}
        >
          See all →
        </Link>
      </div>
      {children}
    </div>
  )
}

function Row({ primary, secondary, meta }: { primary: string; secondary?: string; meta?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 1,
        }}
      >
        {primary}
      </span>
      {secondary && (
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {secondary}
        </span>
      )}
      {meta && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{meta}</span>}
    </div>
  )
}

export default function HomeDashboard() {
  const supabase = createClient()
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    let cancelled = false
    // All anon-safe reads (verified against live RLS): posts, discovery_posts,
    // global notes, confessions_public view, get_enhanced_leaderboard.
    const load = async () => {
      const [trending, ideas, resources, confessions, leaders] = await Promise.all([
        supabase
          .from('posts')
          .select('id, title, body, created_at')
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('discovery_posts')
          .select('id, title, category, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('notes')
          .select('id, title, subject, created_at')
          .eq('visibility', 'global')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('confessions_public')
          .select('id, body, reaction_count')
          .order('reaction_count', { ascending: false })
          .limit(3),
        supabase.rpc('get_enhanced_leaderboard', { p_limit: 3 }),
      ])
      if (cancelled) return
      setData({
        trending: (trending.data as HomeData['trending']) || [],
        ideas: (ideas.data as HomeData['ideas']) || [],
        resources: (resources.data as HomeData['resources']) || [],
        confessions: (confessions.data as HomeData['confessions']) || [],
        leaders: (leaders.data as unknown as HomeData['leaders']) || [],
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  if (!data) return null

  const hasAny =
    data.trending.length + data.ideas.length + data.resources.length + data.confessions.length + data.leaders.length > 0

  if (!hasAny) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
      <SectionCard icon="🔥" title="Trending" href="/feed">
        {data.trending.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0' }}>No discussions yet.</p>
        ) : (
          data.trending.map((t) => (
            <Link key={t.id} href={`/post/${t.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <Row primary={t.title || t.body.slice(0, 60)} meta={new Date(t.created_at).toLocaleDateString()} />
            </Link>
          ))
        )}
      </SectionCard>

      <SectionCard icon="🔎" title="Discovery" href="/discover">
        {data.ideas.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0' }}>
            No ideas yet — be the first to post one.
          </p>
        ) : (
          data.ideas.map((i) => (
            <Link key={i.id} href={`/discover/${i.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <Row primary={i.title} secondary={i.category} />
            </Link>
          ))
        )}
      </SectionCard>

      <SectionCard icon="📚" title="Library" href="/notes">
        {data.resources.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0' }}>No public resources yet.</p>
        ) : (
          data.resources.map((r) => (
            <Link key={r.id} href="/notes" style={{ textDecoration: 'none', display: 'block' }}>
              <Row primary={r.title} secondary={r.subject} />
            </Link>
          ))
        )}
      </SectionCard>

      <SectionCard icon="💭" title="Confessions" href="/community">
        {data.confessions.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0' }}>Nothing confessed yet.</p>
        ) : (
          data.confessions.map((c) => <Row key={c.id} primary={c.body.slice(0, 70)} meta={`❤️ ${c.reaction_count}`} />)
        )}
      </SectionCard>

      <SectionCard icon="🏆" title="Leaderboard" href="/leaderboard">
        {data.leaders.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0' }}>No rankings yet.</p>
        ) : (
          data.leaders.map((l, idx) => (
            <Link
              key={l.user_id}
              href={l.username ? `/profile/${l.username}` : '/leaderboard'}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <Row primary={`#${idx + 1} ${l.full_name || l.username}`} meta={`${l.karma_points} karma`} />
            </Link>
          ))
        )}
      </SectionCard>

      <SectionCard icon="🆕" title="What's New" href="/about">
        {WHATS_NEW.map((n) => (
          <Row key={n.text} primary={`${n.icon} ${n.text}`} />
        ))}
      </SectionCard>
    </div>
  )
}
