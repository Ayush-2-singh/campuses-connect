import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Fetch LeetCode stats (shared helper) ────────────────────
async function fetchLeetCodeStats(username: string) {
  // Fetch LeetCode user profile via GraphQL
  const profileQuery = {
    query: `
      query userPublicProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile {
            realName
            userAvatar
            ranking
            reputation
          }
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
              submissions
            }
          }
          badges {
            id
            displayName
            icon
            category
          }
        }
        recentAcSubmissionList(username: $username, limit: 10) {
          id
          title
          titleSlug
          timestamp
        }
      }
    `,
    variables: { username },
  }

  const lcRes = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://leetcode.com',
      'Origin': 'https://leetcode.com',
      'User-Agent': 'CampusConnect/1.0',
    },
    body: JSON.stringify(profileQuery),
  })

  if (!lcRes.ok) {
    throw new Error('LeetCode API is temporarily unavailable. Please try again.')
  }

  const lcData = await lcRes.json()

  // Check for GraphQL errors
  if (lcData.errors && lcData.errors.length > 0) {
    throw new Error(lcData.errors[0].message || 'LeetCode query failed')
  }

  const matchedUser = lcData?.data?.matchedUser
  if (!matchedUser) {
    throw new Error('LeetCode user not found. Please check your username and make sure your profile is public.')
  }

  // Parse submission stats
  const submitStats = matchedUser.submitStatsGlobal?.acSubmissionNum || []
  const getStat = (difficulty: string) =>
    submitStats.find((s: any) => s.difficulty === difficulty)?.count || 0

  const totalSolved = getStat('All')
  const easySolved = getStat('Easy')
  const mediumSolved = getStat('Medium')
  const hardSolved = getStat('Hard')

  // Fetch contest rating
  let contestRating = 0
  let contestTotal = 0
  try {
    const contestQuery = {
      query: `query userContestRanking($username: String!) {
        userContestRanking(username: $username) {
          attendedContestsCount
          rating
          globalRanking
          topPercentage
        }
      }`,
      variables: { username },
    }
    const contestRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com',
        'Origin': 'https://leetcode.com',
        'User-Agent': 'CampusConnect/1.0',
      },
      body: JSON.stringify(contestQuery),
    })
    if (contestRes.ok) {
      const contestData = await contestRes.json()
      contestRating = Math.round(contestData?.data?.userContestRanking?.rating || 0)
      contestTotal = contestData?.data?.userContestRanking?.attendedContestsCount || 0
    }
  } catch { /* fallback */ }

  const profile = matchedUser.profile || {}
  const badges = matchedUser.badges || []
  const recentSolved = (lcData?.data?.recentAcSubmissionList || []).map((s: any) => ({
    title: s.title,
    slug: s.titleSlug,
    timestamp: s.timestamp,
  }))

  const stats = {
    total_solved: totalSolved,
    easy_solved: easySolved,
    medium_solved: mediumSolved,
    hard_solved: hardSolved,
    rating: contestRating,
    contest_total: contestTotal,
    ranking: profile.ranking || 0,
    reputation: profile.reputation || 0,
    badges_count: badges.length,
    recent_solved: recentSolved,
  }

  return {
    username: matchedUser.username,
    display_name: profile.realName || matchedUser.username,
    avatar_url: profile.userAvatar || '',
    profile_url: `https://leetcode.com/${matchedUser.username}/`,
    stats,
  }
}

/** GET /api/integrations/leetcode?username=xxx — fetch LeetCode stats */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    const data = await fetchLeetCodeStats(username)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch LeetCode data' }, { status: 500 })
  }
}

/** POST /api/integrations/leetcode — connect LeetCode account */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { username } = body
  if (!username || !username.trim()) {
    return NextResponse.json({ error: 'Please enter your LeetCode username' }, { status: 400 })
  }

  try {
    // Fetch LeetCode data (this also verifies the user exists)
    const lcData = await fetchLeetCodeStats(username.trim())

    // Delete old connection if any
    const { error: delErr } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'leetcode')
    if (delErr) console.error('Delete error:', delErr)

    // Insert new connection
    const { error: insertErr } = await supabase.from('user_integrations').insert({
      user_id: user.id,
      platform: 'leetcode',
      username: lcData.username,
      display_name: lcData.display_name,
      profile_url: lcData.profile_url,
      avatar_url: lcData.avatar_url,
      is_verified: true,
      last_synced_at: new Date().toISOString(),
    })
    if (insertErr) {
      console.error('Insert error:', insertErr)
      return NextResponse.json({ error: `Database error: ${insertErr.message}` }, { status: 500 })
    }

    // Cache stats directly (no self-call needed)
    const { error: statsErr } = await supabase.from('integration_stats').upsert({
      user_id: user.id,
      platform: 'leetcode',
      stats: lcData.stats,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' })
    if (statsErr) console.error('Stats cache error:', statsErr)

    return NextResponse.json({ ok: true, username: lcData.username })
  } catch (err: any) {
    console.error('LeetCode connect error:', err)
    return NextResponse.json({ error: err.message || 'Failed to connect LeetCode' }, { status: 500 })
  }
}

/** DELETE /api/integrations/leetcode — disconnect LeetCode */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('user_integrations').delete().eq('user_id', user.id).eq('platform', 'leetcode')
  await supabase.from('integration_stats').delete().eq('user_id', user.id).eq('platform', 'leetcode')

  return NextResponse.json({ ok: true })
}
