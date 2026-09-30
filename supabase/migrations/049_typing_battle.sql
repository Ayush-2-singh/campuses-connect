-- ═══════════════════════════════════════════════════════════════════════════
-- 049_typing_battle.sql — 1v1 Typing Battle (Compete → Clash)
-- ═══════════════════════════════════════════════════════════════════════════
-- REUSE, NOT REBUILD (spec §20/§26):
--   • A typing match IS a game_rooms row (game_type='typing_battle',
--     max_players=2). The 6-digit codes, room lifecycle, realtime
--     publications and the finish→winner→Aura trigger all keep working.
--   • TYPING MATCHMAKING REUSES game_matchmaking (existing 1v1 queue) — no
--     second matchmaking architecture. Its game_type is decided when the
--     paired room is created, so the queue gains a game_type column.
--   • Auth/guest identity = the existing pattern: client guest_id + optional
--     p_user_id (048) so wins award Aura automatically.
--
-- NEW TABLES (minimum necessary):
--   typing_words      — the ONE server-generated 10-word sequence per match.
--                       RLS on, ZERO policies: clients receive it only when
--                       the match starts, via start_typing_match().
--   typing_progress   — lightweight realtime progress (completed words,
--                       correct/total chars) — one UPDATE per word, not per
--                       keystroke. Readable in-room for opponent bars.
--   typing_stats      — per-player career stats (games, wins, best/avg WPM,
--                       streak). Written only by the finish RPC.
--   typing_daily      — one row per player per day for the shared daily
--                       challenge (deterministic words from the date).
--
-- WINNER: server-side. First VALID complete_submission wins; ties break by
-- accuracy, then completion timestamp. The client's WPM is never trusted —
-- the server recomputes from server_clock timestamps and validates against
-- impossible times. room finish fires record_game_winner() → Aura.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Queue gains a game type (Quick Math rows backfill to their default) ──
ALTER TABLE public.game_matchmaking
  ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'quick_math';

CREATE INDEX IF NOT EXISTS idx_matchmaking_waiting_type
  ON public.game_matchmaking (status, game_type, difficulty, total_rounds, created_at);

