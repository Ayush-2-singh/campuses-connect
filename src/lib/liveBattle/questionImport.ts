/**
 * QUESTION IMPORT — pure parsing/validation for the Live Battle question bank.
 *
 * Deliberately browser-side and dependency-free: a CSV or JSON file is read as
 * text, parsed, validated and previewed before anything reaches Postgres. That
 * keeps uploaded files out of storage entirely (no bucket, no cleanup job, no
 * cost) and means a malformed row is reported next to the row that caused it.
 *
 * The rules here mirror the database constraints in
 * supabase/migrations/20261117_live_battle.sql — if they ever disagree, the
 * insert fails loudly instead of storing something a competition cannot use.
 */

export type QuestionType = 'single' | 'multiple' | 'true_false'
export type Difficulty = 'easy' | 'medium' | 'hard'

export type DraftOption = { text: string; correct: boolean }

export type DraftQuestion = {
  question: string
  options: DraftOption[]
  explanation: string
  difficulty: Difficulty
  subject: string
  topic: string | null
  tags: string[]
  marks: number
  timeLimit: number
  type: QuestionType
  imageUrl: string | null
}

export type ImportRow = { row: number; draft: DraftQuestion; errors: string[] }
export type ImportPreview = { rows: ImportRow[]; fileError: string | null }

export const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'true_false']
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export const LIMITS = {
  questionMin: 3,
  questionMax: 2000,
  optionMin: 1,
  optionMax: 500,
  marksMin: 1,
  marksMax: 1000,
  timeMin: 5,
  timeMax: 300,
  optionsPerQuestion: 4,
} as const

export const CSV_HEADERS = [
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct',
  'explanation',
  'difficulty',
  'subject',
  'topic',
  'tags',
  'marks',
  'time_limit',
  'type',
  'image_url',
] as const

export const CSV_TEMPLATE = `${CSV_HEADERS.join(',')}
"Which data structure is used for BFS?","Stack","Queue","Heap","Array","B","BFS visits level by level, so it needs a FIFO queue.","easy","DSA","Graphs","graphs,bfs",100,20,single,
"Which of these are O(n log n) sorts?","Merge sort","Quick sort (average)","Bubble sort","Counting sort","A;B","Merge sort is O(n log n) always; quick sort is on average.","medium","DSA","Sorting","sorting",100,25,multiple,
"Python is an interpreted language.","True","False","","","A","CPython compiles to bytecode and runs it on a virtual machine.","easy","Python","Basics","",100,15,true_false,
`

export const JSON_TEMPLATE = `${JSON.stringify(
  [
    {
      question: 'Which data structure is used for BFS?',
      options: [
        { text: 'Stack', correct: false },
        { text: 'Queue', correct: true },
        { text: 'Heap', correct: false },
        { text: 'Array', correct: false },
      ],
      explanation: 'BFS visits level by level, so it needs a FIFO queue.',
      difficulty: 'easy',
      subject: 'DSA',
      topic: 'Graphs',
      tags: ['graphs', 'bfs'],
      marks: 100,
      time_limit: 20,
      type: 'single',
      image_url: null,
    },
    {
      question: 'Python is an interpreted language.',
      options: [
        { text: 'True', correct: true },
        { text: 'False', correct: false },
      ],
      difficulty: 'easy',
      subject: 'Python',
      type: 'true_false',
      time_limit: 15,
    },
  ],
  null,
  2
)}\n`

/** RFC 4180-ish CSV reader: quotes, escaped quotes, CRLF and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const lower = (v: string) => v.trim().toLowerCase()

function pickColumn(header: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = header.findIndex((h) => h === alias)
    if (idx !== -1) return idx
  }
  return -1
}

function asNumber(value: string | undefined, fallback: number): number {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) && n !== 0 ? n : fallback
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(n), min), max)
}

function toDifficulty(value: string | undefined, fallback: Difficulty): Difficulty {
  const v = lower(String(value ?? ''))
  return (DIFFICULTIES as string[]).includes(v) ? (v as Difficulty) : fallback
}

function toType(value: string | undefined, options: DraftOption[], fallback: QuestionType): QuestionType {
  const v = lower(String(value ?? ''))
  if (v === 'true/false' || v === 'tf') return 'true_false'
  if ((QUESTION_TYPES as string[]).includes(v)) return v as QuestionType
  return fallback
}

function splitTags(value: string | undefined | null): string[] {
  return String(value ?? '')
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function cleanImageUrl(value: string | undefined | null): string | null {
  const v = String(value ?? '').trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : null
}

/**
 * "A;C", "b, d", "1;3", "true", or the option text itself → indexes of the
 * correct options. Returns null when the answer cannot be understood.
 */
