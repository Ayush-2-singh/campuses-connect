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
  examples: {
    input: string
    output: string
    /** LeetCode-style rendering of the arguments; `input` stays the raw stdin. */
    input_display?: string
    explanation?: string
  }[]
  starter_code: Record<string, string>
}

export type CaseStatus =
  'passed' | 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error' | 'compile_error' | 'internal_error'

/** One row of a Run or Submit result. Run rows carry input/expected/actual. */
export type CaseResult = {
  index: number
  status: CaseStatus
  passed: boolean
  time_ms: number
  input?: string
  expected?: string
  actual?: string
  stderr?: string | null
  compile_output?: string | null
}

export type Submission = {
  verdict: string
  passed: number
  total: number
  runtime_ms?: number
  cases?: CaseResult[]
  compile_output?: string | null
  stderr?: string | null
}

/** Visit `/api/compete/run` result: public examples only. */
export type RunResult = {
  verdict: string
  passed: number
  total: number
  runtime_ms?: number
  cases: CaseResult[]
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
