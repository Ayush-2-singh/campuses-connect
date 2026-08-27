import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite, requirePremium } from '@/lib/api/middleware'
import { embedGemini, extractMemoryViaGroq } from '@/lib/brain'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authResult = await requireAuthLite()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  // Premium gate — AI Brain is a Pro feature
  const premium = await requirePremium(userId)
  if (!premium.ok) {
    return NextResponse.json({ error: premium.error }, { status: 403 })
  }

  // Paid-AI protection: max 20 saves/hour per user
  const rl = checkRateLimit(`memorize:${userId}`, 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Save limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
  }

  let body: { question?: string; answer?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question = (body.question || '').trim()
  const answer = (body.answer || '').trim()
  if (!question || !answer) {
    return NextResponse.json({ error: 'question and answer are required.' }, { status: 422 })
  }

  // 1. Extract structured memory via Groq (port of memory_engine.py)
  const memory = await extractMemoryViaGroq(question, answer)
  const combined = [
    memory.knowledge_gained,
    memory.struggles_faced,
    memory.behavioral_lifestyle,
    memory.core_facts,
  ].filter(Boolean).join('\n')

  if (!combined) {
    return NextResponse.json({ error: 'Nothing meaningful to remember.' }, { status: 422 })
  }

  // 2. Embed so the brain can recall it later
  let embedding: number[]
  try {
    embedding = await embedGemini(combined, 'RETRIEVAL_DOCUMENT')
  } catch (e: any) {
    return NextResponse.json({ error: `Embedding failed: ${e.message}` }, { status: 502 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brain_memories')
    .insert({
      user_id: userId,
      knowledge_gained: String(memory.knowledge_gained || '').slice(0, 2000),
      struggles_faced: String(memory.struggles_faced || '').slice(0, 2000),
      behavioral_lifestyle: String(memory.behavioral_lifestyle || '').slice(0, 2000),
      core_facts: String(memory.core_facts || '').slice(0, 2000),
      is_core_memory: String(memory.is_core_memory).toLowerCase() === 'true',
      embedding,
    })
    .select('id, knowledge_gained, is_core_memory')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Could not save the memory.' }, { status: 500 })
  }
  return NextResponse.json({ memory: data }, { status: 201 })
}
