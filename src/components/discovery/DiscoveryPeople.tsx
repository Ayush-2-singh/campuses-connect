'use client'

/**
 * DISCOVERY → People — surfaces the EXISTING Talent/profile system inside
 * Discovery (spec §17: Discovery links to Talent, never rebuilds it).
 * Public profiles only (RLS: is_public), rows link to real profile pages.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

interface PersonRow {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  headline: string | null
  skills: string[] | null
}

export default function DiscoveryPeople() {
  const supabase = createClient()
  const [rows, setRows] = useState<PersonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, headline, skills')
        .eq('is_public', true)
        .order('karma_points', { ascending: false })
        .limit(18)
      if (cancelled) return
      if (err) setError(err.message)
      setRows((data as PersonRow[]) || [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  if (rows === null && !error) return <ListSkeleton count={3} />
  if (error) return <EmptyState icon="⚠️" title="Could not load people" body={error} />
  if (!rows || rows.length === 0)
    return (
      <EmptyState icon="👥" title="No public profiles yet" body="Builders appear here as students join and share." />
    )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            style={{
              display: 'block',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 14,
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 800,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {p.avatar_url ? (
                   
                  <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (p.full_name || p.username || '?').charAt(0).toUpperCase()
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {p.full_name || p.username}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>@{p.username}</span>
              </span>
            </div>
            {p.headline && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  margin: 0,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {p.headline}
              </p>
            )}
            {p.skills && p.skills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {p.skills.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: 10.5,
                      color: 'var(--text-muted)',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      padding: '2px 7px',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      <Link
        href="/talent"
        style={{
          display: 'block',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--accent)',
          textDecoration: 'none',
          padding: 12,
        }}
      >
        Browse all builders in Talent →
      </Link>
    </div>
  )
}
