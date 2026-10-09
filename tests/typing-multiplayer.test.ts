/**
 * TYPING MULTIPLAYER — guards the 8-player race, the live side-by-side progress
 * feed and the win-driven leaderboard (migration 20261106).
 *
 * Each guard corresponds to something that was actually wrong:
 *   1. rooms were capped at 2 players and Quick Match only ever paired a pair;
 *   2. the first finisher flipped the room to 'finished', so everyone else's
 *      result (and loss) was thrown away;
 *   3. only the winner could submit, so the leaderboard never moved for anyone
 *      but the winner.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const sql = read('supabase/migrations/20261106_typing_multiplayer.sql')
const battle = read('src/components/games/TypingBattle.tsx')
const arena = read('src/components/games/TypingArena.tsx')
const boards = read('src/components/games/TypingBoards.tsx')

describe('typing multiplayer — 8-player rooms', () => {
  it('private rooms reserve eight seats', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.create_typing_room('))
    expect(body).toMatch(/reserve_game_room\(p_player_id, 'typing_battle', 'medium', 1, 8\)/)
  })

  it('Quick Match pools into a public 8-seat room instead of a 1v1 pair', () => {
    expect(sql).toMatch(/reserve_game_room\(p_player_id, p_game_type, p_difficulty, 1, 8\)/)
    expect(sql).toMatch(/SET matchmade = TRUE/)
  })

  it('separates public rooms from private ones so pooling can never hijack a code room', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS matchmade BOOLEAN NOT NULL DEFAULT FALSE/)
    const body = sql.slice(sql.indexOf('FUNCTION public.join_matchmaking('))
    expect(body).toMatch(/AND r\.matchmade/)
  })

  it('keeps the room-row lock and the advisory lock that prevent two players claiming one seat', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.join_matchmaking('))
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\(/)
    expect(body).toMatch(/FOR UPDATE;/)
  })
})

describe('typing multiplayer — every finisher is recorded', () => {
  it('serialises completions so two racers can never both be "first"', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.complete_typing_match('))
    expect(body).toMatch(/FOR UPDATE;/)
  })

  it('only nets the win when this insert actually claimed the row', () => {
    expect(sql).toMatch(/ON CONFLICT \(room_id\) DO NOTHING\s*\n\s*RETURNING winner_id INTO v_winner/)
    expect(sql).toMatch(/v_win := v_winner IS NOT NULL/)
  })

  it('does not finish the room on the first completion', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.complete_typing_match('))
    // It is now conditional on everyone having submitted.
    expect(body).toMatch(/IF v_all_done THEN/)
    expect(body).toMatch(/NOT EXISTS \(/)
    // The old unconditional flip must be gone.
    expect(body).not.toMatch(
      /UPDATE public\.game_rooms SET status = 'finished', updated_at = now\(\) WHERE id = p_room_id;/
    )
  })

  it('writes stats for a loss too, so the leaderboard moves for everyone', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.complete_typing_match('))
    expect(body).toMatch(/CASE WHEN v_win THEN 0 ELSE 1 END/)
    expect(body).toMatch(/losses      = s\.losses \+ EXCLUDED\.losses/)
  })

  it('heartbeats no longer mark a player finished — only the verdict does', () => {
    const start = sql.indexOf('FUNCTION public.update_typing_progress(')
    const end = sql.indexOf('REVOKE EXECUTE ON FUNCTION public.update_typing_progress', start)
    const body = sql.slice(start, end)
    expect(body).not.toMatch(/finished\s*=\s*\(LEAST/)
    expect(body).not.toMatch(/finished\s*=\s*TRUE/)
  })
})

describe('typing multiplayer — live leaderboard', () => {
  it('publishes typing_stats so the board refreshes after each match', () => {
    expect(sql).toMatch(/ADD TABLE public\.typing_stats/)
  })

  it('supports ranking by wins as well as best WPM', () => {
    expect(sql).toMatch(/WHEN p_sort = 'wins' THEN s\.wins ELSE s\.best_wpm/)
  })

  it('the board subscribes to typing_stats and shows the win count', () => {
    expect(boards).toMatch(/table: 'typing_stats'/)
    expect(boards).toMatch(/b\.wins/)
  })
})

describe('typing multiplayer — side-by-side realtime client', () => {
  it('the arena takes a full rivals list, not a single opponent', () => {
    expect(arena).toMatch(/rivals: RivalProgress\[\]/)
    expect(arena).toMatch(/RivalProgress/)
    expect(arena).toMatch(/Live race standings/)
    expect(arena).not.toMatch(/opponent:/)
  })

  it('the orchestrator feeds every other seat into the arena', () => {
    expect(battle).toMatch(/const rivals = seats\.filter\(\(s\) => s\.player_id !== myPlayerId\)/)
    expect(battle).toMatch(/rivals=\{rivals\.map/)
  })

  it('the lobby and countdown talk about a field, not one opponent', () => {
    expect(battle).toMatch(/Waiting for more players/)
    expect(battle).toMatch(/TYPING_MAX_PLAYERS/)
    expect(battle).toMatch(/racers ready/)
  })
})
