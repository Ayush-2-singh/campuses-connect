-- 20261140_code_sprint.sql
--
-- CODE SPRINT 60 — a timed typing mode over real code.
--
-- The existing typing battle is a 10-word race over a fixed 26-word pool, which
-- is memorisable and lasts ~10 seconds. This adds the mode the leaderboard was
-- missing: a fixed 60-second sprint over real code (pasted-free, server-seeded),
-- scored on net WPM with raw WPM and accuracy reported next to it.
--
-- Design notes:
--   • The corpus lives in `code_sprint_snippets`; the text a run types is
--     `code_sprint_text(seed)` — eight snippets picked by md5(seed || id) and
--     whitespace-normalised, so a 100 WPM player still has text at 60s.
--   • The seed defaults to the UTC day, so everyone who plays "today" types the
--     same text; a "beat my score" link carries its own seed.
--   • Submissions are validated, not trusted: the typed words must be an exact
--     prefix of the seeded text, the character counts are clamped to that
--     prefix, and anything above 220 net WPM is rejected as impossible.
--   • Only server-derived numbers are stored (net/raw WPM, accuracy). The
--     consistency figure is computed from the client's per-second samples and is
--     shown in the result only, never ranked.
--   • Best run of the day per player is kept (unique day+player), same shape as
--     the daily quick-math board.

CREATE TABLE IF NOT EXISTS public.code_sprint_snippets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  language    TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.code_sprint_snippets (slug, language, body) VALUES
  ('js-debounce', 'JavaScript',
   'const debounce = (fn, wait) => { let timer = null; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };'),
  ('js-fetch', 'JavaScript',
   'async function load(url) { const res = await fetch(url); if (!res.ok) throw new Error("bad response"); return res.json(); }'),
  ('js-reduce', 'JavaScript',
   'const total = items.reduce((acc, item) => acc + item.price * item.qty, 0);'),
  ('py-squares', 'Python',
   'def squares(n): return [x * x for x in range(n) if x % 2 == 0]'),
  ('py-memo', 'Python',
   'def memo(fn): cache = {}; def run(x): if x not in cache: cache[x] = fn(x); return cache[x]; return run'),
  ('c-sum', 'C',
   'for (int i = 0; i < n; i++) { if (arr[i] % 2 == 0) { sum += arr[i]; } }'),
  ('sql-count', 'SQL',
   'select u.name, count(*) as wins from users u join matches m on m.user_id = u.id group by u.name;'),
  ('py-split', 'Python',
   'words = line.strip().split(","); print(len(words), words[:3])')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.code_sprint_snippets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.code_sprint_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day           DATE NOT NULL DEFAULT CURRENT_DATE,
  player_key    TEXT NOT NULL,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nickname      TEXT NOT NULL DEFAULT '',
  seed          TEXT NOT NULL,
  net_wpm       NUMERIC(6,2) NOT NULL DEFAULT 0,
  raw_wpm       NUMERIC(6,2) NOT NULL DEFAULT 0,
  accuracy      NUMERIC(5,2) NOT NULL DEFAULT 0,
  correct_chars INT NOT NULL DEFAULT 0,
  typed_chars   INT NOT NULL DEFAULT 0,
  duration_ms   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day, player_key)
);

CREATE INDEX IF NOT EXISTS idx_code_sprint_day_board
  ON public.code_sprint_runs (day, net_wpm DESC, accuracy DESC);

ALTER TABLE public.code_sprint_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS code_sprint_runs_select ON public.code_sprint_runs;
CREATE POLICY code_sprint_runs_select ON public.code_sprint_runs
  FOR SELECT USING (true);

-- ── The seeded text ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.code_sprint_text(p_seed TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed TEXT := coalesce(nullif(btrim(p_seed), ''), 'day:' || CURRENT_DATE::TEXT);
  v_text TEXT;
  v_n    INT;
BEGIN
  SELECT string_agg(btrim(regexp_replace(s.body, '\s+', ' ', 'g')), ' ' ORDER BY s.ord),
         count(*)
  INTO v_text, v_n
  FROM (
    SELECT body, md5(v_seed || id::TEXT) AS ord
    FROM public.code_sprint_snippets
    WHERE is_active
    ORDER BY md5(v_seed || id::TEXT)
    LIMIT 8
  ) s;

  IF v_text IS NULL OR v_n = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'no_snippets');
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'seed', v_seed, 'snippets', v_n, 'text', v_text);
END $$;

