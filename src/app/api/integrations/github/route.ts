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
  topics: string[] | undefined
}

// ── Fetch GitHub stats (shared helper) ──────────────────────
async function fetchGitHubStats(username: string) {
  // Fetch GitHub user profile
  const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' },
  })
  if (!userRes.ok) {
    throw new Error('GitHub user not found. Please check your username.')
  }
  const ghUser: GitHubUser = await userRes.json()

  // Fetch top repos (sorted by stars)
  const reposRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10`,
    { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' } }
  )
  const repos: GitHubRepo[] = reposRes.ok ? await reposRes.json() : []

  // Fetch contribution count from public events
  let totalContributions = 0
  try {
    const calRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CampusConnect/1.0' } }
    )
    if (calRes.ok) {
      const events = await calRes.json()
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
      topics: r.topics || [],
    })),
    top_languages: topLanguages,
  }

  return {
    username: ghUser.login,
    display_name: ghUser.name,
    avatar_url: ghUser.avatar_url,
    profile_url: `https://github.com/${ghUser.login}`,
    stats,
  }
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
    const data = await fetchGitHubStats(username)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch GitHub data' }, { status: 500 })
  }
}

/** POST /api/integrations/github — connect GitHub account */
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
    return NextResponse.json({ error: 'Please enter your GitHub username' }, { status: 400 })
  }

  try {
    // Fetch GitHub data (this also verifies the user exists)
    const ghData = await fetchGitHubStats(username.trim())

    // Delete old connection if any
    const { error: delErr } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'github')
    if (delErr) console.error('Delete error:', delErr)

    // Insert new connection
    const { error: insertErr } = await supabase.from('user_integrations').insert({
      user_id: user.id,
      platform: 'github',
      username: ghData.username,
      display_name: ghData.display_name,
      profile_url: ghData.profile_url,
      avatar_url: ghData.avatar_url,
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
      platform: 'github',
      stats: ghData.stats,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' })
    if (statsErr) console.error('Stats cache error:', statsErr)

    return NextResponse.json({ ok: true, username: ghData.username })
  } catch (err: any) {
    console.error('GitHub connect error:', err)
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
