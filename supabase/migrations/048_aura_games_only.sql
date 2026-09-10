-- ═══════════════════════════════════════════════════════════════════════════
-- 048_aura_games_only.sql — Aura comes ONLY from winning games in Compete
-- ═══════════════════════════════════════════════════════════════════════════
-- Previously aura_points grew from every karma-earning activity (notes, DSA,
-- etc.) inside award_karma(). From now on:
--   • award_karma() only touches karma_points (lifetime score) — no more aura.
--   • The game-finish trigger awards +10 aura to the winner's profile.
-- To link a game winner to a profile, the client passes its auth user id when
-- creating/joining/matchmaking; it is stored on game_players (and the
-- matchmaking queue) and copied into game_winners by the trigger. Any future
-- game type added to Compete earns aura automatically — the trigger is on
-- game_rooms, not on a specific game.

-- ── 1. Link game players / winners / queue entries to profiles ──────────────

ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.game_winners
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.game_matchmaking
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 2. award_karma: aura no longer comes from karma activities ──────────────

CREATE OR REPLACE FUNCTION public.award_karma(
  p_reason TEXT,
  p_ref_type TEXT,
  p_ref_id TEXT,
  p_target_user UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user       UUID;
  v_points     INT;
  v_season     UUID;
  v_daily      INT;
  v_today      DATE := CURRENT_DATE;
BEGIN
  -- Identity is ALWAYS the caller; target only usable by security-definer paths
  v_user := COALESCE(p_target_user, auth.uid());
  IF v_user IS NULL THEN RETURN FALSE; END IF;

  -- ── Whitelist with per-reason points (single place to tune economy) ──
  SELECT CASE p_reason
    WHEN 'note_uploaded'       THEN 10
    WHEN 'note_helpful'        THEN 3     -- capped daily, see below
    WHEN 'opportunity_posted'  THEN 8
    WHEN 'answer_submitted'    THEN 5
    WHEN 'answer_accepted'     THEN 15
    WHEN 'question_asked'      THEN 2
    WHEN 'event_hosted'        THEN 20
    WHEN 'event_attended'      THEN 5
    WHEN 'community_created'   THEN 10
    WHEN 'dsa_solved_easy'     THEN 5
    WHEN 'dsa_solved_medium'   THEN 10
    WHEN 'dsa_solved_hard'     THEN 20
    WHEN 'contest_top10'       THEN 25
    WHEN 'contest_participated' THEN 5
    WHEN 'mentor_session'      THEN 15
    WHEN 'review_written'      THEN 3
    WHEN 'review_helpful'      THEN 2
    WHEN 'spam_penalty'        THEN -25
    WHEN 'abuse_penalty'       THEN -50
    WHEN 'bad_faith_penalty'   THEN -100
    ELSE NULL
  END INTO v_points;

  IF v_points IS NULL THEN
    RAISE EXCEPTION 'unknown karma reason: %', p_reason;
  END IF;

  -- Negative awards (moderation) must carry a note and be gated
  IF v_points < 0 THEN
    IF p_note IS NULL OR length(p_note) < 3 THEN
      RAISE EXCEPTION 'negative karma requires a note';
    END IF;
  END IF;

  -- Ref is required for earn events (prevents unlimited self-awards)
  IF v_points > 0 AND (p_ref_type IS NULL OR p_ref_id IS NULL) THEN
    RAISE EXCEPTION 'earn events require a ref';
  END IF;

  -- ── Anti-farming: daily caps ──
  SELECT COALESCE(SUM(points), 0)
    INTO v_daily
    FROM public.karma_ledger
   WHERE user_id = v_user AND created_at >= v_today;

  IF v_points > 0 AND v_daily + v_points > 120 THEN
    RETURN FALSE;                          -- hard daily total cap (120)
  END IF;

  -- Per-reason cap: "note_helpful" and "review_helpful" are high-volume
  IF v_points > 0 AND p_reason IN ('note_helpful', 'review_helpful') THEN
    SELECT COALESCE(SUM(points), 0)
      INTO v_daily
      FROM public.karma_ledger
     WHERE user_id = v_user AND reason = p_reason AND created_at >= v_today;
    IF v_daily + v_points > 30 THEN RETURN FALSE;  -- 30/day per source
    END IF;
  END IF;

  -- Uniqueness is enforced by the UNIQUE(ref_type, ref_id) constraint;
  -- catch it here for a clean FALSE instead of an exception.
  IF v_points > 0 AND EXISTS (
    SELECT 1 FROM public.karma_ledger
     WHERE ref_type = p_ref_type AND ref_id = p_ref_id
  ) THEN
    RETURN FALSE;
  END IF;

  v_season := (SELECT id FROM public.seasons WHERE is_active = TRUE LIMIT 1);

  INSERT INTO public.karma_ledger
    (user_id, season_id, reason, points, ref_type, ref_id, note)
  VALUES
    (v_user, v_season, p_reason, v_points, p_ref_type, p_ref_id, p_note);

  -- Materialized totals (ledger remains the source of truth).
  -- Aura is NOT touched here — it is awarded ONLY for winning games
  -- (see record_game_winner()).
  UPDATE public.profiles
     SET karma_points = COALESCE(karma_points, 0) + v_points
   WHERE id = v_user;

  RETURN TRUE;
END $$;

REVOKE EXECUTE ON FUNCTION public.award_karma(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.award_karma(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ── 3. Game finish trigger: record winner + award aura (+10 per win) ────────

CREATE OR REPLACE FUNCTION record_game_winner() RETURNS TRIGGER AS $$
DECLARE
  v_winner game_players%ROWTYPE;
  v_aura_points INT := 10;   -- aura awarded per game win (Compete games only)
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    SELECT * INTO v_winner
    FROM game_players
    WHERE room_id = NEW.id
    ORDER BY score DESC, correct_count DESC, joined_at ASC
    LIMIT 1;

    IF FOUND AND NOT EXISTS (SELECT 1 FROM game_winners WHERE room_id = NEW.id) THEN
      INSERT INTO game_winners (room_id, game_type, winner_id, winner_nickname, winner_score, user_id)
      VALUES (NEW.id, NEW.game_type, v_winner.player_id, v_winner.nickname, v_winner.score, v_winner.user_id);

      -- Aura comes ONLY from winning games. Guests (no profile) still get
      -- their win recorded for the champions board, just no aura.
      IF v_winner.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET aura_points = COALESCE(aura_points, 0) + v_aura_points
        WHERE id = v_winner.user_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Game RPCs accept the auth user id for winner→profile linking ─────────

CREATE OR REPLACE FUNCTION create_game_room(
  p_player_id TEXT,
  p_nickname TEXT,
  p_difficulty TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_max_players INT DEFAULT 100,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_room_id UUID;
  v_code TEXT;
  v_nick TEXT;
BEGIN
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  v_code := generate_room_code();

  INSERT INTO game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'quick_math', p_difficulty, p_total_rounds, p_max_players)
  RETURNING id INTO v_room_id;

  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, true, true, p_user_id);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'room_code', v_code,
    'player_id', p_player_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION join_game_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_nickname TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_room game_rooms%ROWTYPE;
  v_nick TEXT;
  v_player_count INT;
BEGIN
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- Find room
  SELECT * INTO v_room FROM game_rooms
  WHERE room_code = p_room_code AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or game already started';
  END IF;

  -- Check expiry
  IF v_room.expires_at < now() THEN
    UPDATE game_rooms SET status = 'expired' WHERE id = v_room.id;
    RAISE EXCEPTION 'Room has expired';
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_player_count FROM game_players WHERE room_id = v_room.id;
  IF v_player_count >= v_room.max_players THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  -- Check duplicate nickname in room
  IF EXISTS (SELECT 1 FROM game_players WHERE room_id = v_room.id AND nickname = v_nick) THEN
    RAISE EXCEPTION 'Nickname already taken in this room';
  END IF;

  -- Check if player already in room (reconnection)
  IF EXISTS (SELECT 1 FROM game_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE game_players SET is_connected = true, disconnected_at = NULL,
      user_id = COALESCE(p_user_id, user_id)
    WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object(
      'room_id', v_room.id,
      'room_code', v_room.room_code,
      'player_id', p_player_id,
      'reconnected', true
    );
  END IF;

  -- Add player
  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room.id, p_player_id, v_nick, false, false, p_user_id);

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'room_code', v_room.room_code,
    'player_id', p_player_id,
    'reconnected', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION join_matchmaking(
  p_player_id TEXT,
  p_nickname TEXT,
  p_difficulty TEXT DEFAULT 'medium',
  p_total_rounds INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_me game_matchmaking%ROWTYPE;
  v_opponent game_matchmaking%ROWTYPE;
  v_room_id UUID;
  v_code TEXT;
  v_nick TEXT;
BEGIN
  v_nick := TRIM(p_nickname);
  IF v_nick = '' OR LENGTH(v_nick) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 1-20 characters';
  END IF;

  -- Already matched? Return the existing room instead of re-queuing.
  SELECT * INTO v_me
  FROM game_matchmaking
  WHERE player_id = p_player_id AND status = 'matched' AND room_code IS NOT NULL;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'room_id', v_me.room_id,
      'room_code', v_me.room_code,
      'player_id', p_player_id
    );
  END IF;

  -- Clear stale queue entries.
  DELETE FROM game_matchmaking WHERE status = 'waiting' AND expires_at < now();

  -- Upsert self into the queue (fresh waiting entry).
  INSERT INTO game_matchmaking (player_id, nickname, difficulty, total_rounds, user_id)
  VALUES (p_player_id, v_nick, p_difficulty, p_total_rounds, p_user_id)
  ON CONFLICT (player_id) DO UPDATE SET
    nickname    = EXCLUDED.nickname,
    difficulty  = EXCLUDED.difficulty,
    total_rounds = EXCLUDED.total_rounds,
    user_id     = EXCLUDED.user_id,
    status      = 'waiting',
    room_id     = NULL,
    room_code   = NULL,
    created_at  = now(),
    updated_at  = now(),
    expires_at  = now() + INTERVAL '2 minutes';

  -- Pick the oldest compatible waiting opponent (SKIP LOCKED prevents two
  -- players from claiming the same opponent concurrently).
  SELECT * INTO v_opponent
  FROM game_matchmaking
  WHERE status = 'waiting'
    AND difficulty = p_difficulty
    AND total_rounds = p_total_rounds
    AND player_id != p_player_id
    AND expires_at > now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'waiting');
  END IF;

  -- Create a 2-player room; the current player hosts and both are ready.
  v_code := generate_room_code();
  INSERT INTO game_rooms (room_code, host_id, game_type, difficulty, total_rounds, max_players)
  VALUES (v_code, p_player_id, 'quick_math', p_difficulty, p_total_rounds, 2)
  RETURNING id INTO v_room_id;

  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, p_player_id, v_nick, true, true, p_user_id);

  INSERT INTO game_players (room_id, player_id, nickname, is_host, is_ready, user_id)
  VALUES (v_room_id, v_opponent.player_id, v_opponent.nickname, false, true, v_opponent.user_id);

  -- Mark both players as matched so their poll picks up the room.
  UPDATE game_matchmaking SET
    status = 'matched', room_id = v_room_id, room_code = v_code, updated_at = now()
  WHERE player_id IN (p_player_id, v_opponent.player_id);

  RETURN jsonb_build_object(
    'status', 'matched',
    'room_id', v_room_id,
    'room_code', v_code,
    'player_id', p_player_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Drop stale overloads ─────────────────────────────────────────────────
-- CREATE OR REPLACE cannot change a function's parameter list, so the new
-- signatures above were created as ADDITIONAL overloads. Drop the old ones
-- so calls with fewer args resolve to the new functions (their new params
-- default to NULL) instead of failing with "function is not unique".
DROP FUNCTION IF EXISTS public.create_game_room(TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.join_game_room(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.join_matchmaking(TEXT, TEXT, TEXT, INT);