import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/middleware'
import { completeText } from '@/lib/brain'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const SYSTEM_PROMPT = `You are ConnectMyCampus's AI study assistant for a college community.
A student asked a question about their academics, and below is the campus notes catalog (title, subject, semester, description).
Answer the student's question clearly and concisely. When notes in the catalog are relevant, USE them and cite their exact titles as sources.
If nothing in the catalog is relevant, answer honestly from general knowledge and return an empty sources array.

Output ONLY valid JSON with exactly these keys:
- "answer": a concise, friendly answer (under 180 words)
- "sources": array of exact note titles from the catalog that support the answer (empty if none fit)
No markdown, no explanations.`

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  const rl = checkRateLimit(`notes-ask:${userId}`, 15, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Ask limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
  }

  let body: { question?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question = (body.question || '').trim()
  if (!question) return NextResponse.json({ error: 'question is required.' }, { status: 422 })
  if (question.length > 500) return NextResponse.json({ error: 'Question is too long.' }, { status: 422 })

  const supabase = await createClient()
  const { data: notes } = await supabase
    .from('notes')
    .select('id, title, subject, semester, description')
    .order('created_at', { ascending: false })
    .limit(200)

  const catalog = (notes || [])
    .map(n => {
      const parts = [`"${n.title}"`, n.subject || 'General']
      if (n.semester) parts.push(`Sem ${n.semester}`)
      if (n.description) parts.push(String(n.description).slice(0, 120))
      return `- ${parts.join(' | ')}`
    })
    .join('\n')

  let answer = ''
  let sources: string[] = []
  try {
    const raw = await completeText(SYSTEM_PROMPT, `QUESTION:\n${question}\n\nNOTES CATALOG:\n${catalog}\n\nJSON:`, {
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 600,
    })
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      answer = String(parsed.answer || '').trim()
      sources = Array.isArray(parsed.sources) ? parsed.sources.map(String).filter(Boolean).slice(0, 5) : []
    }
  } catch {
    // Gemini unavailable → fall through to keyword matching
  }

  if (!answer) {
    const terms = question.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 6)
    const hits = (notes || []).filter(n => terms.some(t => `${n.title} ${n.subject}`.toLowerCase().includes(t))).slice(0, 5)
    answer = 'I could not pull a full AI answer right now. Here are the closest notes from the library — try one of the sources below, or rephrase your question.'
    sources = hits.map(n => n.title)
  }

  return NextResponse.json({ answer, sources })
}
