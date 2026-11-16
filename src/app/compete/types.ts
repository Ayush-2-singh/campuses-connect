// Shared types for compete page tab components

export type Tab = 'rankings' | 'contributors' | 'challenge' | 'games'

export type Problem = {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  description: string
  constraints: string
  examples: { input: string; output: string; explanation?: string }[]
  starter_code: Record<string, string>
}

export type Submission = {
  verdict: string
  passed: number
  total: number
  first_fail_input: string | null
  runtime_ms?: number
}

/**
 * One row of the Compete leaderboard. Every number here comes from finished
 * matches (live rooms, typing battles, quick-maths battles) — never from
 * profile counters like karma or aura.
 */
export type LeaderEntry = {
  rank: number
  user_id: string
  display_name: string
  username: string | null
  avatar_url: string | null
  department: string | null
  points: number
  wins: number
  played: number
  accuracy: number
  live_points: number
  typing_points: number
  maths_points: number
  live_wins: number
  typing_wins: number
  maths_wins: number
}

export type SeasonInfo = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  is_active: boolean
}

export type RankScope = 'global' | 'campus' | 'friends'
