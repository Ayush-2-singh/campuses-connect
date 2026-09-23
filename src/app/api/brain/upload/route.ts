import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { requireAuthLite } from '@/lib/api/middleware'
import { chunkText, embedGemini, ocrImageViaGemini } from '@/lib/brain'
import { clearUserBrainCache } from '@/lib/brainCache'
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

  // Rate limit: max 5 uploads/hour per user
  const allowed = await checkRateLimit(userId, 'brain:upload', 5, 60)
  if (!allowed) {
    return NextResponse.json({ error: 'Upload limit reached. Please try again later.' }, { status: 429 })
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

  const supabase = await createClient()

  // 0. Content hash — the same bytes for the same user are processed exactly
  //    once. This is what keeps OCR and embedding cost bounded: re-uploading a
  //    file (or uploading it again under a different name) costs zero AI calls.
  //    Only a document that finished processing is reusable; a half-finished
  //    one is left to be retried rather than half-served.
  const contentHash = createHash('sha256').update(bytes).digest('hex')

  const { data: existing } = await supabase
    .from('brain_documents')
    .select('id, title, chunk_count')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .eq('processing_status', 'ready')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      {
        document: { id: existing.id, title: existing.title },
        chunkCount: existing.chunk_count ?? 0,
        deduplicated: true,
      },
      { status: 200 }
    )
  }

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

  // 3. Create the document row. It stays 'processing' until every chunk has
  //    landed, so a failed upload is never mistaken for a reusable document.
  const { data: doc, error: docErr } = await supabase
    .from('brain_documents')
    .insert({
      user_id: userId,
      title: fileName,
      file_type: ext,
      char_count: text.length,
      content_hash: contentHash,
      processing_status: 'processing',
    })
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
      const embeddings = await Promise.all(batch.map((c) => embedGemini(c, 'RETRIEVAL_DOCUMENT')))
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
    // Every chunk landed — flip the document to reusable, so the next upload
    // of these exact bytes short-circuits before any AI call.
    await supabase
      .from('brain_documents')
      .update({
        processing_status: 'ready',
        processed_at: new Date().toISOString(),
        chunk_count: inserted.length,
      })
      .eq('id', doc.id)

    // New knowledge landed — invalidate this user's cached answers
    clearUserBrainCache(userId)
  } catch (e: any) {
    clearUserBrainCache(userId)
    await supabase.from('brain_documents').delete().eq('id', doc.id)
    return NextResponse.json({ error: `Embedding failed: ${e.message}` }, { status: 502 })
  }

  return NextResponse.json(
    {
      document: { id: doc.id, title: doc.title },
      chunkCount: inserted.length,
    },
    { status: 201 }
  )
}