export function parseCorrectIndexes(raw: string, texts: string[]): number[] | null {
  const value = raw.trim()
  if (!value) return null

  const letters = value.match(/[A-Da-d]/g)
  const numbers = value.match(/\d+/g)
  if (/^[A-Da-d](?:\s*[;,\s]\s*[A-Da-d])*$/.test(value) && letters) {
    return [...new Set(letters.map((l) => l.toUpperCase().charCodeAt(0) - 65))].filter((i) => i < texts.length)
  }
  if (/^\d+(?:\s*[;,\s]\s*\d+)*$/.test(value) && numbers) {
    // 1-based when every index is within the number of options.
    const oneBased = numbers.map((n) => Number(n))
    if (oneBased.every((n) => n >= 1 && n <= texts.length)) return [...new Set(oneBased.map((n) => n - 1))]
    const zeroBased = oneBased.filter((n) => n >= 0 && n < texts.length)
    return zeroBased.length ? [...new Set(zeroBased)] : null
  }

  const index = texts.findIndex((t) => t.trim().toLowerCase() === value.toLowerCase())
  return index === -1 ? null : [index]
}

/**
 * JSON `correct` values: numbers are 0-based indexes (the natural reading in a
 * JSON file, `[1]` = the second option); letters such as "A"/"B" are read like
 * the CSV column. CSV numbers stay 1-based, because a spreadsheet is 1-based.
 */
function parseJsonCorrectIndexes(value: unknown, texts: string[]): number[] {
  if (Array.isArray(value)) {
    const numbers = value.map((v) => Number(v))
    if (numbers.every((n) => Number.isFinite(n))) {
      return [...new Set(numbers)].filter((n) => n >= 0 && n < texts.length)
    }
    return parseCorrectIndexes(value.map((v) => String(v)).join(','), texts) ?? []
  }
  const raw = String(value ?? '').trim()
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    return n >= 0 && n < texts.length ? [n] : []
  }
  return parseCorrectIndexes(raw, texts) ?? []
}

