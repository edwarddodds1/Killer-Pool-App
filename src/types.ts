export type GameMode = 'killer' | 'kelly' | 'timer'
export type KillerAllocationMode = 'single' | 'multi'
export type RoomStatus = 'lobby' | 'allocation' | 'order' | 'inGame' | 'results'

export interface Profile {
  id: string
  username: string
  avatarIcon?: string
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
  status: RoomStatus
  players: PlayerState[]
  playOrder: string[]
  turnIndex: number
  sunkBalls: number[]
  eliminationOrder: string[]
}

export interface TimerScore {
  profileId: string
  username: string
  elapsedMs: number
  createdAt: string
}
