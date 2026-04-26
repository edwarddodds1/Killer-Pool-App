import type { Profile, RoomState, TimerScore } from '../types'
import { supabase } from '../lib/supabase'
import { removePlayerFromRoom } from './game'
import { timerScoreKey } from '../../shared/timerLeaderboard'

export { timerScoreBelongsToProfile } from '../../shared/timerLeaderboard'

const ROOMS_KEY = 'killer_pool_rooms_v1'
const PROFILE_KEY = 'killer_pool_profile_v1'
const TIMER_SCORES_KEY = 'killer_pool_timer_scores_v1'
const ACCOUNTS_KEY = 'killer_pool_accounts_v1'
const KILLER_POOL_STATS_KEY = 'killer_pool_killer_stats_v2'

type RoomIndex = Record<string, RoomState>
type KillerPoolStatsIndex = Record<string, { wins: number; games: number }>

type TimerScoreRow = {
  id: number
  profile_id: string
  username: string
  elapsed_ms: number
  created_at: string
}

type AccountRecord = {
  profileId: string
  username: string
  usernameKey: string
  passwordHash: string
  passwordSalt: string
  passwordVersion: number
  legacyPassword?: string
}

type AccountRow = {
  profile_id: string
  username: string
  username_key: string
  password_hash: string | null
  password_salt: string | null
  password_version: number | null
  password?: string | null
}

type LegacyAccountRow = {
  profile_id: string
  username: string
  username_key: string
  password: string | null
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

export function getKillerPoolStats(profileId: string) {
  const all = loadJson<KillerPoolStatsIndex>(KILLER_POOL_STATS_KEY, {})
  const next = all[profileId]
  if (!next) return { wins: 0, games: 0 }
  return {
    wins: Math.max(0, next.wins || 0),
    games: Math.max(0, next.games || 0),
  }
}

export function recordKillerPoolMatchResult(profileId: string, didWin: boolean) {
  const all = loadJson<KillerPoolStatsIndex>(KILLER_POOL_STATS_KEY, {})
  const current = all[profileId] ?? { wins: 0, games: 0 }
  all[profileId] = {
    wins: current.wins + (didWin ? 1 : 0),
    games: current.games + 1,
  }
  saveJson(KILLER_POOL_STATS_KEY, all)
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

/** `undefined` = request error (ignore); `null` = no account row. */
export async function fetchActiveSessionIdForProfile(
  profileId: string,
): Promise<string | null | undefined> {
  if (!supabase) return undefined
  const { data, error } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('active_session_id')
    .eq('profile_id', profileId)
    .maybeSingle<{ active_session_id: string | null }>()

  if (error) return undefined
  if (!data) return null
  return data.active_session_id ?? null
}

export function removePlayerFromEveryStoredRoom(playerId: string) {
  const rooms = getRooms()
  for (const room of Object.values(rooms)) {
    if (!room.players.some((p) => p.id === playerId)) continue
    const next = removePlayerFromRoom(room, playerId)
    upsertRoom(next)
    void upsertRoomRemote(next)
  }
}

/** Clears profile and removes this player from every cached room (syncs remote). */
export function invalidateLocalAccountSession(playerId: string) {
  removePlayerFromEveryStoredRoom(playerId)
  clearProfile()
}

export function startAccountSessionWatcher(onInvalidated: () => void): () => void {
  const INTERVAL_MS = 4000
  const tick = async () => {
    const profile = getProfile()
    if (!profile?.sessionId || !supabase) return

    const remote = await fetchActiveSessionIdForProfile(profile.id)
    if (remote === undefined) return
    if (remote === null) return

    const latest = getProfile()
    if (!latest?.sessionId || latest.id !== profile.id) return
    if (remote === latest.sessionId) return

    invalidateLocalAccountSession(profile.id)
    onInvalidated()
  }

  const id = globalThis.setInterval(() => {
    void tick()
  }, INTERVAL_MS)
  void tick()
  return () => globalThis.clearInterval(id)
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

function formatSupabaseError(prefix: string, message?: string) {
  if (!message) return prefix
  return `${prefix} (${message})`
}

function usernameToKey(username: string) {
  return username.trim().toLowerCase()
}

function requireSupabaseForAccounts() {
  if (!supabase) {
    throw new Error('Account service is unavailable. Please try again later.')
  }
  return supabase
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure password support is unavailable in this browser.')
  }
  return globalThis.crypto
}

async function createPasswordHash(password: string, saltInput?: string) {
  const cryptoRef = getCrypto()
  const encoder = new TextEncoder()
  const saltBytes = saltInput
    ? fromBase64(saltInput)
    : cryptoRef.getRandomValues(new Uint8Array(16))
  const keyMaterial = await cryptoRef.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derived = await cryptoRef.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations: 120000,
    },
    keyMaterial,
    256,
  )
  const hashBytes = new Uint8Array(derived)
  return {
    hash: toBase64(hashBytes),
    salt: toBase64(saltBytes),
    version: 1,
  }
}

