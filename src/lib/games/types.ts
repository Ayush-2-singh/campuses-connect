// ═══════════════════════════════════════════════════════════════════════════
// Game Types — shared between client components and Supabase RPC calls
// ═══════════════════════════════════════════════════════════════════════════

export type GameStatus = 'waiting' | 'starting' | 'active' | 'finished' | 'expired'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameType = 'quick_math'

export interface GameRoom {
  id: string
  room_code: string
  host_id: string
  game_type: GameType
  status: GameStatus
  difficulty: Difficulty
  max_players: number
  total_rounds: number
  current_round: number
  round_question: MathQuestion | null
  round_started_at: string | null
  round_duration_ms: number
  created_at: string
  expires_at: string
}

export interface MathQuestion {
  text: string
  answer: number
  operation: string
  time_limit_ms: number
}

export interface GamePlayer {
  player_id: string
  nickname: string
  is_host: boolean
  is_ready: boolean
  is_connected: boolean
  score: number
  correct_count: number
  total_answered: number
  avg_time_ms: number
  joined_at: string
}

export interface GameAnswer {
  player_id: string
  is_correct: boolean
  points_awarded: number
  answer_time_ms: number
}

export interface RoomState {
  room: GameRoom
  players: GamePlayer[]
  answers: GameAnswer[]
}

export interface CreateRoomResult {
  room_id: string
  room_code: string
  player_id: string
}

export interface JoinRoomResult {
  room_id: string
  room_code: string
  player_id: string
  reconnected: boolean
}

export interface StartGameResult {
  status: 'starting'
  question: MathQuestion
  round: number
  starts_at: string
  total_rounds: number
}

export interface SubmitAnswerResult {
  correct: boolean
  points: number
  correct_answer?: number
  timed_out?: boolean
}

export interface AdvanceRoundResult {
  finished: boolean
  round: number
  question: MathQuestion | null
  starts_at: string | null
}

// Client-side game phases (superset of DB status)
export type ClientGamePhase =
  | 'entry' // Create/Join room
  | 'lobby' // Waiting for players
  | 'countdown' // 3-2-1-GO
  | 'playing' // Active round
  | 'round_result' // Brief show of correct answer
  | 'finished' // Final results
