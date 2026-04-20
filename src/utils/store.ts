import type { Profile, RoomState, TimerScore } from '../types'
import { supabase } from '../lib/supabase'

const ROOMS_KEY = 'killer_pool_rooms_v1'
const PROFILE_KEY = 'killer_pool_profile_v1'
const TIMER_SCORES_KEY = 'killer_pool_timer_scores_v1'
const ACCOUNTS_KEY = 'killer_pool_accounts_v1'

type RoomIndex = Record<string, RoomState>

type TimerScoreRow = {
  id?: number
  profile_id: string
  username: string
  elapsed_ms: number
  created_at: string
}

type AccountRecord = {
  profileId: string
  username: string
  usernameKey: string
  password: string
}

type AccountRow = {
  profile_id: string
  username: string
  username_key: string
  password: string
}

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

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY)
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
const TIMER_SCORES_TABLE = 'timer_pool_scores'
const ACCOUNTS_TABLE = 'user_accounts'

function usernameToKey(username: string) {
  return username.trim().toLowerCase()
}

function normalizeAccountRow(row: AccountRow): AccountRecord {
  return {
    profileId: row.profile_id,
    username: row.username,
    usernameKey: row.username_key,
    password: row.password,
  }
}

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

function getAccountsLocal() {
  return loadJson<AccountRecord[]>(ACCOUNTS_KEY, [])
}

function saveAccountsLocal(accounts: AccountRecord[]) {
  saveJson(ACCOUNTS_KEY, accounts)
}

async function getAccountsRemote(usernameKey?: string) {
  if (!supabase) return null
  let query = supabase
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username, username_key, password')

  if (usernameKey) {
    query = query.eq('username_key', usernameKey)
  }

  const { data, error } = await query.returns<AccountRow[]>()

  if (error || !data) return null
  return data.map(normalizeAccountRow)
}

async function getAccounts() {
  const local = getAccountsLocal()
  const remote = await getAccountsRemote()
  if (!remote) return local
  saveAccountsLocal(remote)
  return remote
}

function validateAccountInput(username: string, password: string) {
  const trimmed = username.trim()
  if (!/^[A-Za-z0-9_]{4,15}$/.test(trimmed)) {
    throw new Error('Username must be 4-15 characters (letters, numbers, underscore).')
  }
  if (password.trim().length < 4) {
    throw new Error('Password must be at least 4 characters.')
  }
}

export async function registerAccount(username: string, password: string) {
  validateAccountInput(username, password)
  const cleanUsername = username.trim()
  const cleanPassword = password.trim()
  const usernameKey = usernameToKey(cleanUsername)
  const accounts = await getAccounts()
  if (accounts.some((account) => account.usernameKey === usernameKey)) {
    throw new Error('Username is already taken.')
  }

  const next: AccountRecord = {
    profileId: crypto.randomUUID(),
    username: cleanUsername,
    usernameKey,
    password: cleanPassword,
  }

  if (supabase) {
    const { error } = await supabase.from(ACCOUNTS_TABLE).insert({
      profile_id: next.profileId,
      username: next.username,
      username_key: next.usernameKey,
      password: next.password,
    })
    if (error) {
      if (error.message.toLowerCase().includes('duplicate')) {
        throw new Error('Username is already taken.')
      }
      throw new Error('Could not create account right now.')
    }
  }

  const nextLocal = [...accounts, next]
  saveAccountsLocal(nextLocal)
  saveProfile({ id: next.profileId, username: next.username })
  return { id: next.profileId, username: next.username }
}

export async function signInAccount(username: string, password: string) {
  validateAccountInput(username, password)
  const cleanUsername = username.trim()
  const cleanPassword = password.trim()
  const usernameKey = usernameToKey(cleanUsername)
  let account: AccountRecord | undefined

  const remoteMatches = await getAccountsRemote(usernameKey)
  if (remoteMatches && remoteMatches.length) {
    account = remoteMatches[0]
    const local = getAccountsLocal()
    if (!local.some((entry) => entry.profileId === account?.profileId)) {
      saveAccountsLocal([...local, account])
    }
  }

  if (!account) {
    const accounts = await getAccounts()
    account = accounts.find(
      (entry) => usernameToKey(entry.username || entry.usernameKey) === usernameKey,
    )
  }

  const matchesPassword = Boolean(
    account && (account.password === cleanPassword || account.password.trim() === cleanPassword),
  )
  if (!account || !matchesPassword) {
    throw new Error('Invalid username or password.')
  }

  const existing = getProfile()
  saveProfile({
    id: account.profileId,
    username: account.username,
    avatarIcon: existing?.id === account.profileId ? existing.avatarIcon : undefined,
  })
  return { id: account.profileId, username: account.username }
}

function normalizeTimerScore(row: TimerScoreRow): TimerScore {
  return {
    profileId: row.profile_id,
    username: row.username,
    elapsedMs: row.elapsed_ms,
    createdAt: row.created_at,
  }
}

export function getTimerScoresLocal() {
  return loadJson<TimerScore[]>(TIMER_SCORES_KEY, [])
}

export function saveTimerScoresLocal(scores: TimerScore[]) {
  saveJson(TIMER_SCORES_KEY, scores)
}

export async function getTimerScores() {
  const local = getTimerScoresLocal()
  if (!supabase) {
    return local
  }
  const { data, error } = await supabase
    .from(TIMER_SCORES_TABLE)
    .select('profile_id, username, elapsed_ms, created_at')
    .order('elapsed_ms', { ascending: true })
    .returns<TimerScoreRow[]>()

  if (error || !data) {
    return local
  }

  return data.map(normalizeTimerScore)
}

export async function addTimerScore(input: Omit<TimerScore, 'createdAt'>) {
  const nextLocalScore: TimerScore = {
    ...input,
    createdAt: new Date().toISOString(),
  }
  const local = getTimerScoresLocal()
  saveTimerScoresLocal([...local, nextLocalScore])

  if (!supabase) return
  await supabase.from(TIMER_SCORES_TABLE).insert({
    profile_id: input.profileId,
    username: input.username,
    elapsed_ms: input.elapsedMs,
  })
}

export async function deleteTimerScore(input: Pick<TimerScore, 'profileId' | 'elapsedMs' | 'createdAt'>) {
  const local = getTimerScoresLocal()
  const nextLocal = local.filter(
    (score) =>
      !(
        score.profileId === input.profileId &&
        score.elapsedMs === input.elapsedMs &&
        score.createdAt === input.createdAt
      ),
  )
  saveTimerScoresLocal(nextLocal)

  if (!supabase) return

  await supabase
    .from(TIMER_SCORES_TABLE)
    .delete()
    .eq('profile_id', input.profileId)
    .eq('elapsed_ms', input.elapsedMs)
    .eq('created_at', input.createdAt)
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