async function verifyPassword(password: string, account: AccountRecord) {
  const next = await createPasswordHash(password, account.passwordSalt)
  return next.hash === account.passwordHash
}

function normalizeAccountRow(row: AccountRow): AccountRecord {
  if (row.password_hash && row.password_salt) {
    return {
      profileId: row.profile_id,
      username: row.username,
      usernameKey: row.username_key,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      passwordVersion: row.password_version ?? 1,
    }
  }

  const legacyPassword = row.password?.trim()
  if (!legacyPassword) {
    throw new Error('Account record is missing password credentials.')
  }

  return {
    profileId: row.profile_id,
    username: row.username,
    usernameKey: row.username_key,
    // Placeholder hash values are replaced during legacy password migration.
    passwordHash: legacyPassword,
    passwordSalt: '',
    passwordVersion: 0,
    legacyPassword,
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
  const client = requireSupabaseForAccounts()
  let query = client
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username, username_key, password_hash, password_salt, password_version, password')

  if (usernameKey) {
    query = query.eq('username_key', usernameKey)
  }

  let { data, error } = await query.returns<AccountRow[]>()

  // Backward compatibility for databases that still have only the legacy `password` column.
  if (error && /password_hash|password_salt|password_version/i.test(error.message)) {
    let legacyQuery = client
      .from(ACCOUNTS_TABLE)
      .select('profile_id, username, username_key, password')
    if (usernameKey) {
      legacyQuery = legacyQuery.eq('username_key', usernameKey)
    }
    const legacyResult = await legacyQuery.returns<LegacyAccountRow[]>()
    error = legacyResult.error
    data = (legacyResult.data ?? []).map((row) => ({
      profile_id: row.profile_id,
      username: row.username,
      username_key: row.username_key,
      password_hash: null,
      password_salt: null,
      password_version: 0,
      password: row.password,
    }))
  }

  if (error || !data) {
    throw new Error(formatSupabaseError('Could not load account records.', error?.message))
  }
  return data.map(normalizeAccountRow)
}

async function getAccounts() {
  const remote = await getAccountsRemote()
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
  const client = requireSupabaseForAccounts()
  const cleanUsername = username.trim()
  const cleanPassword = password.trim()
  const usernameKey = usernameToKey(cleanUsername)
  const accounts = await getAccounts()
  if (accounts.some((account) => account.usernameKey === usernameKey)) {
    throw new Error('Username is already taken.')
  }

  const passwordSecret = await createPasswordHash(cleanPassword)
  const sessionId = crypto.randomUUID()
  const next: AccountRecord = {
    profileId: crypto.randomUUID(),
    username: cleanUsername,
    usernameKey,
    passwordHash: passwordSecret.hash,
    passwordSalt: passwordSecret.salt,
    passwordVersion: passwordSecret.version,
  }

  const { error } = await client.from(ACCOUNTS_TABLE).insert({
    profile_id: next.profileId,
    username: next.username,
    username_key: next.usernameKey,
    password_hash: next.passwordHash,
    password_salt: next.passwordSalt,
    password_version: next.passwordVersion,
    active_session_id: sessionId,
  })
  if (error) {
    if (error.message.toLowerCase().includes('duplicate')) {
      throw new Error('Username is already taken.')
    }
    throw new Error(formatSupabaseError('Could not create account right now.', error.message))
  }

  const nextLocal = [...accounts, next]
  saveAccountsLocal(nextLocal)
  saveProfile({ id: next.profileId, username: next.username, sessionId })
  return { id: next.profileId, username: next.username }
}

export async function signInAccount(username: string, password: string) {
  validateAccountInput(username, password)
  const client = requireSupabaseForAccounts()
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

  if (account && account.passwordVersion === 0 && account.legacyPassword === cleanPassword) {
    const migrated = await createPasswordHash(cleanPassword)
    const { error } = await client
      .from(ACCOUNTS_TABLE)
      .update({
        password_hash: migrated.hash,
        password_salt: migrated.salt,
        password_version: migrated.version,
      })
      .eq('profile_id', account.profileId)
    if (!error) {
      account = {
        ...account,
        passwordHash: migrated.hash,
        passwordSalt: migrated.salt,
        passwordVersion: migrated.version,
        legacyPassword: undefined,
      }
    }
  }

  const matchesPassword =
    account?.passwordVersion === 0
      ? account.legacyPassword === cleanPassword
      : account
        ? await verifyPassword(cleanPassword, account)
        : false
  if (!account || !matchesPassword) {
    throw new Error('Invalid username or password.')
  }

  const sessionId = crypto.randomUUID()
  const { error: sessionErr } = await client
    .from(ACCOUNTS_TABLE)
    .update({ active_session_id: sessionId })
    .eq('profile_id', account.profileId)
  if (sessionErr) {
    throw new Error(formatSupabaseError('Could not start session.', sessionErr.message))
  }

  const existing = getProfile()
  saveProfile({
    id: account.profileId,
    username: account.username,
    avatarIcon: existing?.id === account.profileId ? existing.avatarIcon : undefined,
    sessionId,
  })
  return { id: account.profileId, username: account.username }
}

export async function deleteCurrentAccount() {
  const profile = getProfile()
  if (!profile) {
    throw new Error('No signed-in account to delete.')
  }
  const client = requireSupabaseForAccounts()
  const { error } = await client.from(ACCOUNTS_TABLE).delete().eq('profile_id', profile.id)
  if (error) {
    throw new Error(formatSupabaseError('Could not delete account right now.', error.message))
  }
  clearProfile()
}

function normalizeTimerScore(row: TimerScoreRow): TimerScore {
  return {
    id: row.id,
    profileId: row.profile_id,
    username: row.username,
    elapsedMs: row.elapsed_ms,
    createdAt: row.created_at,
  }
}

function sortTimerScores(scores: TimerScore[]): TimerScore[] {
  return scores.slice().sort((a, b) => {
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/** Match pending local rows to cloud rows (same client `created_at` we send on insert). */
function reconcileLocalScores(local: TimerScore[], remote: TimerScore[]): TimerScore[] {
  const remoteKeys = new Set(remote.map((r) => timerScoreKey(r)))
  return local.map((entry) => {
    if (entry.pendingSync && remoteKeys.has(timerScoreKey(entry))) {
      const match = remote.find((r) => timerScoreKey(r) === timerScoreKey(entry))
      if (match) return { ...match, pendingSync: false }
    }
    return entry
  })
}

/** Leaderboard view: server rows plus any runs still waiting to upload. */
function mergeRemoteWithPending(remote: TimerScore[], local: TimerScore[]): TimerScore[] {
  const byKey = new Map<string, TimerScore>()
  for (const r of remote) {
    byKey.set(timerScoreKey(r), { ...r, pendingSync: false })
  }
  for (const l of local) {
    if (l.pendingSync && !byKey.has(timerScoreKey(l))) {
      byKey.set(timerScoreKey(l), l)
    }
  }
  return sortTimerScores([...byKey.values()])
}

export function getTimerScoresLocal() {
  return loadJson<TimerScore[]>(TIMER_SCORES_KEY, [])
}

export function saveTimerScoresLocal(scores: TimerScore[]) {
  saveJson(TIMER_SCORES_KEY, scores)
}

let flushTimerScoresInFlight = false

/** Push pending local runs to Supabase; returns how many uploads succeeded. */
export async function flushPendingTimerScores(): Promise<number> {
  if (!supabase || flushTimerScoresInFlight) return 0
  flushTimerScoresInFlight = true
  let syncedCount = 0
  try {
    for (;;) {
      const pending = getTimerScoresLocal().filter((s) => s.pendingSync)
      if (!pending.length) break

      let progressed = false
      for (const score of pending) {
        const key = timerScoreKey(score)
        const { data, error } = await supabase
          .from(TIMER_SCORES_TABLE)
          .insert({
            profile_id: score.profileId,
            username: score.username,
            elapsed_ms: score.elapsedMs,
            created_at: score.createdAt,
          })
          .select('id, profile_id, username, elapsed_ms, created_at')
          .maybeSingle()

        if (error || !data) continue

        syncedCount += 1
        const normalized = { ...normalizeTimerScore(data as TimerScoreRow), pendingSync: false }
        const current = getTimerScoresLocal()
        const next = current.filter((s) => timerScoreKey(s) !== key)
        next.push(normalized)
        saveTimerScoresLocal(sortTimerScores(next))
        progressed = true
        break
      }

      if (!progressed) break
    }
    return syncedCount
  } finally {
    flushTimerScoresInFlight = false
  }
}

export async function getTimerScores(): Promise<TimerScore[]> {
  const local = sortTimerScores(getTimerScoresLocal())

  if (!supabase) {
    return local
  }

  const { data, error } = await supabase
    .from(TIMER_SCORES_TABLE)
    .select('id, profile_id, username, elapsed_ms, created_at')
    .order('elapsed_ms', { ascending: true })
    .returns<TimerScoreRow[]>()

  if (error || !data) {
    return local
  }

  const remote = data.map((row) => normalizeTimerScore(row))
  const reconciled = reconcileLocalScores(local, remote)
  const merged = mergeRemoteWithPending(remote, reconciled)
  saveTimerScoresLocal(merged)
  return merged
}

export async function addTimerScore(input: Omit<TimerScore, 'createdAt' | 'pendingSync'>) {
  const nextLocalScore: TimerScore = {
    ...input,
    createdAt: new Date().toISOString(),
    pendingSync: true,
  }
  const local = getTimerScoresLocal()
  saveTimerScoresLocal(sortTimerScores([...local, nextLocalScore]))

  if (!supabase) return

  const { data, error } = await supabase
    .from(TIMER_SCORES_TABLE)
    .insert({
      profile_id: input.profileId,
      username: input.username,
      elapsed_ms: input.elapsedMs,
      created_at: nextLocalScore.createdAt,
    })
    .select('id, profile_id, username, elapsed_ms, created_at')
    .maybeSingle()

  if (error || !data) {
    return
  }

  const synced = { ...normalizeTimerScore(data as TimerScoreRow), pendingSync: false }
  const latest = getTimerScoresLocal()
  const without = latest.filter((s) => timerScoreKey(s) !== timerScoreKey(nextLocalScore))
  saveTimerScoresLocal(sortTimerScores([...without, synced]))
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

export async function updateTimerScoreElapsedMs(
  input: Pick<TimerScore, 'id' | 'profileId' | 'elapsedMs' | 'createdAt'> & { nextElapsedMs: number },
) {
  const local = getTimerScoresLocal()
  const nextLocal = local.map((score) => {
    const isTargetById = input.id !== undefined && score.id === input.id
    const isTargetByFallback = score.profileId === input.profileId && score.createdAt === input.createdAt
    if (isTargetById || isTargetByFallback) {
      return { ...score, elapsedMs: input.nextElapsedMs }
    }
    return score
  })
  saveTimerScoresLocal(sortTimerScores(nextLocal))

  if (!supabase) return

  const query = supabase.from(TIMER_SCORES_TABLE).update({ elapsed_ms: input.nextElapsedMs })
  const match = input.id !== undefined
    ? query.eq('id', input.id)
    : query.eq('profile_id', input.profileId).eq('created_at', input.createdAt)
  const { data, error } = await match.select('id').maybeSingle()
  if (error) {
    throw new Error(formatSupabaseError('Could not update timer attempt.', error.message))
  }
  if (!data) {
    throw new Error('Could not update timer attempt. The score record was not found.')
  }
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
