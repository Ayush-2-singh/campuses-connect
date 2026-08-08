-- ============================================================
-- CampusConnect — 016 EVENTS + GALLERY
-- Campus events with RSVP, attendance tracking, and per-event
-- photo/video galleries (memories = retention + sharing).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id      UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  college_id     UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'general',
  location       TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  cover_url      TEXT,
  max_attendees  INT,
  is_featured    BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'finished')),
  karma_awarded  BOOLEAN NOT NULL DEFAULT FALSE,   -- guards one-time host reward
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_events_start ON public.events (starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_campus ON public.events (campus_id, starts_at DESC);

-- ------------------------------------------------------------
-- 2. Attendees — RSVP then check-in (both count as participation)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'maybe', 'checked_in')),
  checked_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- ------------------------------------------------------------
-- 3. Gallery — media belongs to an event, not a global media system
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_gallery (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url   TEXT NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  caption     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_event ON public.event_gallery (event_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. One-time rewards — guarded by flags so karma is never doubled
-- ------------------------------------------------------------

-- Attend an event → +5 karma once (guarded by a "rewarded" marker).
-- We use an event-scoped ledger ref: 'event_attended:<event_id>' — the
-- UNIQUE(ref_type, ref_id) constraint in 014 makes it idempotent.
CREATE OR REPLACE FUNCTION public.attend_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_event_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.event_attendees (event_id, user_id, status)
  VALUES (p_event_id, auth.uid(), 'going')
  ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'going', created_at = now();

  -- Reward via the ledger (idempotent by ref)
  PERFORM public.award_karma('event_attended', 'event_attend', 'event_attended:' || p_event_id, auth.uid());
  PERFORM public.record_meaningful_action();

  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.attend_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.attend_event(UUID) TO authenticated;

-- Check-in at event → upgrades RSVP to verified attendance
CREATE OR REPLACE FUNCTION public.check_in_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.event_attendees (event_id, user_id, status, checked_in)
  VALUES (p_event_id, auth.uid(), 'checked_in', now())
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = 'checked_in', checked_in = now();

  PERFORM public.award_karma('event_attended', 'event_checkin', 'event_checkin:' || p_event_id, auth.uid());
  PERFORM public.record_meaningful_action();
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_in_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_in_event(UUID) TO authenticated;

-- Host reward — once per event (guarded by events.karma_awarded)
CREATE OR REPLACE FUNCTION public.reward_event_host(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host UUID;
BEGIN
  SELECT created_by INTO v_host FROM public.events WHERE id = p_event_id;
  IF v_host IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.events SET karma_awarded = TRUE WHERE id = p_event_id AND karma_awarded = FALSE;
  IF NOT FOUND THEN RETURN FALSE; END IF;   -- already rewarded

  PERFORM public.award_karma('event_hosted', 'event_host', 'event_host:' || p_event_id, v_host);
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION public.reward_event_host(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reward_event_host(UUID) TO authenticated;
