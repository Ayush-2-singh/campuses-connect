'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import SectionShell from '@/components/SectionShell'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'

/**
 * /talent — candidate discovery.
 *
 * The recruiter-facing view of the student pool. Everything shown is a REAL
 * field from `profiles` (name, headline, skills, campus, department, year,
 * github_url, verified) plus a score computed from real `dsa_submissions`.
 *
 * Honesty note: the platform currently has no assessment submissions, so every
 * candidate honestly reads "Not assessed". The score filter still works — it
 * simply matches nothing until assessments run, and the empty state says so.
 * Nothing here invents a score, a rank or a candidate.
 */

type Score = { pct: number; date: string | null }

const MAX_SKILLS_SHOWN = 4

export default function TalentPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [campus, setCampus] = useState('all')
  const [minScore, setMinScore] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [hasGithub, setHasGithub] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(prof)
      }

      const { data } = await supabase
        .from('profiles')
        .select('*, campuses(name), departments(short_name)')
        .eq('is_public', true)
        .order('karma_points', { ascending: false })
        .limit(100)
      const rows = data || []
      setStudents(rows)

      // Real assessment signal: aggregate the candidates' own submissions.
      const ids = rows.map((r) => r.id)
      if (ids.length) {
        const { data: subs } = await supabase
          .from('dsa_submissions')
          .select('user_id, passed, total, created_at')
          .in('user_id', ids)
        if (subs && subs.length) {
          const agg: Record<string, { passed: number; total: number; date: string }> = {}
          for (const s of subs) {
            const a = (agg[s.user_id] ||= { passed: 0, total: 0, date: '' })
            a.passed += s.passed || 0
            a.total += s.total || 0
            if (s.created_at && s.created_at > a.date) a.date = s.created_at
          }
          const next: Record<string, Score> = {}
          for (const [id, a] of Object.entries(agg)) {
            if (a.total > 0) next[id] = { pct: Math.round((a.passed / a.total) * 100), date: a.date || null }
          }
          setScores(next)
        }
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load, as before
  }, [])

  /** Campus options come from the loaded rows — no extra query. */
  const campusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of students) if (s.campuses?.name) set.add(s.campuses.name)
    return Array.from(set).sort()
  }, [students])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = minScore.trim() === '' ? null : Number(minScore)
    return students.filter((s) => {
      if (verifiedOnly && !s.is_verified) return false
      if (hasGithub && !s.github_url) return false
      if (campus !== 'all' && s.campuses?.name !== campus) return false

      if (min !== null && !Number.isNaN(min)) {
        const sc = scores[s.id]
        if (!sc || sc.pct < min) return false
      }

      if (!q) return true
      const hay = [
        s.full_name,
        s.username,
        s.headline,
        s.bio,
        s.departments?.short_name,
        s.campuses?.name,
        ...(s.skills || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [students, search, campus, minScore, verifiedOnly, hasGithub, scores])

  const assessedCount = useMemo(() => Object.keys(scores).length, [scores])
  const hasActiveFilter = !!(search || campus !== 'all' || minScore || verifiedOnly || hasGithub)

  const clearFilters = () => {
    setSearch('')
    setCampus('all')
    setMinScore('')
    setVerifiedOnly(false)
    setHasGithub(false)
  }

  return (
    <Layout user={user} profile={profile}>
      <SectionShell
        icon="star"
        title="Candidate discovery"
        subtitle="Filter the student pool by role, skills, campus and assessment score"
        stats={[
          { value: filtered.length, label: 'Candidates' },
          { value: assessedCount, label: 'Assessed' },
        ]}
      >
        {assessedCount === 0 && !loading && (
          <p className="cd-note">
            No candidate has a recorded assessment score yet — every result below reads <strong>Not assessed</strong>.
            Scores appear here automatically once assessments run, and the minimum-score filter starts matching then.
          </p>
        )}

        {/* ── Filters ── */}
        <div className="cd-filters">
          <div className="cd-field">
            <span className="cd-search-ic">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              className="cd-input cd-input--search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role or skill…"
              aria-label="Search candidates"
            />
          </div>
          <div className="cd-field">
            <select
              className="cd-input"
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              aria-label="Filter by campus"
            >
              <option value="all">All campuses</option>
              {campusOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="cd-field">
            <input
              type="number"
              min={0}
              max={100}
              className="cd-input"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Minimum assessment score"
              aria-label="Minimum assessment score"
            />
          </div>
        </div>

        <div className="cd-toggles">
          <button
            type="button"
            className="cd-toggle"
            aria-pressed={verifiedOnly}
            onClick={() => setVerifiedOnly((v) => !v)}
          >
            <Icon name="check" size={13} />
            Verified only
          </button>
          <button type="button" className="cd-toggle" aria-pressed={hasGithub} onClick={() => setHasGithub((v) => !v)}>
            <Icon name="github" size={13} />
            Has GitHub
          </button>
          {hasActiveFilter && (
            <button type="button" className="cd-toggle" onClick={clearFilters}>
              <Icon name="x" size={13} />
              Clear filters
            </button>
          )}
        </div>

        {/* ── Results ── */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title={hasActiveFilter ? 'No candidates match these filters' : 'No candidates yet'}
            body={
              hasActiveFilter
                ? 'Try widening the filters. If you set a minimum assessment score, note that no assessments have been recorded yet.'
                : 'When students join and make their profiles public, they appear here.'
            }
            cta={hasActiveFilter ? 'Clear filters' : undefined}
            onCta={hasActiveFilter ? clearFilters : undefined}
          />
        ) : (
          <div className="cd-grid">
            {filtered.map((s) => {
              const sc = scores[s.id]
              const skills: string[] = (s.skills || []).slice(0, MAX_SKILLS_SHOWN)
              const extra = (s.skills || []).length - skills.length
              return (
                <article className="cd-card" key={s.id}>
                  <div className="cd-head">
                    <Avatar name={s.full_name} avatarUrl={s.avatar_url} size={44} />
                    <div className="cd-id">
                      <p className="cd-name">
                        {s.full_name || 'Unnamed candidate'}
                        {s.is_verified && (
                          <span title="Verified" aria-label="Verified">
                            <Icon name="check" size={13} style={{ color: 'var(--success-text)' }} />
                          </span>
                        )}
                      </p>
                      <p className="cd-role">{s.headline || 'Role not specified'}</p>
                      <p className="cd-meta">
                        {[s.campuses?.name, s.departments?.short_name, s.current_year && `Year ${s.current_year}`]
                          .filter(Boolean)
                          .join(' · ') || 'Campus not listed'}
                      </p>
                    </div>
                  </div>

                  {skills.length > 0 && (
                    <div className="cd-skills">
                      {skills.map((k) => (
                        <span className="cd-skill" key={k}>
                          {k}
                        </span>
                      ))}
                      {extra > 0 && <span className="cd-skill">+{extra}</span>}
                    </div>
                  )}

                  <div className="cd-score-row">
                    <div className="cd-score">
                      {sc ? (
                        <>
                          <p className="cd-score-v" style={{ margin: 0 }}>
                            {sc.pct}
                            <small> /100</small>
                          </p>
                          <p className="cd-score-l">Assessment · DSA</p>
                        </>
                      ) : (
                        <span className="cd-status cd-status--wait">
                          <Icon name="clock" size={11} />
                          Not assessed
                        </span>
                      )}
                    </div>
                    <div className="cd-actions">
                      {s.github_url && (
                        <a
                          className="cd-btn"
                          href={s.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="github" size={14} />
                          GitHub
                        </a>
                      )}
                      <button
                        type="button"
                        className="cd-btn cd-btn--primary"
                        onClick={() => router.push(`/profile/${s.username}`)}
                      >
                        View profile
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </SectionShell>
    </Layout>
  )
}