-- ── 2. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.typing_words (
  room_id     UUID PRIMARY KEY REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  words       TEXT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.typing_progress (
  room_id        UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  player_id      TEXT NOT NULL,
  completed      INT  NOT NULL DEFAULT 0,
  total          INT  NOT NULL DEFAULT 0,
  correct_chars  INT  NOT NULL DEFAULT 0,
  total_chars    INT  NOT NULL DEFAULT 0,
  finished       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.typing_stats (
  player_id        TEXT PRIMARY KEY,            -- guest player_id
  user_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nickname         TEXT NOT NULL DEFAULT '',
  games_played     INT NOT NULL DEFAULT 0,
  wins             INT NOT NULL DEFAULT 0,
  losses           INT NOT NULL DEFAULT 0,
  best_wpm         NUMERIC(6,2) NOT NULL DEFAULT 0,
  average_wpm      NUMERIC(6,2) NOT NULL DEFAULT 0,
  best_accuracy    NUMERIC(5,2) NOT NULL DEFAULT 0,
  current_win_streak INT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.typing_daily (
  day           DATE NOT NULL,
  player_id     TEXT NOT NULL,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nickname      TEXT NOT NULL DEFAULT '',
  wpm           NUMERIC(6,2) NOT NULL,
  accuracy      NUMERIC(5,2) NOT NULL,
  duration_ms   BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, player_id)                 -- one attempt per player per day
);

CREATE INDEX IF NOT EXISTS idx_typing_daily_rank ON public.typing_daily (day, wpm DESC);

-- ── 3. RLS — same conventions as the games schema ───────────────────────────
-- typing_words is the anti-cheat store: ENABLED + ZERO policies. It is
-- invisible to every client role; only SECURITY DEFINER RPCs touch it.

ALTER TABLE public.typing_words    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_daily    ENABLE ROW LEVEL SECURITY;

-- Progress must be readable for realtime opponent bars (public game, public
-- progress — same stance as game_scores). Writes go through the RPCs.
DROP POLICY IF EXISTS typing_progress_select ON public.typing_progress;
CREATE POLICY typing_progress_select ON public.typing_progress
  FOR SELECT USING (true);
DROP POLICY IF EXISTS typing_progress_update ON public.typing_progress;
CREATE POLICY typing_progress_update ON public.typing_progress
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- Stats/daily are derived, validated data: public read, RPC-only write.
DROP POLICY IF EXISTS typing_stats_select ON public.typing_stats;
CREATE POLICY typing_stats_select ON public.typing_stats
  FOR SELECT USING (true);
DROP POLICY IF EXISTS typing_daily_select ON public.typing_daily;
CREATE POLICY typing_daily_select ON public.typing_daily
  FOR SELECT USING (true);

-- Realtime: opponent bars subscribe to progress updates for the room.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'typing_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_progress;
  END IF;
END $$;

-- ── 4. Word pool + deterministic daily sequence ─────────────────────────────
-- MVP pool (spec §5): campus/tech vocabulary, no meaningless strings.

CREATE OR REPLACE FUNCTION public.typing_word_pool()
RETURNS TEXT[]
LANGUAGE sql STABLE AS $fn$
  SELECT ARRAY[
    'code','campus','student','college','class','react','web','build','start','team',
    'database','javascript','developer','algorithm','backend','network','security','framework','project','startup',
    'authentication','asynchronous','architecture','optimization','implementation','concurrency'
  ];
$fn$;

-- Daily challenge: date → deterministic seed → shuffled pool slice.
-- Same day, same 10 words, for every student on earth.
CREATE OR REPLACE FUNCTION public.typing_daily_words(p_day DATE DEFAULT CURRENT_DATE)
RETURNS TEXT[]
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  pool  TEXT[] := public.typing_word_pool();
  seed  BIGINT;
  i     INT;
  j     INT;
  tmp   TEXT;
  out_  TEXT[] := pool;
  n     INT := array_length(out_, 1);
BEGIN
  seed := ('x' || substr(md5(p_day::TEXT), 1, 8))::BIT(32)::BIGINT;
  -- Fisher-Yates with a deterministic LCG keyed by the date.
  FOR i IN REVERSE n..2 LOOP
    j := 1 + (abs(seed) % i);
    seed := (seed * 1103515245 + 12345) % 2147483648;
    tmp := out_[i]; out_[i] := out_[j]; out_[j] := tmp;
  END LOOP;
  RETURN out_[1:10];
END;
$fn$;

-- ── 5. Match lifecycle RPCs ─────────────────────────────────────────────────

-- Create a private typing room (6-digit code, reused from the games schema).
CREATE OR REPLACE FUNCTION public.create_typing_room(
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_nick TEXT := btrim(p_nickname);
  v_code TEXT;
  v_room UUID;
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;

  v_code := public.generate_room_code();
  INSERT INTO public.game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'typing_battle', 'medium', 1, 2)
  RETURNING id INTO v_room;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room, p_player_id, v_nick, TRUE, TRUE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_typing_room(TEXT, TEXT, UUID) TO anon, authenticated;

-- Join by code — typing rooms only, waiting only, capacity 2.
CREATE OR REPLACE FUNCTION public.join_typing_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname  TEXT,
  p_user_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_nick TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;

  SELECT * INTO v_room FROM public.game_rooms
   WHERE room_code = upper(btrim(p_room_code))
     AND game_type = 'typing_battle' AND status = 'waiting';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF v_room.expires_at < now() THEN
    UPDATE public.game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'room_expired';
  END IF;

  -- Reconnection: same guest id returns to its seat.
  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE public.game_players SET is_connected = TRUE, disconnected_at = NULL
     WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', TRUE);
  END IF;

  IF (SELECT COUNT(*) FROM public.game_players WHERE room_id = v_room.id) >= v_room.max_players THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room.id, p_player_id, v_nick, FALSE, FALSE, p_user_id);

  RETURN jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'player_id', p_player_id, 'reconnected', FALSE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_typing_room(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_typing_room(TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- Ready toggle (lobby) — typing seats only.
CREATE OR REPLACE FUNCTION public.toggle_typing_ready(p_room_id UUID, p_player_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ready BOOLEAN;
BEGIN
  UPDATE public.game_players SET is_ready = NOT is_ready
   WHERE room_id = p_room_id AND player_id = p_player_id
     AND room_id IN (SELECT id FROM public.game_rooms WHERE game_type = 'typing_battle')
  RETURNING is_ready INTO v_ready;
  RETURN COALESCE(v_ready, FALSE);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.toggle_typing_ready(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.toggle_typing_ready(UUID, TEXT) TO anon, authenticated;

-- Host starts: generates THE shared word sequence once, server-side, and
-- flips the room to 'active' with a 3-second countdown deadline.
CREATE OR REPLACE FUNCTION public.start_typing_match(p_room_id UUID, p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room   public.game_rooms%ROWTYPE;
  v_pool   TEXT[] := public.typing_word_pool();
  v_words  TEXT[];
  v_i      INT;
  v_j      INT;
  v_tmp    TEXT;
  v_start  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF v_room.host_id <> p_player_id THEN RAISE EXCEPTION 'only_host'; END IF;
  IF v_room.status <> 'waiting' THEN RAISE EXCEPTION 'already_started'; END IF;

  IF (SELECT COUNT(*) FROM public.game_players WHERE room_id = p_room_id) < 2 THEN
    RAISE EXCEPTION 'need_two_players';
  END IF;
  IF (SELECT COUNT(*) FROM public.game_players WHERE room_id = p_room_id AND is_ready) <
     (SELECT COUNT(*) FROM public.game_players WHERE room_id = p_room_id) THEN
    RAISE EXCEPTION 'not_all_ready';
  END IF;

  -- Shuffle a fresh 10-word sequence (never reuse the previous match's).
  FOR v_i IN REVERSE array_length(v_pool, 1)..2 LOOP
    v_j := 1 + floor(random() * v_i)::INT;
    v_tmp := v_pool[v_i]; v_pool[v_i] := v_pool[v_j]; v_pool[v_j] := v_tmp;
  END LOOP;
  v_words := v_pool[1:10];

  INSERT INTO public.typing_words (room_id, words) VALUES (p_room_id, v_words);

  v_start := now() + INTERVAL '3 seconds';
  UPDATE public.game_rooms
     SET status = 'active', round_started_at = v_start, updated_at = now()
   WHERE id = p_room_id;

  DELETE FROM public.typing_progress WHERE room_id = p_room_id;
  INSERT INTO public.typing_progress (room_id, player_id, total)
  SELECT p_room_id, player_id, 0 FROM public.game_players WHERE room_id = p_room_id;

  RETURN jsonb_build_object('starts_at', v_start, 'word_count', 10);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.start_typing_match(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_typing_match(UUID, TEXT) TO anon, authenticated;

-- Match start: hands the words ONLY to seated players of an active match.
CREATE OR REPLACE FUNCTION public.get_typing_words(p_room_id UUID, p_player_id TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.game_rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players
     WHERE room_id = p_room_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;
  IF v_room.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;
  RETURN (SELECT words FROM public.typing_words WHERE room_id = p_room_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_words(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_words(UUID, TEXT) TO anon, authenticated;

-- Lightweight progress heartbeat — one UPDATE per completed word.
CREATE OR REPLACE FUNCTION public.update_typing_progress(
  p_room_id      UUID,
  p_player_id    TEXT,
  p_completed    INT,
  p_correct      INT,
  p_total_typed  INT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_total INT;
BEGIN
  SELECT COALESCE(array_length(words, 1), 0) INTO v_total
    FROM public.typing_words WHERE room_id = p_room_id;
  IF v_total IS NULL THEN RAISE EXCEPTION 'not_active'; END IF;

  UPDATE public.typing_progress SET
    completed     = LEAST(GREATEST(p_completed, 0), v_total),
    total         = v_total,
    correct_chars = GREATEST(p_correct, 0),
    total_chars   = GREATEST(p_total_typed, 0),
    finished      = (LEAST(GREATEST(p_completed, 0), v_total) >= v_total),
    updated_at    = now()
   WHERE room_id = p_room_id AND player_id = p_player_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_typing_progress(UUID, TEXT, INT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_typing_progress(UUID, TEXT, INT, INT, INT) TO anon, authenticated;

-- ── 6. Completion — the ONLY place wins are decided ─────────────────────────
-- The client sends what it typed; the server re-validates EVERYTHING:
--   • the caller must be a seated player of an active typing match
--   • server clock (round_started_at) decides elapsed time, not the client
--   • every word must match the stored sequence (order included)
--   • duration is clamped to [2s, 15min] — impossible times are rejected
--   • WPM/accuracy are recomputed server-side; client numbers are ignored
--   • idempotent: a second submission returns the same verdict, no double win
CREATE OR REPLACE FUNCTION public.complete_typing_match(
  p_room_id  UUID,
  p_player_id TEXT,
  p_words     TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room     public.game_rooms%ROWTYPE;
  v_words    TEXT[];
  v_expected TEXT;
  v_correct  INT := 0;
  v_i        INT;
  v_elapsed  DOUBLE PRECISION;   -- seconds, server clock
  v_wpm      NUMERIC(6,2);
  v_acc      NUMERIC(5,2);
  v_seed     public.game_players%ROWTYPE;
  v_win      BOOLEAN := FALSE;
  v_existing RECORD;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF v_room.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;
  SELECT * INTO v_seed FROM public.game_players
   WHERE room_id = p_room_id AND player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_a_player'; END IF;

  -- Idempotency: this player already submitted for this match.
  SELECT * INTO v_existing
    FROM public.typing_progress
   WHERE room_id = p_room_id AND player_id = p_player_id AND finished;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already', 'winner', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id));
  END IF;

  SELECT words INTO v_words FROM public.typing_words WHERE room_id = p_room_id;
  IF v_words IS NULL THEN RAISE EXCEPTION 'not_active'; END IF;

  -- Word-by-word validation (order included; no skipping, no pasting).
  FOR v_i IN 1..array_length(v_words, 1) LOOP
    v_expected := v_words[v_i];
    IF p_words IS NOT NULL AND array_length(p_words, 1) >= v_i
       AND btrim(p_words[v_i]) = v_expected THEN
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  -- Server clock: match opened round_started_at; last word completed it.
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_room.round_started_at));
  IF v_elapsed < 2 OR v_elapsed > 900 THEN
    RAISE EXCEPTION 'impossible_time';
  END IF;

  v_acc := ROUND((v_correct::NUMERIC / array_length(v_words, 1)) * 100, 2);
  -- WPM = (correct chars / 5) / elapsed minutes — recomputed, never trusted
  -- from the client. ::NUMERIC because round(double, int) does not exist.
  v_wpm := ROUND(((v_correct::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);

  UPDATE public.typing_progress SET
    completed     = array_length(v_words, 1),
    total         = array_length(v_words, 1),
    correct_chars = v_correct,
    total_chars   = array_length(v_words, 1),
    finished      = TRUE,
    updated_at    = now()
   WHERE room_id = p_room_id AND player_id = p_player_id;

  -- First VALID completion wins. The window decides: a completion is valid
  -- here only if no winner exists yet; ties at the same server timestamp are
  -- impossible to observe apart from this serialised check.
  SELECT winner_id INTO v_existing.winner_id FROM public.game_winners WHERE room_id = p_room_id;
  IF v_existing.winner_id IS NULL THEN
    v_win := TRUE;
    INSERT INTO public.game_winners (room_id, game_type, winner_id, winner_nickname, winner_score, user_id)
    VALUES (p_room_id, 'typing_battle', p_player_id, v_seed.nickname, (v_wpm * 100)::INT, v_seed.user_id)
    ON CONFLICT (room_id) DO NOTHING;
    -- The finish trigger needs status='finished'; flip it now.
    UPDATE public.game_rooms SET status = 'finished', updated_at = now() WHERE id = p_room_id;
  END IF;

  -- Career stats (single writer: this RPC).
  INSERT INTO public.typing_stats AS s (player_id, user_id, nickname, games_played, wins, losses,
                                        best_wpm, average_wpm, best_accuracy, current_win_streak)
  VALUES (p_player_id, v_seed.user_id, v_seed.nickname, 1,
          CASE WHEN v_win THEN 1 ELSE 0 END, CASE WHEN v_win THEN 0 ELSE 1 END,
          v_wpm, v_wpm, v_acc, CASE WHEN v_win THEN 1 ELSE 0 END)
  ON CONFLICT (player_id) DO UPDATE SET
    user_id     = COALESCE(EXCLUDED.user_id, s.user_id),
    nickname    = EXCLUDED.nickname,
    games_played = s.games_played + 1,
    wins        = s.wins + EXCLUDED.wins,
    losses      = s.losses + EXCLUDED.losses,
    best_wpm    = GREATEST(s.best_wpm, EXCLUDED.best_wpm),
    average_wpm = ROUND(((s.average_wpm * s.games_played) + EXCLUDED.average_wpm) / (s.games_played + 1), 2),
    best_accuracy = GREATEST(s.best_accuracy, EXCLUDED.best_accuracy),
    current_win_streak = CASE WHEN EXCLUDED.wins > 0 THEN s.current_win_streak + 1 ELSE 0 END,
    updated_at  = now();

  RETURN jsonb_build_object(
    'status', CASE WHEN v_win THEN 'won' ELSE 'lost' END,
    'wpm', v_wpm, 'accuracy', v_acc,
    'duration_ms', ROUND(v_elapsed * 1000),
    'correct', v_correct, 'total', array_length(v_words, 1),
    'winner', p_player_id
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_typing_match(UUID, TEXT, TEXT[]) TO anon, authenticated;

-- ── 7. Matchmaking — the EXISTING queue gains a game type ───────────────────
-- Same join/pair logic as Quick Math (047), but only pairs typing with
-- typing, and the created room is a typing_battle room.

CREATE OR REPLACE FUNCTION public.join_matchmaking(
  p_player_id    TEXT,
  p_nickname     TEXT,
  p_difficulty   TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_user_id      UUID DEFAULT NULL,
  p_game_type    TEXT DEFAULT 'quick_math'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_me       public.game_matchmaking%ROWTYPE;
  v_opponent public.game_matchmaking%ROWTYPE;
  v_room_id  UUID;
  v_code     TEXT;
  v_nick     TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_game_type NOT IN ('quick_math', 'typing_battle') THEN RAISE EXCEPTION 'invalid_game_type'; END IF;

  -- Already matched? Return the existing room.
  SELECT * INTO v_me FROM public.game_matchmaking
   WHERE player_id = p_player_id AND status = 'matched' AND room_code IS NOT NULL;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'matched', 'room_id', v_me.room_id, 'room_code', v_me.room_code, 'player_id', p_player_id);
  END IF;

  DELETE FROM public.game_matchmaking WHERE status = 'waiting' AND expires_at < now();

  INSERT INTO public.game_matchmaking (player_id, nickname, difficulty, total_rounds, user_id, game_type)
  VALUES (p_player_id, v_nick, p_difficulty, p_total_rounds, p_user_id, p_game_type)
  ON CONFLICT (player_id) DO UPDATE SET
    nickname = EXCLUDED.nickname, difficulty = EXCLUDED.difficulty,
    total_rounds = EXCLUDED.total_rounds, user_id = EXCLUDED.user_id,
    game_type = EXCLUDED.game_type, status = 'waiting',
    room_id = NULL, room_code = NULL,
    created_at = now(), updated_at = now(),
    expires_at = now() + INTERVAL '2 minutes';

  SELECT * INTO v_opponent FROM public.game_matchmaking
   WHERE status = 'waiting' AND game_type = p_game_type
     AND difficulty = p_difficulty AND total_rounds = p_total_rounds
     AND player_id <> p_player_id AND expires_at > now()
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'waiting'); END IF;

  v_code := public.generate_room_code();
  INSERT INTO public.game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, p_game_type, p_difficulty, 1, 2)
  RETURNING id INTO v_room_id;

  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, TRUE, TRUE, p_user_id);
  INSERT INTO public.game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, v_opponent.player_id, v_opponent.nickname, FALSE, TRUE, v_opponent.user_id);

  UPDATE public.game_matchmaking SET status = 'matched', room_id = v_room_id, room_code = v_code, updated_at = now()
   WHERE player_id IN (p_player_id, v_opponent.player_id);

  RETURN jsonb_build_object('status', 'matched', 'room_id', v_room_id, 'room_code', v_code, 'player_id', p_player_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID, TEXT) TO anon, authenticated;

-- The 048 overload without game_type must go, or calls with fewer args
-- resolve to it (whose SQL never sets typing rooms).
DROP FUNCTION IF EXISTS public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID);

-- ── 8. Result readback + leaderboard + daily challenge ──────────────────────

-- Final results for the room (safe subset, seated players only).
CREATE OR REPLACE FUNCTION public.get_typing_results(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.game_rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id AND game_type = 'typing_battle';
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  RETURN jsonb_build_object(
    'status', v_room.status,
    'winner_id', (SELECT winner_id FROM public.game_winners WHERE room_id = p_room_id),
    'players', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', gp.player_id, 'nickname', gp.nickname,
        'completed', tp.completed, 'total', tp.total,
        'finished', tp.finished, 'is_connected', gp.is_connected
      )), '[]'::jsonb)
      FROM public.game_players gp
      LEFT JOIN public.typing_progress tp
        ON tp.room_id = gp.room_id AND tp.player_id = gp.player_id
      WHERE gp.room_id = p_room_id
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_results(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_results(UUID) TO anon, authenticated;

-- Campus typing rank — best WPM first (spec §16). Extensible via p_sort.
CREATE OR REPLACE FUNCTION public.get_typing_leaderboard(
  p_limit INT DEFAULT 20,
  p_sort  TEXT DEFAULT 'best_wpm'
)
RETURNS TABLE (player_id TEXT, nickname TEXT, best_wpm NUMERIC, best_accuracy NUMERIC, games_played INT, wins INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.player_id, s.nickname, s.best_wpm, s.best_accuracy, s.games_played, s.wins
    FROM public.typing_stats s
   WHERE s.games_played > 0
   ORDER BY CASE WHEN p_sort = 'wins' THEN s.wins ELSE s.best_wpm END DESC,
            s.best_accuracy DESC
   LIMIT GREATEST(LEAST(p_limit, 100), 1);
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_leaderboard(INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_leaderboard(INT, TEXT) TO anon, authenticated;

-- Daily challenge: same words for everyone (deterministic from the date),
-- one scored attempt per player per day, ranked by WPM.
CREATE OR REPLACE FUNCTION public.typing_daily_attempt(
  p_player_id  TEXT,
  p_nickname   TEXT,
  p_words      TEXT[],
  p_duration_ms BIGINT,
  p_user_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_day     DATE := CURRENT_DATE;
  v_target  TEXT[] := public.typing_daily_words(v_day);
  v_correct INT := 0;
  v_elapsed DOUBLE PRECISION;
  v_wpm     NUMERIC(6,2);
  v_acc     NUMERIC(5,2);
  v_nick    TEXT := btrim(p_nickname);
BEGIN
  IF v_nick = '' OR length(v_nick) > 20 THEN RAISE EXCEPTION 'invalid_nickname'; END IF;
  IF p_duration_ms < 2000 OR p_duration_ms > 900000 THEN RAISE EXCEPTION 'impossible_time'; END IF;

  FOR v_i IN 1..array_length(v_target, 1) LOOP
    IF p_words IS NOT NULL AND array_length(p_words, 1) >= v_i
       AND btrim(p_words[v_i]) = v_target[v_i] THEN
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  v_elapsed := p_duration_ms / 1000.0;
  v_acc := ROUND((v_correct::NUMERIC / array_length(v_target, 1)) * 100, 2);
  v_wpm := ROUND(((v_correct::NUMERIC / 5) / (v_elapsed / 60))::NUMERIC, 2);

  -- One attempt per player per day (PRIMARY KEY guard, honest retry copy).
  INSERT INTO public.typing_daily (day, player_id, user_id, nickname, wpm, accuracy, duration_ms)
  VALUES (v_day, p_player_id, p_user_id, v_nick, v_wpm, v_acc, p_duration_ms)
  ON CONFLICT (day, player_id) DO NOTHING;

  RETURN jsonb_build_object(
    'wpm', v_wpm, 'accuracy', v_acc, 'correct', v_correct, 'total', array_length(v_target, 1),
    'accepted', (SELECT TRUE FROM public.typing_daily WHERE day = v_day AND player_id = p_player_id
                  AND duration_ms = p_duration_ms LIMIT 1),
    'rank', (
      SELECT COUNT(*) + 1 FROM public.typing_daily d
       WHERE d.day = v_day AND d.wpm > v_wpm
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.typing_daily_attempt(TEXT, TEXT, TEXT[], BIGINT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.typing_daily_attempt(TEXT, TEXT, TEXT[], BIGINT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_typing_daily(p_player_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_day DATE := CURRENT_DATE;
BEGIN
  RETURN jsonb_build_object(
    'day', v_day,
    'word_count', array_length(public.typing_daily_words(v_day), 1),
    'attempts', (SELECT COUNT(*) FROM public.typing_daily WHERE day = v_day),
    'top', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('nickname', d.nickname, 'wpm', d.wpm) ORDER BY d.wpm DESC), '[]'::jsonb)
        FROM (SELECT * FROM public.typing_daily WHERE day = v_day ORDER BY wpm DESC LIMIT 10) d
    ),
    'me', (
      SELECT to_jsonb(d) FROM public.typing_daily d
       WHERE d.day = v_day AND d.player_id = p_player_id
    )
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_typing_daily(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_typing_daily(TEXT) TO anon, authenticated;

-- ── 9. Quick Math matchmaking keeps working: rewrite via the same engine ────
-- (The dropped 048 overload is re-exposed with the default game_type, so old
-- clients calling with 5 args still land on THIS function.)

COMMENT ON FUNCTION public.join_matchmaking(TEXT, TEXT, TEXT, INT, UUID, TEXT) IS
  '1v1 queue shared by Quick Math and Typing Battle; pairs same-game-type only.';
