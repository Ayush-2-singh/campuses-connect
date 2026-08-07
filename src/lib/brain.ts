/**
 * AI Brain — shared server helpers.
 * Ported from the ai-brain-test prototype:
 *   - chunking:   chunk.py (word-based with overlap)
 *   - embeddings: embed_store.py (Gemini text-embedding-001, 768 dims)
 *   - answering:  search.py (Groq llama-3.3-70b-versatile)
 *   - OCR:        replaces Tesseract with Gemini's native vision (better on handwriting)
 *   - memory:     memory_engine.py (Groq structured JSON extraction)
 *
 * All calls use plain fetch — no SDK dependencies.
 */

export const BRAIN_EMBED_MODEL = 'gemini-embedding-001'
export const BRAIN_OCR_MODEL = 'gemini-2.5-flash'
export const BRAIN_ANSWER_MODEL = 'gemini-2.5-flash'
export const BRAIN_GROQ_MODEL = 'llama-3.3-70b-versatile' // optional fallback

export const EMBED_DIMS = 768

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set. Add it to .env.local')
  return key
}

function groqKey(): string {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY is not set. Add it to .env.local')
  return key
}

/** Word-based chunking with overlap (port of chunk.py). */
export function chunkText(text: string, chunkSize = 300, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const chunks: string[] = []
  let start = 0
  while (start < words.length) {
    const end = start + chunkSize
    chunks.push(words.slice(start, end).join(' '))
    if (end >= words.length) break
    start = end - overlap
  }
  return chunks
}

/** Gemini embedding (text-embedding-001 → 768 floats). */
export async function embedGemini(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini embed failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  const values = json?.embedding?.values
  if (!Array.isArray(values)) throw new Error('Gemini embed returned no values')
  return values as number[]
}

/** OCR an image via Gemini's vision (better than Tesseract on handwriting). */
export async function ocrImageViaGemini(buffer: Buffer, mimeType: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_OCR_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: buffer.toString('base64') } },
              { text: 'Extract ALL the text from this image (handwritten or printed). Return only the extracted text, nothing else.' },
            ],
          },
        ],
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini OCR failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(' ')
  return (text || '').trim()
}

/**
 * Chat completion. Uses Gemini by default (Gemini 2.5 Flash shares the same
 * key as the embeddings — verified working). Groq is an OPT-IN alternative:
 * set BRAIN_LLM=groq AND a valid GROQ_API_KEY to use it.
 */
export async function completeText(systemPrompt: string, userMessage: string, opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}): Promise<string> {
  if (process.env.GROQ_API_KEY && process.env.BRAIN_LLM === 'groq') {
    const body: Record<string, unknown> = {
      model: BRAIN_GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 800,
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey()}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Groq failed (${res.status}): ${err.slice(0, 300)}`)
    }
    const json = await res.json()
    return json?.choices?.[0]?.message?.content ?? ''
  }

  // Gemini path
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 800,
  }
  if (opts.jsonMode) generationConfig.responseMimeType = 'application/json'

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_ANSWER_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini generate failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  return json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(' ')?.trim() ?? ''
}

/** Structured memory extraction (port of memory_engine.py SYSTEM_PROMPT). */
export async function extractMemoryViaGroq(question: string, answer: string): Promise<Record<string, unknown>> {
  const system = `You are an expert AI memory extractor. Analyze a study-session exchange between a student and an AI tutor, and extract structured memories.
Output ONLY valid JSON with exactly these keys:
- "knowledge_gained": what the student learned or studied
- "struggles_faced": what the student found difficult or frustrating
- "behavioral_lifestyle": behavioral data or habits mentioned and their likely impact
- "core_facts": permanent facts about the student (exams, university, goals)
- "is_core_memory": true only if the exchange contains major life events, permanent facts, or deep emotional struggles; otherwise false
No markdown, no explanations.`
  const exchange = `Student: ${question}\nAI Tutor: ${answer}`
  const raw = await completeText(system, `Extract the memories.\n\n${exchange}`, { jsonMode: true, temperature: 0.2 })
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    return {}
  } catch {
    return {}
  }
}

/** Build the RAG system prompt (port of main.py /chat). */
export function buildBrainPrompt(sources: { source: string; content: string }[], memories: any[], history: { role: string; content: string }[]): string {
  let p = 'You are an AI tutor powered by the student\'s own uploaded notes and memories. Be concise and practical. No fluff or motivational speeches unless asked.\n\n'
  p += 'Use RELEVANT UPLOADED KNOWLEDGE to answer when available. Use PAST MEMORIES for context about the student. If nothing relevant exists, say so honestly and answer from general knowledge.\n\n'
  if (history?.length) {
    p += 'CONVERSATION HISTORY:\n'
    for (const m of history.slice(-5)) p += `${m.role}: ${m.content}\n`
    p += '\n'
  }
  if (sources.length) {
    p += 'RELEVANT UPLOADED KNOWLEDGE:\n'
    for (const s of sources) p += `--- ${s.source} ---\n${s.content.slice(0, 900)}\n\n`
  }
  if (memories.length) {
    p += 'PAST MEMORIES ABOUT THIS STUDENT:\n'
    for (const m of memories) {
      if (m.knowledge_gained) p += `- Learned: ${m.knowledge_gained}\n`
      if (m.struggles_faced) p += `- Struggles: ${m.struggles_faced}\n`
      if (m.behavioral_lifestyle) p += `- Lifestyle: ${m.behavioral_lifestyle}\n`
    }
    p += '\n'
  }
  return p
}
