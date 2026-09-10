/**
 * AI Brain — shared server helpers.
 * Ported from the ai-brain-test prototype:
 *   - chunking:   chunk.py (word-based with overlap)
 *   - embeddings: embed_store.py (Gemini text-embedding-001, 768 dims)
 *   - answering:  search.py (Gemini 2.5 Flash; Groq/OpenRouter fallbacks)
 *   - OCR:        replaces Tesseract with Gemini's native vision (better on handwriting)
 *   - memory:     memory_engine.py (structured JSON extraction)
 *
 * All calls use plain fetch — no SDK dependencies.
 */

export const BRAIN_EMBED_MODEL = 'gemini-embedding-001'
export const BRAIN_OCR_MODEL = 'gemini-2.5-flash'
export const BRAIN_ANSWER_MODEL = 'gemini-2.5-flash'
export const BRAIN_GROQ_MODEL = 'llama-3.3-70b-versatile' // optional fallback
export const BRAIN_OPENROUTER_MODEL = 'x-ai/grok-3-mini:free' // Grok free via OpenRouter

export const EMBED_DIMS = 768

const DEFAULT_TIMEOUT_MS = 60_000
const STREAM_TIMEOUT_MS = 120_000

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

function openrouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set. Add it to .env.local')
  return key
}

/** fetch with an AbortController timeout so a hung provider can't stall a request forever. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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

/**
 * Gemini embedding (text-embedding-001).
 * IMPORTANT: gemini-embedding-001 defaults to 3072 dimensions. We store
 * vector(768) in Postgres, so outputDimensionality MUST be pinned to 768 or
 * every insert/search fails with a dimension mismatch.
 */
export async function embedGemini(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIMS,
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
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_OCR_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: buffer.toString('base64') } },
              {
                text: 'Extract ALL the text from this image (handwritten or printed). Return only the extracted text, nothing else.',
              },
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

export type BrainProvider = 'gemini' | 'openrouter' | 'groq'

/**
 * Provider priority for chat completion:
 *   1. Gemini — reliable, generous free tier (primary)
 *   2. OpenRouter / Grok (free) — when OPENROUTER_API_KEY is set
 *   3. Groq — when GROQ_API_KEY is set AND BRAIN_LLM=groq
 */
function providerOrder(): BrainProvider[] {
  const order: BrainProvider[] = ['gemini']
  if (process.env.OPENROUTER_API_KEY) order.push('openrouter')
  if (process.env.GROQ_API_KEY && process.env.BRAIN_LLM === 'groq') order.push('groq')
  return order
}

async function completeFromGemini(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 1200,
  }
  if (opts.jsonMode) generationConfig.responseMimeType = 'application/json'

  const res = await fetchWithTimeout(
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
  return (
    json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .join(' ')
      ?.trim() ?? ''
  )
}

async function completeFromOpenRouter(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<string> {
  const body: Record<string, unknown> = {
    model: BRAIN_OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1200,
  }
  if (opts.jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey()}`,
      'HTTP-Referer': 'https://www.connecttocampus.com',
      'X-Title': 'ConnectToCampus',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`OpenRouter/Grok failed (${res.status}): ${err.slice(0, 300)}`)
  }
  const json = await res.json()
  return json?.choices?.[0]?.message?.content ?? ''
}

async function completeFromGroq(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<string> {
  const body: Record<string, unknown> = {
    model: BRAIN_GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1200,
  }
  if (opts.jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
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

/** One-shot chat completion with automatic provider fallback. */
export async function completeText(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
): Promise<string> {
  let lastErr: unknown
  for (const name of providerOrder()) {
    try {
      switch (name) {
        case 'gemini':
          return await completeFromGemini(systemPrompt, userMessage, opts)
        case 'openrouter':
          return await completeFromOpenRouter(systemPrompt, userMessage, opts)
        case 'groq':
          return await completeFromGroq(systemPrompt, userMessage, opts)
      }
    } catch (e) {
      lastErr = e
      console.warn(`[brain] ${name} failed, trying next provider:`, (e as Error).message)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All LLM providers failed.')
}

/** Parse Server-Sent Events from a streaming `Response` and yield parsed JSON chunks. */
async function* sseJson(res: Response): AsyncGenerator<any> {
  if (!res.body) throw new Error('No response body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          yield JSON.parse(payload)
        } catch {
          /* skip malformed SSE line */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function* streamFromGemini(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 1200,
  }
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${BRAIN_ANSWER_MODEL}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig,
      }),
    },
    STREAM_TIMEOUT_MS
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini generate failed (${res.status}): ${body.slice(0, 300)}`)
  }
  for await (const chunk of sseJson(res)) {
    for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
      if (typeof p?.text === 'string' && p.text) yield p.text
    }
  }
}

