// ═══════════════════════════════════════════════════════════════════════════
// Game Configuration — all tunable values in one place
// ═══════════════════════════════════════════════════════════════════════════

export const GAME_CONFIG = {
  /** Total rounds per game */
  TOTAL_ROUNDS: 10,

  /** Maximum players per room */
  MAX_PLAYERS: 100,

  /** Minimum players to start (host counts) */
  MIN_PLAYERS: 2,

  /** Countdown seconds before game starts */
  COUNTDOWN_SECONDS: 3,

  /** Milliseconds between countdown ticks */
  COUNTDOWN_TICK_MS: 1000,

  /** Round duration limits by difficulty (ms) */
  ROUND_DURATION: {
    easy: 20_000,
    medium: 15_000,
    hard: 10_000,
  } as const,

  /** Time (ms) after round ends to show result before advancing */
  ROUND_RESULT_DELAY: 2_500,

  /** Points for correct answer */
  BASE_POINTS: 100,

  /** Max speed bonus points */
  SPEED_BONUS_MAX: 50,

  /** Milliseconds per speed bonus point */
  SPEED_BONUS_INTERVAL: 300,

  /** Grace period (ms) for network latency on answer submission */
  NETWORK_GRACE_MS: 2_000,

  /** Room code length (digits) */
  ROOM_CODE_LENGTH: 6,

  /** LocalStorage key prefix for guest identity */
  GUEST_ID_KEY: 'cc_game_guest_id',
  GUEST_NICKNAME_KEY: 'cc_game_nickname',

  /** Reconnection window (ms) — player marked disconnected after this */
  RECONNECT_TIMEOUT_MS: 30_000,

  /** How often to check room health (ms) */
  HEALTH_CHECK_INTERVAL_MS: 15_000,
} as const

export const DIFFICULTY_CONFIG = {
  easy: {
    label: 'Easy',
    emoji: '🟢',
    description: 'Addition & subtraction, small numbers',
    color: 'var(--success-text)',
    bg: 'var(--success-light)',
  },
  medium: {
    label: 'Medium',
    emoji: '🟡',
    description: 'All operations, medium numbers',
    color: 'var(--warning-text)',
    bg: 'var(--warning-light)',
  },
  hard: {
    label: 'Hard',
    emoji: '🔴',
    description: 'All operations, large numbers, fast timer',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
  },
} as const
