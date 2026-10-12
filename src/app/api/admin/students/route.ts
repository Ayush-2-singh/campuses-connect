import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

/**
 * GET /api/admin/students?q= — pick students for a batch (admin only).
 *
 * Draws on the public talent pool via the existing get_enhanced_leaderboard
 * RPC (verified skill signals), then filters by name/handle.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()
  const admin = getSupabaseAdmin()

  const { data, error } = await admin.rpc('get_enhanced_leaderboard', {
    p_campus_id: null,
    p_limit: 200,
  })

  if (error) {
    console.error('[students] leaderboard failed:', error.message)
    return NextResponse.json({ error: 'Failed to load students.' }, { status: 500 })
  }

  const students = ((data as any[]) || [])
    .filter(
      (s) =>
        !q ||
        String(s.full_name || '')
          .toLowerCase()
          .includes(q) ||
        String(s.username || '')
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 50)
    .map((s) => ({
      id: s.user_id,
      full_name: s.full_name,
      username: s.username,
      avatar_url: s.avatar_url,
      department: s.department,
      github_contributions: s.github_contributions,
      leetcode_solved: s.leetcode_solved,
      combined_score: s.combined_score,
    }))

  return NextResponse.json({ students })
}
