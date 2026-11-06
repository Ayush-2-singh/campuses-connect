/**
 * Validation for AI-generated quiz questions.
 *
 * Pure and dependency-free so it can be unit tested without a database and
 * reused by the API route. The same rules are re-applied in SQL
 * (`quiz_ai_validate_question`) as defence in depth — keep them in sync.
 */

export type DraftQuestionType = 'single' | 'multiple' | 'true_false'
export type DraftDifficulty = 'easy' | 'medium' | 'hard'

export type DraftOption = { text: string; is_correct: boolean }

export type DraftQuestion = {
  question: string
  type: DraftQuestionType
  options: DraftOption[]
  explanation: string
  difficulty: DraftDifficulty
  marks: number
  time_limit_seconds: number
  topic: string
}

export type RejectedQuestion = { index: number; reason: string }

export type ValidationOutcome = {
  accepted: DraftQuestion[]
  rejected: RejectedQuestion[]
  duplicates: number
}

export type ValidationOptions = {
  /** hard ceiling, mirrors quiz.ai.max_questions */
  maxQuestions?: number
  /** question texts the user already owns, to reject re-generation */
  existingQuestions?: string[]
}

const MIN_MAX = 1
const MAX_QUESTIONS_CEILING = 50

const normalize = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

const dedupeKey = (text: string): string => normalize(text).toLowerCase()

/**
 * Pull a JSON object out of a model response. Handles a bare object, a
 * ```json fenced block, and leading prose — models do all three.
 * Returns `null` rather than throwing so the route can report a clean error.
 */
export function extractJsonObject(raw: string): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return null

  const text = raw.trim()
  const candidates: string[] = [text]

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      /* try the next shape */
    }
  }
  return null
}

/** Models wrap the array in one of a few common keys. */
export function extractRawQuestions(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  for (const key of ['questions', 'items', 'quiz']) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function validateOne(
  input: unknown,
  index: number,
  seen: Set<string>
): { question: DraftQuestion } | { reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { reason: 'not_an_object' }
  }
  const record = input as Record<string, unknown>

  const text = normalize(record.question ?? record.question_text ?? record.text)
  if (text.length < 5) return { reason: 'question_too_short' }
  if (text.length > 1000) return { reason: 'question_too_long' }

  const key = dedupeKey(text)
  if (seen.has(key)) return { reason: 'duplicate' }

  const rawType = normalize(record.type ?? record.question_type).toLowerCase()
  const type: DraftQuestionType =
    rawType === 'multiple' || rawType === 'multiple_choice' || rawType === 'multi'
      ? 'multiple'
      : rawType === 'true_false' || rawType === 'truefalse' || rawType === 'boolean'
        ? 'true_false'
        : 'single'

  const rawOptions = Array.isArray(record.options) ? record.options : []
  if (rawOptions.length < 2 || rawOptions.length > 4) return { reason: 'bad_option_count' }
  if (type === 'true_false' && rawOptions.length !== 2) return { reason: 'true_false_needs_two' }

  const options: DraftOption[] = []
  for (const raw of rawOptions) {
    if (!raw || typeof raw !== 'object') return { reason: 'bad_option' }
    const option = raw as Record<string, unknown>
    const optionText = normalize(option.text ?? option.option_text ?? option.label)
    if (!optionText) return { reason: 'empty_option' }
    if (optionText.length > 300) return { reason: 'option_too_long' }
    options.push({
      text: optionText,
      is_correct: option.is_correct === true || option.correct === true,
    })
  }

  const distinct = new Set(options.map((option) => dedupeKey(option.text)))
  if (distinct.size !== options.length) return { reason: 'duplicate_option' }

  const correctCount = options.filter((option) => option.is_correct).length
  if (correctCount === 0) return { reason: 'no_correct_option' }
  if (correctCount === options.length) return { reason: 'all_options_correct' }
  if (type !== 'multiple' && correctCount !== 1) return { reason: 'too_many_correct' }

  const difficultyRaw = normalize(record.difficulty).toLowerCase()
  const difficulty: DraftDifficulty =
    difficultyRaw === 'easy' || difficultyRaw === 'hard' ? (difficultyRaw as DraftDifficulty) : 'medium'

  const marksRaw = Number(record.marks ?? 100)
  const marks = Number.isFinite(marksRaw) ? Math.min(Math.max(Math.round(marksRaw), 1), 1000) : 100

  const timeRaw = Number(record.time_limit_seconds ?? record.time_limit ?? 20)
  const time_limit_seconds = Number.isFinite(timeRaw) ? Math.min(Math.max(Math.round(timeRaw), 5), 300) : 20

  seen.add(key)

  return {
    question: {
      question: text,
      type,
      options,
      explanation: normalize(record.explanation).slice(0, 1000),
      difficulty,
      marks,
      time_limit_seconds,
      topic: normalize(record.topic).slice(0, 80),
    },
  }
}

export function validateGeneratedQuestions(payload: unknown, options: ValidationOptions = {}): ValidationOutcome {
  const requested = Number(options.maxQuestions ?? MAX_QUESTIONS_CEILING)
  const maxQuestions = Math.min(
    Math.max(Number.isFinite(requested) ? Math.floor(requested) : MAX_QUESTIONS_CEILING, MIN_MAX),
    MAX_QUESTIONS_CEILING
  )

  const accepted: DraftQuestion[] = []
  const rejected: RejectedQuestion[] = []
  const seen = new Set<string>((options.existingQuestions ?? []).map((text) => dedupeKey(text)).filter(Boolean))
  let duplicates = 0

  const raw = Array.isArray(payload) ? payload : extractRawQuestions(payload)

  raw.forEach((item, index) => {
    if (accepted.length >= maxQuestions) {
      rejected.push({ index, reason: 'over_limit' })
      return
    }
    const result = validateOne(item, index, seen)
    if ('reason' in result) {
      if (result.reason === 'duplicate') duplicates += 1
      rejected.push({ index, reason: result.reason })
      return
    }
    accepted.push(result.question)
  })

  return { accepted, rejected, duplicates }
}

/** Shape the accepted questions for the `p_draft` argument of quiz_ai_job_create. */
export function toDraftPayload(accepted: DraftQuestion[]): { questions: DraftQuestion[] } {
  return { questions: accepted }
}
