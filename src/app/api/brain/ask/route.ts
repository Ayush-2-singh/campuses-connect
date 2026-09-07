import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite } from '@/lib/api/middleware'
import { buildBrainPrompt, embedGemini, streamCompleteText } from '@/lib/brain'
import { brainCacheGet, brainCacheKey, brainCacheSet } from '@/lib/brainCache'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

function ndjson(lines: unknown[]): Response {
  const encoder = new TextEncoder()
  return new Response(encoder.encode(lines.map((l) => JSON.stringify(l) + '\n').join('')), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthLite()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  // Rate limit: max 20 questions/hour per user
  const allowed = await checkRateLimit(userId, 'brain:ask', 20, 60)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: { question?: string; history?: { role: string; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question = (body.question || '').trim()
  if (!question) return NextResponse.json({ error: 'question is required.' }, { status: 422 })
  if (question.length > 2000) return NextResponse.json({ error: 'Question is too long.' }, { status: 422 })

  const history = body.history || []

  // Check answer cache first — saves API calls (key now includes conversation history)
  const ck = brainCacheKey(userId, question, history)
  const cached = brainCacheGet(ck)
  if (cached) {
    return ndjson([{ type: 'meta', sources: cached.sources, usedMemory: false, cached: true, answer: cached.answer }])
  }

  const supabase = await createClient()

  // 1. Embed the question
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedGemini(question, 'RETRIEVAL_QUERY')
  } catch (e: any) {
    return NextResponse.json({ error: `Embedding failed: ${e.message}` }, { status: 502 })
  }

  // 2. Semantic search over the student's own brain
  const [{ data: chunkMatches }, { data: memoryMatches }] = await Promise.all([
    supabase.rpc('match_brain_chunks', { query_embedding: queryEmbedding, match_count: 5, filter_user_id: userId }),
    supabase.rpc('match_brain_memories', { query_embedding: queryEmbedding, match_count: 2, filter_user_id: userId }),
  ])

  const sources = ((chunkMatches as any[]) || [])
    .filter((m) => (m.similarity ?? 0) > 0.3)
    .map((m: any) => ({
      source: m.source,
      content: m.content,
      similarity: m.similarity,
    }))
  // Same similarity threshold as chunks so irrelevant memories don't pollute the prompt
  const memories = ((memoryMatches as any[]) || []).filter((m) => (m.similarity ?? 0) > 0.3)
  const usedMemory = memories.length > 0

  // 3. Build the RAG prompt and stream the answer
  const systemPrompt = buildBrainPrompt(sources, memories, history)
  const sourceList = sources.map((s) => ({ source: s.source, similarity: s.similarity }))
  const encoder = new TextEncoder()
  let full = ''

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        for await (const delta of streamCompleteText(systemPrompt, question, { maxTokens: 1200 })) {
          full += delta
          send({ type: 'delta', text: delta })
        }
        brainCacheSet(ck, { answer: full, sources: sourceList })
        send({ type: 'meta', sources: sourceList, usedMemory })
      } catch (e: any) {
        send({ type: 'error', error: (e && e.message) || 'Answer generation failed.' })
      } finally {
        controller.close()
      }
    },
    cancel() {},
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
