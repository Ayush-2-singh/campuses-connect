/**
 * Browser-side wrappers around the quiz RPCs.
 *
 * Every mutation is a single SECURITY DEFINER RPC: scores, answer keys,
 * question counts and visibility are decided by the database, never by the
 * caller. Errors are surfaced as a generic message with the Postgres code
 * kept for diagnostics, so a failed call cannot leak room or quiz state.
 */

import { createClient } from '@/lib/supabase/client'
import type {
  PracticeAnswerResult,
  PracticeAttempt,
  PracticeSummary,
  QuizDetail,
  QuizStatus,
  QuizVisibility,
} from './types'

type RpcResponse = { data: unknown; error: { message: string; code?: string } | null }
type RpcCall = (fn: string, args?: Record<string, unknown>) => Promise<RpcResponse>

export class QuizError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'QuizError'
    this.code = code
  }
}

const client = () => createClient()

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = client()
  const call = supabase.rpc.bind(supabase) as unknown as RpcCall
  const { data, error } = await call(fn, args)

  if (error) {
    throw new QuizError(friendly(error.message), error.code)
  }
  return data as T
}

/** Never echo a raw Postgres message to the UI. */
function friendly(message: string): string {
  const text = (message || '').toLowerCase()
  if (text.includes('room limit reached')) return 'You already have as many live rooms as allowed. Finish one first.'
  if (text.includes('daily room limit')) return 'You have created too many rooms today. Try again tomorrow.'
  if (text.includes('publish the quiz')) return 'Publish the quiz before hosting it.'
  if (text.includes('not allowed to host')) return 'You are not allowed to host competitions.'
  if (text.includes('not authenticated')) return 'Please sign in again.'
  if (text.includes('only the quiz owner')) return 'Only the quiz owner can do that.'
  if (text.includes('quiz not found')) return 'That quiz is no longer available.'
  return 'That did not work. Please try again.'
}

export type QuizActionResult = {
  ok: boolean
  error?: string
  quiz_id?: string
  question_count?: number
  added?: number
  skipped?: number
  count?: number
}

export const listQuizDetail = (quizId: string) => rpc<QuizDetail>('quiz_detail', { p_quiz_id: quizId })

export const createQuiz = (input: {
  title: string
  description?: string | null
  subject?: string
  visibility?: QuizVisibility
  campusId?: string | null
  questionIds?: string[]
  source?: 'manual' | 'import' | 'ai' | 'competition'
}) =>
  rpc<QuizActionResult>('quiz_create', {
    p_title: input.title,
    p_description: input.description ?? null,
    p_subject: input.subject ?? 'General',
    p_visibility: input.visibility ?? 'private',
    p_campus_id: input.campusId ?? null,
    p_question_ids: input.questionIds ?? [],
    p_source: input.source ?? 'manual',
  })

export const updateQuiz = (input: {
  quizId: string
  title?: string | null
  description?: string | null
  subject?: string | null
  visibility?: QuizVisibility | null
  coverUrl?: string | null
}) =>
  rpc<QuizActionResult>('quiz_update', {
    p_quiz_id: input.quizId,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_subject: input.subject ?? null,
    p_visibility: input.visibility ?? null,
    p_cover_url: input.coverUrl ?? null,
  })

export const addQuestionsToQuiz = (quizId: string, questionIds: string[]) =>
  rpc<QuizActionResult>('quiz_add_questions', { p_quiz_id: quizId, p_question_ids: questionIds })

export const removeQuestionFromQuiz = (quizId: string, questionId: string) =>
  rpc<QuizActionResult>('quiz_remove_question', { p_quiz_id: quizId, p_question_id: questionId })

export const reorderQuiz = (quizId: string, questionIds: string[]) =>
  rpc<QuizActionResult>('quiz_reorder', { p_quiz_id: quizId, p_question_ids: questionIds })

export const setQuizStatus = (quizId: string, status: QuizStatus) =>
  rpc<QuizActionResult>('quiz_set_status', { p_quiz_id: quizId, p_status: status })

export const deleteQuiz = (quizId: string) =>
  rpc<QuizActionResult & { archived?: boolean }>('quiz_delete', { p_quiz_id: quizId })

export const forkQuiz = (quizId: string, title?: string) =>
  rpc<QuizActionResult>('quiz_fork', { p_quiz_id: quizId, p_title: title ?? null })

export const startCompetitionFromQuiz = (input: {
  quizId: string
  title?: string
  timerSeconds?: number
  maxParticipants?: number
  visibility?: 'code_only' | 'public'
}) =>
  rpc<{ id: string; room_code: string; question_count: number }>('quiz_start_competition', {
    p_quiz_id: input.quizId,
    p_title: input.title ?? null,
    p_timer_seconds: input.timerSeconds ?? 20,
    p_max_participants: input.maxParticipants ?? 500,
    p_visibility: input.visibility ?? 'code_only',
  })

export const startPracticeAttempt = (quizId: string) =>
  rpc<PracticeAttempt>('quiz_attempt_start', { p_quiz_id: quizId })

export const answerPracticeQuestion = (attemptId: string, questionId: string, positions: number[]) =>
  rpc<PracticeAnswerResult>('quiz_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_positions: positions,
  })

export const finishPracticeAttempt = (attemptId: string) =>
  rpc<PracticeSummary>('quiz_attempt_finish', { p_attempt_id: attemptId })

export type AiJobAcceptResult = QuizActionResult & { archived?: boolean }

export const acceptAiDraft = (input: {
  jobId: string
  indices: number[]
  title: string
  visibility?: QuizVisibility
  campusId?: string | null
}) =>
  rpc<AiJobAcceptResult>('quiz_ai_job_accept', {
    p_job_id: input.jobId,
    p_indices: input.indices,
    p_title: input.title,
    p_visibility: input.visibility ?? 'private',
    p_campus_id: input.campusId ?? null,
  })

export const discardAiDraft = (jobId: string) => rpc<QuizActionResult>('quiz_ai_job_discard', { p_job_id: jobId })
