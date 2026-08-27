import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite, requirePremium } from '@/lib/api/middleware'
import { chunkText, embedGemini, ocrImageViaGemini } from '@/lib/brain'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
const MAX_BYTES = 12 * 1024 * 1024 // 12 MB
const MAX_CHARS = 200_000 // cap extracted text so embedding stays cheap
const EMBED_BATCH_SIZE = 20 // Gemini supports up to 100 per call — 20 is a safe, fast batch

const TEXT_EXTS = new Set(['txt', 'md'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg'])

export async function POST(request: NextRequest) {
  const authResult = await requireAuthLite()
  if (!authResult.ok) return authResult.response
  const { userId } = authResult.auth

  // Premium gate — AI Brain is a Pro feature
  const premium = await requirePremium(userId)
  if (!premium.ok) {
    return NextResponse.json({ error: premium.error }, { status: 403 })
  }

  // Paid-AI protection: max 5 uploads/hour per user
  const rl = checkRateLimit(`upload:${userId}`, 5, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Upload limit reached. Try again in ~${rl.retryAfterSec}s.` }, { status: 429 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 12 MB).' }, { status: 400 })
  }

  const fileName = file.name || 'untitled'
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (!TEXT_EXTS.has(ext) && !IMAGE_EXTS.has(ext) && ext !== 'pdf') {
    return NextResponse.json({ error: 'Unsupported file type. Use PDF, TXT, MD, PNG or JPG.' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // 1. Extract text
  let text = ''
  try {
    if (ext === 'pdf') {
      const { extractText } = await import('unpdf')
      const { text: pdfText } = await extractText(new Uint8Array(bytes), { mergePages: true })
      text = pdfText || ''
    } else if (TEXT_EXTS.has(ext)) {
      text = bytes.toString('utf8')
    } else {
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
      text = await ocrImageViaGemini(bytes, mime)
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Could not read the file: ${e.message}` }, { status: 422 })
  }

  text = text.trim()
  if (!text) {
    return NextResponse.json({ error: 'No text could be extracted from this file.' }, { status: 422 })
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS)

  // 2. Chunk
  const chunks = chunkText(text)
  if (!chunks.length) {
    return NextResponse.json({ error: 'The file is empty.' }, { status: 422 })
  }

  const supabase = await createClient()

  // 3. Create the document row
  const { data: doc, error: docErr } = await supabase
    .from('brain_documents')
    .insert({ user_id: userId, title: fileName, file_type: ext, char_count: text.length })
    .select('id, title')
    .single()
  if (docErr || !doc) {
    return NextResponse.json({ error: 'Could not save the document.' }, { status: 500 })
  }

  // 4. Embed + store chunks (small batches). On failure, clean up the
  //    document row so nothing is orphaned.
  const inserted: { id: string; content: string }[] = []
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
      const embeddings = await Promise.all(batch.map(c => embedGemini(c, 'RETRIEVAL_DOCUMENT')))
      const rows = batch.map((c, j) => ({
        document_id: doc.id,
        user_id: userId,
        content: c,
        embedding: embeddings[j],
      }))
      const { data, error } = await supabase.from('brain_chunks').insert(rows).select('id, content')
      if (error) throw new Error(`Chunk insert failed: ${error.message}`)
      inserted.push(...(data || []))
    }
  } catch (e: any) {
    await supabase.from('brain_documents').delete().eq('id', doc.id)
    return NextResponse.json({ error: `Embedding failed: ${e.message}` }, { status: 502 })
  }

  return NextResponse.json({
    document: { id: doc.id, title: doc.title },
    chunkCount: inserted.length,
  }, { status: 201 })
}
