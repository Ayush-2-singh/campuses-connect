import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  public_repos: number
  followers: number
  following: number
  created_at: string
}

interface GitHubRepo {
  name: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
}

interface GitHubContributions {
  totalContributions: number
  weeks: { contributions: number }[]
}

/** GET /api/integrations/github?username=xxx — fetch GitHub profile + stats */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    // Fetch GitHub user profile
    const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' },
    })
    if (!userRes.ok) {
      return NextResponse.json({ error: 'GitHub user not found' }, { status: 404 })
    }
    const ghUser: GitHubUser = await userRes.json()

    // Fetch top repos (sorted by stars)
    const reposRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' } }
    )
    const repos: GitHubRepo[] = reposRes.ok ? await reposRes.json() : []

    // Fetch contribution count from GitHub's contribution API
    // (uses the public contribution calendar)
    let totalContributions = 0
    try {
      const calRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
        { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' } }
      )
      if (calRes.ok) {
        const events = await calRes.json()
        // Count PushEvent and CreateEvent as contributions
        totalContributions = events.filter((e: any) =>
          e.type === 'PushEvent' || e.type === 'CreateEvent'
        ).reduce((sum: number, e: any) => {
          if (e.type === 'PushEvent') return sum + (e.payload?.size || 1)
          return sum + 1
        }, 0)
      }
    } catch { /* fallback */ }

    // Compute languages from repos
    const languages: Record<string, number> = {}
    for (const repo of repos) {
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1
      }
    }

    // Top languages sorted
    const topLanguages = Object.entries(languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([lang, count]) => ({ language: lang, repos: count }))

    const stats = {
      public_repos: ghUser.public_repos,
      followers: ghUser.followers,
      following: ghUser.following,
      total_contributions: totalContributions,
      top_repos: repos.slice(0, 5).map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        topics: r.topics,
      })),
      top_languages: topLanguages,
    }

    return NextResponse.json({
      username: ghUser.login,
      display_name: ghUser.name,
      avatar_url: ghUser.avatar_url,
      profile_url: `https://github.com/${ghUser.login}`,
      stats,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch GitHub data' }, { status: 500 })
  }
}

/** POST /api/integrations/github — connect GitHub account */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { username } = body
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    // Verify the GitHub user exists
    const ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' },
    })
    if (!ghRes.ok) return NextResponse.json({ error: 'GitHub user not found' }, { status: 404 })
    const ghUser: GitHubUser = await ghRes.json()

    // Upsert integration
    const { error: delErr } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'github')
    if (delErr) console.error('Delete error:', delErr)

    const { error } = await supabase.from('user_integrations').insert({
      user_id: user.id,
      platform: 'github',
      username: ghUser.login,
      display_name: ghUser.name,
      profile_url: `https://github.com/${ghUser.login}`,
      avatar_url: ghUser.avatar_url,
      is_verified: true,
      last_synced_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch and cache stats
    const statsRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/github?username=${encodeURIComponent(username)}`,
      { headers: { Cookie: req.headers.get('cookie') || '' } }
    )
    if (statsRes.ok) {
      const { stats } = await statsRes.json()
      await supabase.from('integration_stats').upsert({
        user_id: user.id,
        platform: 'github',
        stats,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
    }

    return NextResponse.json({ ok: true, username: ghUser.login })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to connect GitHub' }, { status: 500 })
  }
}

/** DELETE /api/integrations/github — disconnect GitHub */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('user_integrations').delete().eq('user_id', user.id).eq('platform', 'github')
  await supabase.from('integration_stats').delete().eq('user_id', user.id).eq('platform', 'github')

  return NextResponse.json({ ok: true })
}
