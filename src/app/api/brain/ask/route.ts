import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { buildBrainPrompt, completeText, embedGemini } from '@/lib/brain'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

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

  return NextResponse.json({
    answer,
    sources: sources.map(s => ({ source: s.source, similarity: s.similarity })),
    usedMemory: memories.length > 0,
  })
}
