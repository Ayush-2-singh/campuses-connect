import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite, requirePremium } from '@/lib/api/middleware'
import { buildBrainPrompt, completeText, embedGemini } from '@/lib/brain'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// ── In-memory answer cache (resets on cold start, good enough for campus scale) ──
const answerCache = new Map<string, { answer: string; sources: any[]; ts: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function cacheKey(userId: string, question: string): string {
  return `${userId}:${question.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200)}`
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthLite()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  // Premium gate — AI Brain is a Pro feature
  const premium = await requirePremium(userId)
  if (!premium.ok) {
    return NextResponse.json({ error: premium.error }, { status: 403 })
  }

  // Paid-AI protection: max 20 questions/hour per user
  const rl = checkRateLimit(`ask:${userId}`, 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Question limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
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

  // Check answer cache first — saves Gemini API calls
  const ck = cacheKey(userId, question)
  const cached = answerCache.get(ck)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ answer: cached.answer, sources: cached.sources, usedMemory: false, cached: true })
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

  const sources = ((chunkMatches as any[]) || []).filter(m => (m.similarity ?? 0) > 0.3).map((m: any) => ({
    source: m.source,
    content: m.content,
    similarity: m.similarity,
  }))
  const memories = (memoryMatches as any[]) || []

  // 3. Build the RAG prompt and answer
  const systemPrompt = buildBrainPrompt(sources, memories, body.history || [])
  let answer = ''
  try {
    answer = await completeText(systemPrompt, question)
  } catch (e: any) {
    return NextResponse.json({ error: `Answer failed: ${e.message}` }, { status: 502 })
  }

  const sourceList = sources.map(s => ({ source: s.source, similarity: s.similarity }))

  // Cache the answer for future identical questions
  answerCache.set(ck, { answer, sources: sourceList, ts: Date.now() })
  // Prune stale entries (keep cache under 500)
  if (answerCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of answerCache) {
      if (now - v.ts > CACHE_TTL) answerCache.delete(k)
    }
  }

  return NextResponse.json({
    answer,
    sources: sourceList,
    usedMemory: memories.length > 0,
  })
}
