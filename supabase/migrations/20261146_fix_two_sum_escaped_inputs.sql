-- ============================================================
-- Fix escaped newlines in Two Sum's judge data
-- ============================================================
-- `two-sum` was seeded with literal "\n" (backslash + n) inside its public
-- example inputs and hidden test case inputs. The runner feeds those strings
-- to stdin verbatim, so every program saw one single line such as
-- `[2,7,11,15]\n9` — eval/parse failed and Run/Submit reported wrong answer or
-- runtime error no matter what the student wrote.
--
-- Postgres standard strings keep the backslash literal, so '\n' below is the
-- two-character sequence and E'\n' is the real newline we want to store.

UPDATE public.dsa_problems AS p
SET
  examples = COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN
            elem || jsonb_build_object(
              'input', replace(elem->>'input', '\n', E'\n'),
              'output', replace(elem->>'output', '\n', E'\n')
            )
          ELSE elem
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(p.examples) WITH ORDINALITY AS t(elem, ord)
    ),
    p.examples
  ),
  test_cases = COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN
            elem || jsonb_build_object(
              'input', replace(elem->>'input', '\n', E'\n'),
              'output', replace(elem->>'output', '\n', E'\n')
            )
          ELSE elem
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(p.test_cases) WITH ORDINALITY AS t(elem, ord)
    ),
    p.test_cases
  )
WHERE p.slug = 'two-sum'
  AND (
    position('\n' IN p.examples::text) > 0
    OR position('\n' IN p.test_cases::text) > 0
  );
