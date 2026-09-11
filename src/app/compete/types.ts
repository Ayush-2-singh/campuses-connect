// Shared types for compete page tab components

export type Tab = 'rankings' | 'challenge' | 'clash'

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

export type LeaderEntry = {
  user_id: string
  full_name: string
  username: string
  avatar_url: string | null
  karma_points: number
  aura_points: number
  streak_days: number
  department?: string
  combined_score: number
  github_contributions: number
  leetcode_solved: number
  leetcode_rating: number
}

export type SeasonInfo = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  is_active: boolean
}

export type RankScope = 'global' | 'campus' | 'friends'
