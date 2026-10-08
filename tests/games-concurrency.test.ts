/**
 * GAMES CONCURRENCY — guards the hardening migration (20261103).
 *
 * These are the four ways the games broke once a crowd showed up; each guard
 * fails loudly if the fix is ever reverted:
 *   1. room codes were checked against live rooms only, but the UNIQUE
 *      constraint covers the whole table — finished games made codes collide;
 *   2. joins read the player count and inserted without a lock, so rooms
 *      over-filled;
 *   3. the 1v1 queue could pair the same two players twice;
 *   4. a finished match's 'matched' row sent the next Quick Match back into
 *      the dead room.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const MIGRATION = 'supabase/migrations/20261103_games_concurrency.sql'
const sql = read(MIGRATION)

describe('room codes stay unique against the whole table', () => {
  it('checks every room, not just the ones still in flight', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.game_rooms WHERE room_code = v_code\)/)
    // The old bug: the collision check filtered on the live statuses.
    expect(sql).not.toMatch(/room_code = code AND status IN \('waiting', 'starting', 'active'\)/)
  })

  it('retries when two creators pick the same code at the same instant', () => {
    expect(sql).toMatch(/FUNCTION public\.reserve_game_room\(/)
    expect(sql).toMatch(/EXCEPTION WHEN unique_violation/)
  })

  it('routes every room creation through the safe helper', () => {
    for (const caller of ['create_game_room', 'join_matchmaking', 'create_typing_room']) {
      const from = sql.indexOf(`FUNCTION public.${caller}(`)
      expect(from, `${caller} missing`).toBeGreaterThan(-1)
      const body = sql.slice(from, sql.indexOf('$fn$;', from))
      expect(body, `${caller} bypasses reserve_game_room`).toMatch(/reserve_game_room/)
    }
  })
})

describe('a join can never over-fill a room', () => {
  it('Quick Math locks the room row before counting players', () => {
    const body = sql.slice(
      sql.indexOf('FUNCTION public.join_game_room('),
      sql.indexOf('FUNCTION public.join_matchmaking(')
    )
    expect(body).toMatch(/FOR UPDATE/)
  })

  it('Typing Battle locks the room row before counting players', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.join_typing_room('))
    expect(body).toMatch(/FOR UPDATE/)
  })
})

describe('matchmaking cannot pair the same two players twice', () => {
  it('serialises pairing per game-type / difficulty / rounds bucket', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\(/)
  })

  it('only reuses a matched room that is still joinable', () => {
    expect(sql).toMatch(/r\.status IN \('waiting', 'starting', 'active'\)/)
  })
})

describe('every recreated RPC keeps explicit grants', () => {
  for (const fn of [
    'generate_room_code',
    'create_game_room',
    'join_game_room',
    'join_matchmaking',
    'create_typing_room',
    'join_typing_room',
  ]) {
    it(`${fn} is revoked from PUBLIC and granted to clients`, () => {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}`))
      expect(sql).toMatch(new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${fn}`))
    })
  }

  it('the internal helper is never granted to clients', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.reserve_game_room/)
    expect(sql).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.reserve_game_room/)
  })
})

describe('the reservation helper stays out of client hands on Supabase', () => {
  // Revoking from PUBLIC alone is not enough: the public schema's default
  // privileges grant EXECUTE to anon and authenticated explicitly, so those
  // roles must be named directly or the helper stays callable by any client.
  const lock = read('supabase/migrations/20261105_lock_reserve_game_room.sql')
  const SIG = 'public\\.reserve_game_room\\(TEXT, TEXT, TEXT, INT, INT\\)'

  it('revokes reserve_game_room from PUBLIC and the client roles', () => {
    expect(lock).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${SIG} FROM PUBLIC`))
    expect(lock).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${SIG} FROM anon, authenticated`))
  })

  it('never grants it to a client role', () => {
    expect(lock).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.reserve_game_room/)
  })
})
