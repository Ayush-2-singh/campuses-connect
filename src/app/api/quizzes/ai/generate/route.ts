import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite } from '@/lib/api/middleware'
import { checkRateLimit } from '@/lib/rateLimit'
import { serverError } from '@/lib/api/errors'
import { completeText, ocrImageViaGemini } from '@/lib/brain'
import { buildSystemPrompt, buildUserPrompt, clampCount, type QuizGenerationSpec } from '@/lib/quizzes/prompt'
import { extractJsonObject, toDraftPayload, validateGeneratedQuestions } from '@/lib/quizzes/validation'

/**
 * AI quiz drafting.
 *
 * Server-side only: the provider key never reaches the browser, the uploaded
 * or pasted content is treated as untrusted data, and nothing this route
 * returns is a published question. A draft is stored against a job and only
 * becomes question-bank rows when a human accepts specific indices through
 * `quiz_ai_job_accept`.
 */

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_SOURCE_CHARS = 20_000
const MAX_INSTRUCTIONS_CHARS = 500
const MAX_TOPIC_CHARS = 300
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg'])

type SourceKind = 'topic' | 'text' | 'pdf' | 'image'

function asSourceKind(value: unknown): SourceKind {
  return value === 'text' || value === 'pdf' || value === 'image' ? value : 'topic'
}

async function extractSource(
  kind: SourceKind,
  text: string,
  file: File | null
): Promise<{ content: string; truncated: boolean } | { error: string }> {
  let content = text.trim()

  if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return { error: 'File is too large (max 10 MB).' }
    }
    const extension = (file.name.split('.').pop() || '').toLowerCase()
    const bytes = Buffer.from(await file.arrayBuffer())

    try {
      if (kind === 'pdf' || extension === 'pdf') {
        const { extractText } = await import('unpdf')
        const { text: pdfText } = await extractText(new Uint8Array(bytes), { mergePages: true })
        content = pdfText || ''
      } else if (IMAGE_EXTENSIONS.has(extension)) {
        const mime = extension === 'png' ? 'image/png' : 'image/jpeg'
        content = await ocrImageViaGemini(bytes, mime)
      } else {
        content = bytes.toString('utf8')
      }
    } catch {
      return { error: 'Could not read that file. Try a text, PDF or image file.' }
    }
  }

  if (!content.trim()) {
    return { error: 'Add a topic or some source material first.' }
  }

  const truncated = content.length > MAX_SOURCE_CHARS
  return { content: truncated ? content.slice(0, MAX_SOURCE_CHARS) : content, truncated }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthLite()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  // Generation is the expensive path: cap it per user per hour.
  const allowed = await checkRateLimit(userId, 'quiz:ai:generate', 10, 60)
  if (!allowed) {
    return NextResponse.json({ error: 'Generation limit reached. Please try again later.' }, { status: 429 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const sourceKind = asSourceKind(form.get('sourceKind'))
  const subject =
    String(form.get('subject') ?? 'General')
      .trim()
      .slice(0, 60) || 'General'
  const topic = String(form.get('topic') ?? '')
    .trim()
    .slice(0, MAX_TOPIC_CHARS)
  const text = String(form.get('text') ?? '')
  const instructions = String(form.get('instructions') ?? '')
    .trim()
    .slice(0, MAX_INSTRUCTIONS_CHARS)
  const difficultyRaw = String(form.get('difficulty') ?? 'mixed')
  const difficulty =
    difficultyRaw === 'easy' || difficultyRaw === 'medium' || difficultyRaw === 'hard' ? difficultyRaw : 'mixed'
  const count = clampCount(form.get('count'))

  const fileEntry = form.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

  if (!topic && !text.trim() && !file) {
    return NextResponse.json({ error: 'Add a topic or some source material first.' }, { status: 400 })
  }

  const extracted = await extractSource(sourceKind, text, file)
  if ('error' in extracted) {
    return NextResponse.json({ error: extracted.error }, { status: 400 })
  }

  const spec: QuizGenerationSpec = {
    subject,
    topic,
    count,
    difficulty,
    instructions,
    sourceKind: file ? (sourceKind === 'topic' ? 'text' : sourceKind) : sourceKind,
  }

  // Identical input for the same user is served from the previous draft
  // instead of paying for another model call.
  const sourceHash = createHash('sha256')
    .update(
      [spec.subject, spec.topic, String(spec.count), spec.difficulty, spec.instructions, extracted.content].join('\n')
    )
    .digest('hex')

  const supabase = await createClient()

  const { data: previous } = await supabase
    .from('quiz_ai_jobs')
    .select('id, draft, status')
    .eq('user_id', userId)
    .eq('source_hash', sourceHash)
    .eq('status', 'review_ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previousQuestions = (previous?.draft as { questions?: unknown[] } | null)?.questions
  if (previous?.id && Array.isArray(previousQuestions) && previousQuestions.length > 0) {
    return NextResponse.json({
      ok: true,
      jobId: previous.id,
      status: 'review_ready',
      questions: previousQuestions,
      rejected: [],
      duplicates: 0,
      truncated: extracted.truncated,
      reused: true,
    })
  }

  const { accepted, rejected, duplicates } = validateGeneratedQuestions(
    await generateDraft(spec, extracted.content).catch(() => null),
    { maxQuestions: count }
  )

  const draftPayload = toDraftPayload(accepted)
  const save = await supabase
    .rpc('quiz_ai_job_create', {
      p_source_kind: spec.sourceKind,
      p_source_hash: sourceHash,
      p_spec: { ...spec },
      p_draft: accepted.length > 0 ? draftPayload : null,
      p_model: 'brain:auto',
      p_error: accepted.length > 0 ? null : 'no_valid_questions',
    })
    .then((result) => ({ data: result.data as Record<string, unknown> | null, error: result.error }))

  if (save.error) {
    return serverError('quizzes/ai/generate', save.error, 500)
  }

  const saved = save.data ?? {}
  if (saved.error === 'daily_limit') {
    return NextResponse.json({ error: 'Daily AI generation limit reached. Try again tomorrow.' }, { status: 429 })
  }

  return NextResponse.json({
    ok: saved.ok === true,
    jobId: saved.job_id ?? null,
    status: saved.status ?? 'failed',
    questions: accepted,
    rejected,
    duplicates,
    truncated: extracted.truncated,
    reused: false,
  })
}

/** One model call, JSON mode, strict parse. Returns null when unusable. */
async function generateDraft(spec: QuizGenerationSpec, source: string): Promise<unknown> {
  const raw = await completeText(buildSystemPrompt(), buildUserPrompt(spec, source), {
    temperature: 0.4,
    maxTokens: 3000,
    jsonMode: true,
  })
  return extractJsonObject(raw)
}
