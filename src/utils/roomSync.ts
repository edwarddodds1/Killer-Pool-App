import type { RoomState } from '../types'

export function roomSyncRevision(room: RoomState | null | undefined) {
  return room?.syncRevision ?? 0
}

export function roomSyncUpdatedAtMs(room: RoomState | null | undefined) {
  if (!room?.syncUpdatedAt) return 0
  const parsed = Date.parse(room.syncUpdatedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

export function stampRoomForWrite(next: RoomState, current: RoomState | null | undefined): RoomState {
  const nowIso = new Date().toISOString()
  const baseRevision = Math.max(roomSyncRevision(current), roomSyncRevision(next))
  return {
    ...next,
    syncRevision: baseRevision + 1,
    syncUpdatedAt: nowIso,
  }
}

export function shouldAcceptIncomingRoom(incoming: RoomState, current: RoomState | null | undefined) {
  if (!current) return true
  const incomingHasSyncMeta = incoming.syncRevision !== undefined || incoming.syncUpdatedAt !== undefined
  const currentHasSyncMeta = current.syncRevision !== undefined || current.syncUpdatedAt !== undefined
  // Backward compatibility: allow updates from clients/tabs that haven't adopted sync metadata yet.
  if (!incomingHasSyncMeta || !currentHasSyncMeta) return true
  const incomingRevision = roomSyncRevision(incoming)
  const currentRevision = roomSyncRevision(current)
  if (incomingRevision > currentRevision) return true
  if (incomingRevision < currentRevision) return false
  return roomSyncUpdatedAtMs(incoming) >= roomSyncUpdatedAtMs(current)
}