/** Shared validator. Returns human-readable problems, empty when importable. */
export function validateDraft(draft: DraftQuestion): string[] {
  const errors: string[] = []
  const text = draft.question.trim()

  if (text.length < LIMITS.questionMin) errors.push('question text is too short')
  if (text.length > LIMITS.questionMax) errors.push(`question text is longer than ${LIMITS.questionMax} characters`)
  if (draft.options.length < 2) errors.push('at least two options are required')
  if (draft.options.length > LIMITS.optionsPerQuestion) errors.push('at most four options are allowed')
  if (draft.options.some((o) => o.text.trim().length < LIMITS.optionMin)) errors.push('an option is empty')
  if (draft.options.some((o) => o.text.trim().length > LIMITS.optionMax)) errors.push('an option is too long')

  const correct = draft.options.filter((o) => o.correct).length
  if (correct === 0) errors.push('no correct answer marked')
  if (draft.type === 'true_false') {
    if (draft.options.length !== 2) errors.push('true/false needs exactly two options')
    if (correct !== 1) errors.push('true/false needs exactly one correct answer')
  }
  if (draft.type === 'single' && correct > 1) errors.push('single-answer question has more than one correct option')

  if (draft.marks < LIMITS.marksMin || draft.marks > LIMITS.marksMax)
    errors.push(`marks must be ${LIMITS.marksMin}-${LIMITS.marksMax}`)
  if (draft.timeLimit < LIMITS.timeMin || draft.timeLimit > LIMITS.timeMax)
    errors.push(`time limit must be ${LIMITS.timeMin}-${LIMITS.timeMax} seconds`)
  if (!draft.subject.trim()) errors.push('subject is required')
  if (draft.imageUrl && !/^https?:\/\//i.test(draft.imageUrl)) errors.push('image URL must start with http(s)://')

  return errors
}

function inferType(options: DraftOption[], declared: QuestionType | null): QuestionType {
  if (declared) return declared
  if (options.length === 2) {
    const names = options.map((o) => o.text.trim().toLowerCase()).sort()
    if (names[0] === 'false' && names[1] === 'true') return 'true_false'
  }
  return options.filter((o) => o.correct).length > 1 ? 'multiple' : 'single'
}

function buildDraft(input: {
  question: string
  options: DraftOption[]
  explanation?: string | null
  difficulty?: string | null
  subject?: string | null
  topic?: string | null
  tags?: string | string[] | null
  marks?: number | string | null
  timeLimit?: number | string | null
  type?: string | null
  imageUrl?: string | null
}): DraftQuestion {
  const options = input.options
    .map((o) => ({ text: o.text.trim(), correct: o.correct }))
    .filter((o) => o.text.length > 0)
  const type = inferType(options, input.type ? toType(input.type, options, 'single') : null)

  return {
    question: String(input.question ?? '').trim(),
    options,
    explanation: String(input.explanation ?? '')
      .trim()
      .slice(0, 2000),
    difficulty: toDifficulty(input.difficulty ?? undefined, 'medium'),
    subject:
      String(input.subject ?? 'General')
        .trim()
        .slice(0, 60) || 'General',
    topic: input.topic ? String(input.topic).trim().slice(0, 60) || null : null,
    tags: Array.isArray(input.tags)
      ? input.tags
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 8)
      : splitTags(input.tags),
    marks: clamp(asNumber(String(input.marks ?? ''), 100), LIMITS.marksMin, LIMITS.marksMax),
    timeLimit: clamp(
      asNumber(String(input.timeLimit ?? ''), type === 'true_false' ? 15 : 20),
      LIMITS.timeMin,
      LIMITS.timeMax
    ),
    type,
    imageUrl: cleanImageUrl(input.imageUrl),
  }
}

/** CSV → preview. Header names are matched case-insensitively with aliases. */
export function csvToPreview(text: string): ImportPreview {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], fileError: 'The file is empty.' }

  const header = table[0].map((h) => lower(h).replace(/\s+/g, '_'))
  const col = {
    question: pickColumn(header, ['question', 'question_text', 'text']),
    a: pickColumn(header, ['option_a', 'option1', 'a', 'option_1']),
    b: pickColumn(header, ['option_b', 'option2', 'b', 'option_2']),
    c: pickColumn(header, ['option_c', 'option3', 'c', 'option_3']),
    d: pickColumn(header, ['option_d', 'option4', 'd', 'option_4']),
    correct: pickColumn(header, ['correct', 'answer', 'correct_answer', 'correct_option']),
    explanation: pickColumn(header, ['explanation', 'reason', 'solution']),
    difficulty: pickColumn(header, ['difficulty', 'level']),
    subject: pickColumn(header, ['subject', 'category']),
    topic: pickColumn(header, ['topic', 'chapter']),
    tags: pickColumn(header, ['tags', 'tag']),
    marks: pickColumn(header, ['marks', 'points', 'score']),
    time: pickColumn(header, ['time_limit', 'time', 'seconds', 'timer']),
    type: pickColumn(header, ['type', 'question_type']),
    image: pickColumn(header, ['image_url', 'image', 'img']),
  }

  if (col.question === -1 || col.a === -1) {
    return { rows: [], fileError: 'The header row needs at least "question" and "option_a" columns.' }
  }

  const cell = (row: string[], index: number) => (index === -1 ? '' : String(row[index] ?? ''))

  const rows: ImportRow[] = table.slice(1).map((row, i) => {
    const texts = [col.a, col.b, col.c, col.d].map((index) => cell(row, index).trim()).filter((t) => t.length > 0)
    const answers = parseCorrectIndexes(cell(row, col.correct), texts) ?? []
    const options = texts.map((t, idx) => ({ text: t, correct: answers.includes(idx) }))

    const draft = buildDraft({
      question: cell(row, col.question),
      options,
      explanation: cell(row, col.explanation),
      difficulty: cell(row, col.difficulty),
      subject: cell(row, col.subject),
      topic: cell(row, col.topic),
      tags: cell(row, col.tags),
      marks: cell(row, col.marks),
      timeLimit: cell(row, col.time),
      type: cell(row, col.type),
      imageUrl: cell(row, col.image),
    })

    const errors = validateDraft(draft)
    if (answers.length === 0) errors.unshift('correct answer could not be read from the "correct" column')
    return { row: i + 2, draft, errors }
  })

  return { rows, fileError: rows.length === 0 ? 'No question rows found below the header.' : null }
}

