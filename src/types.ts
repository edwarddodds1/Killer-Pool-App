export type {
  GameMode,
  KillerAllocationMode,
  RoomStatus,
  Profile,
  PlayerState,
  RoomState,
} from '../../packages/domain/src/types'

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
