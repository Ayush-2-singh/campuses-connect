-- ═══════════════════════════════════════════════════════════════════════════
-- 20261105_lock_reserve_game_room.sql — keep the room-reservation helper
-- out of client hands
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261103 introduces reserve_game_room() as an internal helper — its own
-- comment says "not granted to clients" and it only revokes from PUBLIC.
--
-- That is not enough on Supabase: the public schema has default privileges
-- that grant EXECUTE to anon and authenticated EXPLICITLY, so revoking from
-- PUBLIC leaves those two roles holding a direct grant. Any client could call
-- reserve_game_room() to insert game_rooms rows directly, bypassing
-- create_game_room / create_typing_room entirely.
--
-- SECURITY DEFINER callers (create_game_room, create_typing_room,
-- join_matchmaking) execute as the function owner, so revoking from the client
-- roles does not affect them. service_role is left alone: it is server-only
-- and already trusted to bypass RLS.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.reserve_game_room(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_game_room(TEXT, TEXT, TEXT, INT, INT) FROM anon, authenticated;