/** Shared streaming for OpenRouter and Groq (both OpenAI-compatible). */
async function* streamFromOpenAICompat(
  baseUrl: string,
  model: string,
  key: string,
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        stream: true,
      }),
    },
    STREAM_TIMEOUT_MS
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${model} failed (${res.status}): ${body.slice(0, 300)}`)
  }
  for await (const chunk of sseJson(res)) {
    const delta = chunk?.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) yield delta
  }
}

function streamFromProvider(
  name: BrainProvider,
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  switch (name) {
    case 'gemini':
      return streamFromGemini(systemPrompt, userMessage, opts)
    case 'openrouter':
      return streamFromOpenAICompat(
        'https://openrouter.ai/api/v1',
        BRAIN_OPENROUTER_MODEL,
        openrouterKey(),
        systemPrompt,
        userMessage,
        opts
      )
    case 'groq':
      return streamFromOpenAICompat(
        'https://api.groq.com/openai/v1',
        BRAIN_GROQ_MODEL,
        groqKey(),
        systemPrompt,
        userMessage,
        opts
      )
  }
}

/**
 * Token-streaming chat completion with provider fallback.
 * Falls back to the next provider ONLY if a provider throws before its first
 * token — once text is flowing, a mid-stream error propagates (re-yielding from
 * scratch would duplicate tokens).
 */
export async function* streamCompleteText(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string> {
  let lastErr: unknown
  for (const name of providerOrder()) {
    let yielded = false
    try {
      for await (const delta of streamFromProvider(name, systemPrompt, userMessage, opts)) {
        yielded = true
        yield delta
      }
      return
    } catch (e) {
      if (yielded) throw e
      lastErr = e
      console.warn(`[brain] ${name} streaming failed, trying next:`, (e as Error).message)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All LLM providers failed.')
}

/**
 * Parse JSON that may be wrapped in markdown fences or have stray leading
 * text — LLMs frequently wrap jsonMode output even when told not to.
 */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fence ? fence[1] : s).trim()
  for (const attempt of [candidate, candidate.slice(candidate.indexOf('{'))]) {
    if (attempt && attempt.startsWith('{')) {
      try {
        const obj = JSON.parse(attempt)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj
      } catch {
        /* fall through to next attempt */
      }
    }
  }
  return null
}

/** Structured memory extraction (port of memory_engine.py SYSTEM_PROMPT). */
export async function extractMemory(question: string, answer: string): Promise<Record<string, unknown>> {
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
  return parseJsonLoose(raw) ?? {}
}

/** Build the RAG system prompt (port of main.py /chat). */
export function buildBrainPrompt(
  sources: { source: string; content: string }[],
  memories: any[],
  history: { role: string; content: string }[]
): string {
  let p =
    "You are an AI tutor powered by the student's own uploaded notes and memories. Be concise and practical. No fluff or motivational speeches unless asked.\n\n"
  p +=
    'Use RELEVANT UPLOADED KNOWLEDGE to answer when available. Use PAST MEMORIES for context about the student. If nothing relevant exists, say so honestly and answer from general knowledge.\n\n'
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
