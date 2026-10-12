import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * GET /api/batch/[token] — the public recruiter shortlist.
 *
 * Reads through the service-role client so batch RLS (admin-only) never hides
 * a shared batch. Only recruiter-safe fields are returned — no emails, no
 * private profile data.
 */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const admin = getSupabaseAdmin()

  const { data: batch } = await admin
    .from('batches')
    .select('id, title, status, created_at')
    .eq('token', token)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  const { data: links } = await admin
    .from('batch_students')
    .select('user_id, position')
    .eq('batch_id', batch.id)
    .order('position', { ascending: true })

  const ids = ((links as any[]) || []).map((l) => l.user_id)
  if (ids.length === 0) {
    return NextResponse.json({ batch, candidates: [] })
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, username, avatar_url, headline, skills, college_id')
    .in('id', ids)

  const collegeIds = [...new Set(((profiles as any[]) || []).map((p) => p.college_id).filter(Boolean))]

  const [{ data: stats }, { data: colleges }] = await Promise.all([
    admin.from('integration_stats').select('user_id, platform, stats').in('user_id', ids),
    collegeIds.length
      ? admin.from('colleges').select('id, name').in('id', collegeIds)
      : Promise.resolve({ data: [] as any[] } as { data: any[] }),
  ])

  const profileById = new Map(((profiles as any[]) || []).map((p) => [p.id, p]))
  const collegeById = new Map(((colleges as any[]) || []).map((c) => [c.id, c.name]))

  const statsByUser = new Map<string, Record<string, any>>()
  for (const row of (stats as any[]) || []) {
    const bucket = statsByUser.get(row.user_id) || {}
    bucket[row.platform] = row.stats || {}
    statsByUser.set(row.user_id, bucket)
  }

  const candidates = ids.map((id) => {
    const p = profileById.get(id)
    const s = statsByUser.get(id) || {}
    const github = s.github || {}
    const leetcode = s.leetcode || {}
    return {
      id,
      full_name: p?.full_name ?? 'Candidate',
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      headline: p?.headline ?? null,
      college: p?.college_id ? (collegeById.get(p.college_id) ?? null) : null,
      skills: Array.isArray(p?.skills) ? p.skills : [],
      github_contributions: num(github.total_contributions ?? github.public_repos),
      leetcode_solved: num(leetcode.total_solved),
      leetcode_rating: num(leetcode.rating),
      profile_href: p?.username ? `/profile/${p.username}` : null,
    }
  })

  return NextResponse.json({ batch, candidates })
}