type JsonOption = string | { text?: string; option?: string; correct?: boolean; is_correct?: boolean }

/** JSON → preview. Accepts an array, or `{ "questions": [...] }`. */
export function jsonToPreview(text: string): ImportPreview {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { rows: [], fileError: `That is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}` }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
      ? ((parsed as { questions: unknown[] }).questions as unknown[])
      : null

  if (!list) return { rows: [], fileError: 'Expected an array of questions, or an object with a "questions" array.' }
  if (list.length === 0) return { rows: [], fileError: 'The file contains no questions.' }

  const rows: ImportRow[] = list.map((item, i) => {
    const q = (item ?? {}) as Record<string, unknown>
    const rawOptions = Array.isArray(q.options) ? (q.options as JsonOption[]) : []
    const options: DraftOption[] = rawOptions
      .map((opt) =>
        typeof opt === 'string'
          ? { text: opt, correct: false }
          : { text: String(opt?.text ?? opt?.option ?? ''), correct: Boolean(opt?.correct ?? opt?.is_correct) }
      )
      .filter((o) => o.text.trim().length > 0)

    // `correct: [1,3]` / `correct: ["A"]` at the question level, instead of flags.
    if (!options.some((o) => o.correct) && q.correct !== undefined) {
      const indexes = parseJsonCorrectIndexes(
        q.correct,
        options.map((o) => o.text)
      )
      for (const idx of indexes) options[idx].correct = true
    }

    const draft = buildDraft({
      question: String(q.question ?? q.text ?? q.question_text ?? ''),
      options,
      explanation: (q.explanation as string) ?? null,
      difficulty: (q.difficulty as string) ?? null,
      subject: (q.subject ?? q.category) as string,
      topic: q.topic as string,
      tags: (q.tags as string | string[]) ?? null,
      marks: (q.marks ?? q.points) as number,
      timeLimit: (q.time_limit ?? q.timeLimit ?? q.seconds) as number,
      type: q.type as string,
      imageUrl: (q.image_url ?? q.imageUrl ?? q.image) as string,
    })

    return { row: i + 1, draft, errors: validateDraft(draft) }
  })

  return { rows, fileError: null }
}

/** Dispatch by file extension, falling back to the first non-space character. */
export function parseImportFile(fileName: string, text: string): ImportPreview {
  const isJson = /\.json$/i.test(fileName) || text.trimStart().startsWith('[') || text.trimStart().startsWith('{')
  return isJson ? jsonToPreview(text) : csvToPreview(text)
}

export function validRows(preview: ImportPreview): ImportRow[] {
  return preview.rows.filter((r) => r.errors.length === 0)
}

/** Draft → the row shapes `question_bank` / `question_bank_options` expect. */
export function toBankRows(draft: DraftQuestion, createdBy: string) {
  const question = {
    created_by: createdBy,
    subject: draft.subject,
    topic: draft.topic,
    difficulty: draft.difficulty,
    question_type: draft.type,
    question_text: draft.question,
    explanation: draft.explanation || null,
    image_url: draft.imageUrl,
    tags: draft.tags,
    marks: draft.marks,
    time_limit_seconds: draft.timeLimit,
  }
  const options = draft.options.map((option, position) => ({
    position,
    option_text: option.text,
    is_correct: option.correct,
  }))
  return { question, options }
}
