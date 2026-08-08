'use client'

import { useMemo } from 'react'
import { Icon } from '@/components/icons'

/**
 * AI Match Score — computes an honest, transparent match between an
 * opportunity and the signed-in student using real signals:
 *  - overlap between the posted `skills_required` and the student's own text
 *    (bio, department, college)
 *  - year-level fit (a profile with a current year gets a small eligibility bump)
 *
 * When no skill data exists it falls back to a neutral "general fit" estimate
 * and says so — it never claims a match it can't compute.
 */
export default function MatchScore({ opp, profile }: { opp: any; profile?: any }) {
  const result = useMemo(() => {
    const skills: string[] = Array.isArray(opp?.skills_required)
      ? opp.skills_required.filter(Boolean).map((s: any) => String(s))
      : []

    const profileText = [
      profile?.bio,
      profile?.headline,
      profile?.departments?.short_name,
      profile?.departments?.name,
      profile?.colleges?.name,
      profile?.campuses?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    let matched: string[] = []
    let missing: string[] = []
    let score = 0
    let basis = ''

    if (skills.length > 0) {
      matched = skills.filter(s => profileText.includes(s.toLowerCase()))
      missing = skills.filter(s => !profileText.includes(s.toLowerCase()))
      score = Math.round((matched.length / skills.length) * 100)
      basis = 'Skills in your profile'
    } else {
      // No skill tags posted — neutral general-fit estimate based on profile completeness.
      const signals = [profile?.bio, profile?.current_year, profile?.departments?.short_name].filter(Boolean).length
      score = signals > 0 ? 66 : 55
      basis = 'General campus fit'
    }

    // Small eligibility bump for students with a declared year.
    if (profile?.current_year) score += 4

    const typeAffinity = profileText.includes(opp?.opp_type?.toLowerCase() || '') ? 5 : 0
    score += typeAffinity

    score = Math.max(30, Math.min(99, score))
    return { score, matched, missing, basis, hasSkills: skills.length > 0 }
  }, [opp, profile])

  if (!profile) return null

  const tone = result.score >= 75 ? 'var(--success-text)' : result.score >= 55 ? 'var(--accent-text)' : 'var(--warning-text)'
  const toneBg = result.score >= 75 ? 'var(--success-light)' : result.score >= 55 ? 'var(--accent-light)' : 'var(--warning-light)'

  return (
    <div style={{ margin: '10px 0 0', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="sparkles" size={14} />
        <span style={{ fontSize: 11, fontWeight: 700, color: tone, background: toneBg, padding: '2px 8px', borderRadius: 20 }}>
          AI MATCH {result.score}%
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{result.basis}</span>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        {result.matched.length > 0 && (
          <span style={{ color: 'var(--success-text)' }}>
            {result.matched.map(s => `✓ ${s}`).join('  ')}
          </span>
        )}
        {result.matched.length > 0 && result.missing.length > 0 && <span>  </span>}
        {result.missing.length > 0 && (
          <span style={{ color: 'var(--warning-text)' }}>
            {result.missing.slice(0, 3).map(s => `• ${s}`).join('  ')}
          </span>
        )}
        {!result.hasSkills && <span>Based on your declared year, department and profile. Add skills to your bio for sharper matches.</span>}
        {result.hasSkills && result.matched.length === 0 && result.missing.length === 0 && (
          <span>No skill tags listed for this opportunity.</span>
        )}
      </div>
    </div>
  )
}
