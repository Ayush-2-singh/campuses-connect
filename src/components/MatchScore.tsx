'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons'

const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'are', 'our', 'from', 'this', 'that', 'internship', 'hackathon', 'job', 'role', 'position', 'apply', 'students', 'student', 'work', 'looking', 'want', 'who', 'can', 'will', 'has', 'have', 'not', 'but', 'all', 'any', 'new', 'now'])

/** Tokenize text into meaningful lowercase keywords. */
function tokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t))
}

/**
 * Honest AI Match — computes a real match between an opportunity and the
 * signed-in student using signals that actually exist:
 *   1. profile.skills           ↔ opportunity.skills_required
 *   2. profile bio/headline     ↔ opportunity title/description/company
 *   3. department/type affinity (a student's department name vs the posting)
 *
 * If the student's profile is empty there is nothing to match — we say so and
 * show a "complete your profile" CTA instead of inventing a percentage.
 */
export default function MatchScore({ opp, profile }: { opp: any; profile?: any }) {
  const router = useRouter()

  const result = useMemo(() => {
    const profileSkills: string[] = Array.isArray(profile?.skills)
      ? profile.skills.filter(Boolean).map((s: any) => String(s).toLowerCase())
      : []
    const oppSkills: string[] = Array.isArray(opp?.skills_required)
      ? opp.skills_required.filter(Boolean).map((s: any) => String(s))
      : []

    const profileText = [
      profile?.bio,
      profile?.headline,
      profile?.departments?.short_name,
      profile?.departments?.name,
      profile?.colleges?.name,
    ].filter(Boolean).join(' ')

    const oppText = [
      opp?.title,
      opp?.description,
      opp?.company_org,
      opp?.opp_type,
    ].filter(Boolean).join(' ')

    const oppTokens = new Set(tokens(oppText))

    // 1) Skill overlap — the strongest signal.
    const matched = profileSkills.filter(s => oppSkills.map(x => x.toLowerCase()).includes(s))
    const missing = oppSkills.filter(s => !profileSkills.includes(s.toLowerCase()))

    // 2) Keyword overlap between profile bio and the posting.
    const keywordHits = tokens(profileText).filter(t => oppTokens.has(t))

    // 3) Department affinity — department name appears in the posting.
    const dept = [profile?.departments?.short_name, profile?.departments?.name].filter(Boolean).join(' ').toLowerCase()
    const deptHit = dept.split(/\s+/).some(d => d.length > 2 && oppText.toLowerCase().includes(d))

    const profileRich = profileSkills.length > 0 || tokens(profileText).length > 2
    if (!profileRich) {
      return {
        score: 0, matched: [], missing: oppSkills, keywordHits: [],
        deptHit: false, basis: 'No profile data yet', needsProfile: true,
      }
    }

    let score = 0
    if (oppSkills.length > 0) {
      score += Math.round((matched.length / oppSkills.length) * 60)
    } else {
      score += 35 // neutral baseline when the posting lists no skills
    }
    score += Math.min(20, keywordHits.length * 6)
    if (deptHit) score += 15
    if (profile?.current_year) score += 5

    score = Math.max(5, Math.min(99, score))

    return {
      score, matched, missing: missing.slice(0, 4), keywordHits: keywordHits.slice(0, 4),
      deptHit, basis: oppSkills.length > 0 ? 'Skills + profile fit' : 'Profile vs posting', needsProfile: false,
    }
  }, [opp, profile])

  // ── Colors by score ─────────────────────────────────────────────────────────
  const toneBg = result.score >= 75 ? 'var(--success-light)'
    : result.score >= 50 ? 'var(--accent-light)'
    : 'var(--warning-light)'
  const ringColor = result.score >= 75 ? 'var(--success)'
    : result.score >= 50 ? 'var(--accent)'
    : 'var(--warning)'
  const R = 15
  const CIRC = 2 * Math.PI * R

  const reasons: string[] = []
  if (result.needsProfile) {
    reasons.push('Your profile is empty — there is nothing to match against yet.')
  } else {
    if (result.matched.length > 0) reasons.push(`You match: ${result.matched.join(', ')}`)
    if (result.missing.length > 0) reasons.push(`Could add: ${result.missing.join(', ')}`)
    if (result.keywordHits.length > 0) reasons.push(`Bio mentions: ${result.keywordHits.join(', ')}`)
    if (result.deptHit) reasons.push('Department fits this posting')
    if (reasons.length === 0) reasons.push('No obvious overlap — focus on other opportunities or sharpen your bio.')
  }

  return (
    <div style={{
      margin: '12px 0 0', padding: '12px 14px',
      background: `linear-gradient(135deg, ${toneBg} 0%, transparent 70%)`,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Score ring */}
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="19" cy="19" r={R} fill="none" stroke="var(--bg-tertiary)" strokeWidth="3.5" />
          <circle
            cx="19" cy="19" r={R} fill="none"
            stroke={ringColor} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - (result.needsProfile ? 0 : result.score / 100))}
            transform="rotate(-90 19 19)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
          <text x="19" y="22.5" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={ringColor}>
            {result.needsProfile ? '—' : result.score}
          </text>
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <Icon name="sparkles" size={13} /> AI Match
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{result.basis}</span>
          </div>
          {result.needsProfile ? (
            <button
              onClick={() => router.push('/profile')}
              style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-light)', border: 'none', padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Complete your profile for a real match →
            </button>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {result.matched.map(s => (
                <span key={s} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--success-text)', background: 'var(--success-light)', padding: '2px 8px', borderRadius: 20 }}>✓ {s}</span>
              ))}
              {result.missing.map(s => (
                <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 20 }}>+ {s}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!result.needsProfile && reasons.length > 0 && (
        <p style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          {reasons.join(' · ')}
        </p>
      )}
    </div>
  )
}
