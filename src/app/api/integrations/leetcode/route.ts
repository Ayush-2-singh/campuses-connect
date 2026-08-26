import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/integrations/leetcode?username=xxx — fetch LeetCode stats */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
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
        'User-Agent': 'CampusConnect/1.0',
      },
      body: JSON.stringify(profileQuery),
    })

    if (!lcRes.ok) {
      return NextResponse.json({ error: 'LeetCode API error' }, { status: 502 })
    }

    const lcData = await lcRes.json()
    const matchedUser = lcData?.data?.matchedUser

    if (!matchedUser) {
      return NextResponse.json({ error: 'LeetCode user not found' }, { status: 404 })
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
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com', 'User-Agent': 'CampusConnect/1.0' },
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

    return NextResponse.json({
      username: matchedUser.username,
      display_name: profile.realName || matchedUser.username,
      avatar_url: profile.userAvatar || '',
      profile_url: `https://leetcode.com/${matchedUser.username}/`,
      stats,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch LeetCode data' }, { status: 500 })
  }
}

/** POST /api/integrations/leetcode — connect LeetCode account */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { username } = body
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    // Verify user exists on LeetCode
    const verifyQuery = {
      query: `query { matchedUser(username: "${username}") { username } }`,
    }
    const lcRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com', 'User-Agent': 'CampusConnect/1.0' },
      body: JSON.stringify(verifyQuery),
    })
    if (!lcRes.ok) return NextResponse.json({ error: 'LeetCode API error' }, { status: 502 })
    const lcData = await lcRes.json()
    if (!lcData?.data?.matchedUser) return NextResponse.json({ error: 'LeetCode user not found' }, { status: 404 })

    // Delete old connection
    await supabase.from('user_integrations').delete().eq('user_id', user.id).eq('platform', 'leetcode')

    // Insert new
    const { error } = await supabase.from('user_integrations').insert({
      user_id: user.id,
      platform: 'leetcode',
      username: username,
      display_name: username,
      profile_url: `https://leetcode.com/${username}/`,
      avatar_url: '',
      is_verified: true,
      last_synced_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch and cache stats
    const statsRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/leetcode?username=${encodeURIComponent(username)}`,
      { headers: { Cookie: req.headers.get('cookie') || '' } }
    )
    if (statsRes.ok) {
      const { stats } = await statsRes.json()
      await supabase.from('integration_stats').upsert({
        user_id: user.id,
        platform: 'leetcode',
        stats,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
    }

    return NextResponse.json({ ok: true, username })
  } catch (err: any) {
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
