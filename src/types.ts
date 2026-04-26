export type GameMode = 'killer' | 'kelly' | 'timer'
export type KillerAllocationMode = 'single' | 'multi'
export type RoomStatus = 'lobby' | 'allocation' | 'order' | 'inGame' | 'results'

export interface Profile {
  id: string
  username: string
  avatarIcon?: string
  /** Set after register/sign-in when Supabase accounts are used; absent for guests. */
  sessionId?: string
}

export interface PlayerState {
  id: string
  username: string
  avatarIcon?: string
  isBot?: boolean
  ready: boolean
  assignedBalls: number[]
  pottedBalls: number[]
  turns: number
  kills: number
  eliminated: boolean
}

export interface RoomState {
  code: string
  gameNumber: number
  mode: GameMode
  killerAllocationMode: KillerAllocationMode
  /** Monotonic room revision for conflict resolution across clients. */
  syncRevision?: number
  /** ISO timestamp used as tie-breaker when revisions are equal. */
  syncUpdatedAt?: string
  status: RoomStatus
  players: PlayerState[]
  playOrder: string[]
  turnIndex: number
  sunkBalls: number[]
  eliminationOrder: string[]
}

export interface TimerScore {
  /** Supabase row id when available (undefined for local pending entries). */
  id?: number
  profileId: string
  username: string
  elapsedMs: number
  createdAt: string
  /** Local-only: not yet confirmed on Supabase (offline or failed upload). */
  pendingSync?: boolean
}
