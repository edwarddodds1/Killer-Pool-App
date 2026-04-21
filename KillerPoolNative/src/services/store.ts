import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile, RoomState, TimerScore } from '../types/domain';
import { removePlayerFromRoom } from './game';
import { supabase } from './supabase';

const ROOMS_KEY = 'killer_pool_rooms_v1';
const PROFILE_KEY = 'killer_pool_profile_v1';
const TIMER_SCORES_KEY = 'killer_pool_timer_scores_v1';
const ROOMS_TABLE = 'killer_rooms';
const TIMER_SCORES_TABLE = 'timer_pool_scores';
const ACCOUNTS_TABLE = 'user_accounts';

type RoomIndex = Record<string, RoomState>;

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getProfile(): Promise<Profile | null> {
  return loadJson<Profile | null>(PROFILE_KEY, null);
}

export async function saveProfile(profile: Profile): Promise<void> {
  await saveJson(PROFILE_KEY, profile);
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
}

export async function fetchActiveSessionIdForProfile(
  profileId: string,
): Promise<string | null | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('active_session_id')
    .eq('profile_id', profileId)
    .maybeSingle<{ active_session_id: string | null }>();
  if (error) return undefined;
  if (!data) return null;
  return data.active_session_id ?? null;
}

async function removePlayerFromEveryStoredRoom(playerId: string): Promise<void> {
  const rooms = await getRooms();
  for (const room of Object.values(rooms)) {
    if (!room.players.some((p) => p.id === playerId)) continue;
    const next = removePlayerFromRoom(room, playerId);
    await upsertRoom(next);
    await upsertRoomRemote(next);
  }
}

export async function invalidateLocalAccountSession(playerId: string): Promise<void> {
  await removePlayerFromEveryStoredRoom(playerId);
  await clearProfile();
}

/** Polls Supabase; calls onInvalidated after clearing storage (caller should sync React state / navigation). */
export function startAccountSessionPolling(
  getProfileSnapshot: () => Promise<Profile | null>,
  onInvalidated: () => void | Promise<void>,
): () => void {
  const INTERVAL_MS = 4000;
  const tick = async () => {
    const profile = await getProfileSnapshot();
    if (!profile?.sessionId || !supabase) return;
    const remote = await fetchActiveSessionIdForProfile(profile.id);
    if (remote === undefined) return;
    if (remote === null) return;
    const latest = await getProfileSnapshot();
    if (!latest?.sessionId || latest.id !== profile.id) return;
    if (remote === latest.sessionId) return;
    await invalidateLocalAccountSession(profile.id);
    await onInvalidated();
  };
  const id = globalThis.setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  void tick();
  return () => globalThis.clearInterval(id);
}

export async function getRooms(): Promise<RoomIndex> {
  return loadJson<RoomIndex>(ROOMS_KEY, {});
}

export async function getRoom(code: string): Promise<RoomState | undefined> {
  const rooms = await getRooms();
  return rooms[code];
}

export async function upsertRoom(room: RoomState, oldCode?: string): Promise<void> {
  const rooms = await getRooms();
  if (oldCode && oldCode !== room.code) delete rooms[oldCode];
  rooms[room.code] = room;
  await saveJson(ROOMS_KEY, rooms);
}

export async function getRoomRemote(code: string): Promise<RoomState | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from(ROOMS_TABLE)
    .select('code, state, updated_at')
    .eq('code', code)
    .maybeSingle<{ code: string; state: RoomState; updated_at?: string }>();
  return data?.state ?? null;
}

export async function upsertRoomRemote(room: RoomState, oldCode?: string): Promise<void> {
  if (!supabase) return;
  if (oldCode && oldCode !== room.code) {
    await supabase.from(ROOMS_TABLE).delete().eq('code', oldCode);
  }
  await supabase.from(ROOMS_TABLE).upsert({
    code: room.code,
    state: room,
    updated_at: new Date().toISOString(),
  });
}

export async function getTimerScores(): Promise<TimerScore[]> {
  const local = await loadJson<TimerScore[]>(TIMER_SCORES_KEY, []);
  if (!supabase) return local;
  const { data, error } = await supabase
    .from(TIMER_SCORES_TABLE)
    .select('profile_id, username, elapsed_ms, created_at')
    .order('elapsed_ms', { ascending: true });
  if (error || !data) return local;
  return data.map((row) => ({
    profileId: row.profile_id as string,
    username: row.username as string,
    elapsedMs: row.elapsed_ms as number,
    createdAt: row.created_at as string,
  }));
}

export async function addTimerScore(input: Omit<TimerScore, 'createdAt'>): Promise<void> {
  const nextLocal: TimerScore = { ...input, createdAt: new Date().toISOString() };
  const local = await loadJson<TimerScore[]>(TIMER_SCORES_KEY, []);
  await saveJson(TIMER_SCORES_KEY, [...local, nextLocal]);
  if (!supabase) return;
  await supabase.from(TIMER_SCORES_TABLE).insert({
    profile_id: input.profileId,
    username: input.username,
    elapsed_ms: input.elapsedMs,
  });
}

export async function deleteTimerScore(
  input: Pick<TimerScore, 'profileId' | 'elapsedMs' | 'createdAt'>,
): Promise<void> {
  const local = await loadJson<TimerScore[]>(TIMER_SCORES_KEY, []);
  const nextLocal = local.filter(
    (score) =>
      !(
        score.profileId === input.profileId &&
        score.elapsedMs === input.elapsedMs &&
        score.createdAt === input.createdAt
      ),
  );
  await saveJson(TIMER_SCORES_KEY, nextLocal);
  if (!supabase) return;
  await supabase
    .from(TIMER_SCORES_TABLE)
    .delete()
    .eq('profile_id', input.profileId)
    .eq('elapsed_ms', input.elapsedMs)
    .eq('created_at', input.createdAt);
}
