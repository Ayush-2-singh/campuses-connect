/** Shared quiz types — mirror the jsonb payloads returned by the quiz RPCs. */

export type QuizVisibility = 'private' | 'campus' | 'public'
export type QuizStatus = 'draft' | 'published' | 'archived'
export type QuizSource = 'manual' | 'import' | 'ai' | 'competition'

export type QuizSummary = {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  subject: string
  visibility: QuizVisibility
  status: QuizStatus
  source: QuizSource
  fork_of: string | null
  question_count: number
  play_count: number
  campus_id: string | null
  is_owner: boolean
  owner_id: string | null
}

export type QuizOption = { position: number; text: string }

export type QuizQuestion = {
  position: number
  question_id: string
  type: 'single' | 'multiple' | 'true_false'
  question: string
  image_url: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  subject: string
  topic: string | null
  marks: number
  time_limit_seconds: number
  options: QuizOption[]
  /** only present for the quiz owner */
  explanation: string | null
  /** only present for the quiz owner */
  is_correct_positions: number[] | null
  answered?: boolean
}

export type QuizDetail = {
  ok: true
  quiz: QuizSummary
  questions: QuizQuestion[]
}

export type PracticeAttempt = {
  ok: true
  attempt_id: string
  quiz_id: string
  title: string
  score: number
  answered_count: number
  question_total: number
  questions: QuizQuestion[]
}

export type PracticeAnswerResult = {
  ok: true
  already_answered: boolean
  correct: boolean
  correct_positions: number[]
  explanation: string | null
  points: number
}

export type PracticeSummary = {
  ok: true
  attempt_id: string
  status: string
  score: number
  max_score: number
  percent: number
  correct_count: number
  answered_count: number
  question_total: number
  completed_at: string | null
}
