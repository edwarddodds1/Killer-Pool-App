import type { Profile, RoomState } from '../types'
import { supabase } from '../lib/supabase'

const ROOMS_KEY = 'killer_pool_rooms_v1'
const PROFILE_KEY = 'killer_pool_profile_v1'

type RoomIndex = Record<string, RoomState>

function loadJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getProfile() {
  return loadJson<Profile | null>(PROFILE_KEY, null)
}

export function saveProfile(profile: Profile) {
  saveJson(PROFILE_KEY, profile)
}

export function getRooms() {
  return loadJson<RoomIndex>(ROOMS_KEY, {})
}

export function getRoom(code: string) {
  const rooms = getRooms()
  return rooms[code]
}

export function upsertRoom(room: RoomState, oldCode?: string) {
  const rooms = getRooms()
  if (oldCode && oldCode !== room.code) {
    delete rooms[oldCode]
  }
  rooms[room.code] = room
  saveJson(ROOMS_KEY, rooms)
}

type RoomRow = {
  code: string
  state: RoomState
  updated_at?: string
}

const ROOMS_TABLE = 'killer_rooms'

export async function getRoomRemote(code: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .select('code, state, updated_at')
    .eq('code', code)
    .maybeSingle<RoomRow>()

  if (error || !data) return null
  return data.state
}

export async function upsertRoomRemote(room: RoomState, oldCode?: string) {
  if (!supabase) return
  if (oldCode && oldCode !== room.code) {
    await supabase.from(ROOMS_TABLE).delete().eq('code', oldCode)
  }
  await supabase.from(ROOMS_TABLE).upsert({
    code: room.code,
    state: room,
    updated_at: new Date().toISOString(),
  })
}

export function subscribeRoomRemote(
  code: string,
  onRoom: (room: RoomState) => void,
) {
  const client = supabase
  if (!client) return () => {}
  const channel = client
    .channel(`room-${code}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: ROOMS_TABLE, filter: `code=eq.${code}` },
      (payload) => {
        const next = (payload.new as RoomRow | undefined)?.state
        if (next) onRoom(next)
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