REVOKE EXECUTE ON FUNCTION public.code_sprint_text(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.code_sprint_text(TEXT) TO anon, authenticated;

-- ── Submit a finished sprint ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_code_sprint(
  p_player_key   TEXT,
  p_nickname     TEXT,
  p_seed         TEXT,
  p_words        TEXT[],
  p_correct_chars INT,
  p_typed_chars  INT,
  p_duration_ms  INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key        TEXT := btrim(coalesce(p_player_key, ''));
  v_nick       TEXT := left(coalesce(nullif(btrim(p_nickname), ''), 'student'), 20);
  v_seed       TEXT;
  v_target     TEXT[];
  v_typed_n    INT;
  v_prefix     TEXT[];
  v_max_chars  INT;
  v_correct    INT;
  v_typed      INT;
  v_dur        INT;
  v_net        NUMERIC;
  v_raw        NUMERIC;
  v_acc        NUMERIC;
  v_best_net   NUMERIC;
  v_rank       INT;
BEGIN
  IF v_key = '' THEN
    RAISE EXCEPTION 'missing_player';
  END IF;

  IF p_words IS NULL OR coalesce(array_length(p_words, 1), 0) = 0 THEN
    RAISE EXCEPTION 'no_words';
  END IF;

  v_seed := coalesce(nullif(btrim(p_seed), ''), 'day:' || CURRENT_DATE::TEXT);
  v_target := string_to_array((public.code_sprint_text(v_seed) ->> 'text'), ' ');
  v_typed_n := array_length(p_words, 1);

  IF v_typed_n > coalesce(array_length(v_target, 1), 0) THEN
    RAISE EXCEPTION 'too_many_words';
  END IF;

  -- The typed sequence must be an exact prefix of the seeded text. A replayed
  -- or hand-written submission cannot pass this check.
  v_prefix := v_target[1:v_typed_n];
  IF v_prefix IS DISTINCT FROM p_words THEN
    RAISE EXCEPTION 'invalid_words';
  END IF;

  v_dur := least(greatest(coalesce(p_duration_ms, 0), 0), 180000);
  IF v_dur < 5000 THEN
    RAISE EXCEPTION 'impossible_time';
  END IF;

  SELECT coalesce(sum(length(w)), 0) + greatest(v_typed_n - 1, 0)
  INTO v_max_chars
  FROM unnest(p_words) AS w;

  v_correct := least(greatest(coalesce(p_correct_chars, 0), 0), greatest(v_max_chars, 0));
  v_typed   := greatest(v_correct, least(coalesce(p_typed_chars, 0), greatest(v_max_chars * 2, 1)));

  v_net := round(((v_correct::numeric / 5) / (v_dur::numeric / 60000))::numeric, 2);
  v_raw := round(((v_typed::numeric / 5) / (v_dur::numeric / 60000))::numeric, 2);
  v_acc := CASE WHEN v_typed = 0 THEN 0
                ELSE round((v_correct::numeric * 100) / v_typed, 2) END;

  -- 220 WPM net is beyond sustained human typing on any keyboard layout.
  IF v_net > 220 THEN
    RAISE EXCEPTION 'impossible_speed';
  END IF;

  INSERT INTO public.code_sprint_runs AS r
    (day, player_key, user_id, nickname, seed, net_wpm, raw_wpm, accuracy,
     correct_chars, typed_chars, duration_ms)
  VALUES
    (CURRENT_DATE, v_key, auth.uid(), v_nick, v_seed, v_net, v_raw, v_acc,
     v_correct, v_typed, v_dur)
  ON CONFLICT (day, player_key) DO UPDATE
    SET net_wpm       = EXCLUDED.net_wpm,
        raw_wpm       = EXCLUDED.raw_wpm,
        accuracy      = EXCLUDED.accuracy,
        correct_chars = EXCLUDED.correct_chars,
        typed_chars   = EXCLUDED.typed_chars,
        duration_ms   = EXCLUDED.duration_ms,
        nickname      = EXCLUDED.nickname,
        user_id       = COALESCE(EXCLUDED.user_id, r.user_id),
        updated_at    = now()
    WHERE EXCLUDED.net_wpm > r.net_wpm;

  SELECT net_wpm INTO v_best_net
  FROM public.code_sprint_runs
  WHERE day = CURRENT_DATE AND player_key = v_key;

  IF v_best_net IS NULL THEN
    v_best_net := v_net;
  END IF;

  SELECT count(*) + 1 INTO v_rank
  FROM public.code_sprint_runs
  WHERE day = CURRENT_DATE AND net_wpm > v_best_net;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'net_wpm', v_best_net,
    'run_net_wpm', v_net,
    'raw_wpm', v_raw,
    'accuracy', v_acc,
    'correct_chars', v_correct,
    'typed_chars', v_typed,
    'duration_ms', v_dur,
    'rank', v_rank,
    'is_best', v_net >= v_best_net
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_code_sprint(TEXT, TEXT, TEXT, TEXT[], INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_code_sprint(TEXT, TEXT, TEXT, TEXT[], INT, INT, INT) TO anon, authenticated;

-- ── Today's board ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.code_sprint_board(p_limit INT DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_rows  JSONB;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT r.nickname,
           r.net_wpm,
           r.raw_wpm,
           r.accuracy,
           r.duration_ms,
           (r.user_id IS NOT NULL AND r.user_id = auth.uid()) AS is_me
    FROM public.code_sprint_runs r
    WHERE r.day = CURRENT_DATE
    ORDER BY r.net_wpm DESC, r.accuracy DESC, r.updated_at ASC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'day', CURRENT_DATE, 'rows', v_rows);
END $$;

REVOKE EXECUTE ON FUNCTION public.code_sprint_board(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.code_sprint_board(INT) TO anon, authenticated;
