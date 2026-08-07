-- ============================================================
-- CampusConnect — AI Brain (personal academic intelligence)
-- Ported from the ai-brain-test prototype (RAG + memory engine).
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Vector support (Gemini text-embedding-001 = 768 dims)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documents (the files a student has uploaded)
CREATE TABLE IF NOT EXISTS public.brain_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  file_type   TEXT NOT NULL DEFAULT 'pdf',
  char_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Chunks (embedded pieces of those documents)
CREATE TABLE IF NOT EXISTS public.brain_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.brain_documents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  embedding    vector(768),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Memories (structured knowledge extracted from study sessions)
CREATE TABLE IF NOT EXISTS public.brain_memories (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_gained     TEXT,
  struggles_faced      TEXT,
  behavioral_lifestyle TEXT,
  core_facts           TEXT,
  is_core_memory       BOOLEAN NOT NULL DEFAULT FALSE,
  embedding            vector(768),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_chunks_user   ON public.brain_chunks (user_id);
CREATE INDEX IF NOT EXISTS idx_brain_docs_user     ON public.brain_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_brain_memories_user ON public.brain_memories (user_id);
-- HNSW index for fast vector search
CREATE INDEX IF NOT EXISTS idx_brain_chunks_embedding ON public.brain_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_brain_memories_embedding ON public.brain_memories
  USING hnsw (embedding vector_cosine_ops);

-- 5. RLS — every student only sees their own brain
ALTER TABLE public.brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_chunks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_memories  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_docs_select ON public.brain_documents;
CREATE POLICY brain_docs_select ON public.brain_documents
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS brain_docs_insert ON public.brain_documents;
CREATE POLICY brain_docs_insert ON public.brain_documents
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS brain_docs_delete ON public.brain_documents;
CREATE POLICY brain_docs_delete ON public.brain_documents
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS brain_chunks_select ON public.brain_chunks;
CREATE POLICY brain_chunks_select ON public.brain_chunks
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS brain_chunks_insert ON public.brain_chunks;
CREATE POLICY brain_chunks_insert ON public.brain_chunks
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS brain_chunks_delete ON public.brain_chunks;
CREATE POLICY brain_chunks_delete ON public.brain_chunks
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS brain_mem_select ON public.brain_memories;
CREATE POLICY brain_mem_select ON public.brain_memories
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS brain_mem_insert ON public.brain_memories;
CREATE POLICY brain_mem_insert ON public.brain_memories
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS brain_mem_delete ON public.brain_memories;
CREATE POLICY brain_mem_delete ON public.brain_memories
  FOR DELETE USING (user_id = auth.uid());

-- 6. Semantic search (SECURITY INVOKER → RLS scopes to the caller)
DROP FUNCTION IF EXISTS public.match_brain_chunks(vector, int, uuid);
CREATE OR REPLACE FUNCTION public.match_brain_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (chunk_id uuid, document_id uuid, content text, source text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.document_id, c.content, d.title,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.brain_chunks c
  JOIN public.brain_documents d ON d.id = c.document_id
  WHERE (filter_user_id IS NULL OR c.user_id = filter_user_id)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

DROP FUNCTION IF EXISTS public.match_brain_memories(vector, int, uuid);
CREATE OR REPLACE FUNCTION public.match_brain_memories(
  query_embedding vector(768),
  match_count int DEFAULT 3,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (memory_id uuid, knowledge_gained text, struggles_faced text,
               behavioral_lifestyle text, core_facts text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT m.id, m.knowledge_gained, m.struggles_faced, m.behavioral_lifestyle, m.core_facts,
         1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.brain_memories m
  WHERE (filter_user_id IS NULL OR m.user_id = filter_user_id)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_brain_chunks(vector, int, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_brain_memories(vector, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_brain_chunks(vector, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_brain_memories(vector, int, uuid) TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.brain_documents, public.brain_chunks, public.brain_memories TO authenticated;
