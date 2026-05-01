import { supabase } from '../../lib/supabase'
import { ACCOUNTS_TABLE, FRIENDSHIPS_TABLE } from './socialConstants'

export interface FriendRecord {
  friendProfileId: string
  friendUsername: string
  createdAt: string
}

export interface PendingIncomingRequest {
  id: string
  requesterProfileId: string
  requesterUsername: string
  createdAt: string
}

type FriendshipRow = {
  id: string
  requester_profile_id: string
  recipient_profile_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export async function lookupAccountByUsername(username: string): Promise<{
  profile_id: string
  username: string
} | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username')
    .eq('username_key', normalizeUsername(username))
    .maybeSingle<{ profile_id: string; username: string }>()
  return data ?? null
}

export async function searchAccountsByPrefix(
  usernamePrefix: string,
  limit = 3,
): Promise<{ profile_id: string; username: string }[]> {
  if (!supabase) return []
  const normalized = normalizeUsername(usernamePrefix)
  if (!normalized) return []
  const { data, error } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username')
    .ilike('username_key', `${normalized}%`)
    .order('username_key', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 10)))
    .returns<{ profile_id: string; username: string }[]>()
  if (error || !data) return []
  return data
}

function pairOrFilter(a: string, b: string) {
  return `and(requester_profile_id.eq.${a},recipient_profile_id.eq.${b}),and(requester_profile_id.eq.${b},recipient_profile_id.eq.${a})`
}

async function fetchPairRow(viewerId: string, otherId: string): Promise<FriendshipRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('id, requester_profile_id, recipient_profile_id, status, created_at')
    .or(pairOrFilter(viewerId, otherId))
    .maybeSingle<FriendshipRow>()
  if (error) return null
  return data ?? null
}

export type SocialRelationship =
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'friends'
  | 'declined'

export async function getSocialRelationship(
  viewerId: string,
  otherId: string,
): Promise<{ relationship: SocialRelationship; rowId: string | null }> {
  if (viewerId === otherId) {
    return { relationship: 'none', rowId: null }
  }
  const row = await fetchPairRow(viewerId, otherId)
  if (!row) return { relationship: 'none', rowId: null }
  if (row.status === 'accepted') return { relationship: 'friends', rowId: row.id }
  if (row.status === 'declined') return { relationship: 'declined', rowId: row.id }
  if (row.status === 'pending') {
    if (row.requester_profile_id === viewerId) return { relationship: 'pending_outgoing', rowId: row.id }
    return { relationship: 'pending_incoming', rowId: row.id }
  }
  return { relationship: 'none', rowId: null }
}

async function lookupUsername(profileId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('username')
    .eq('profile_id', profileId)
    .maybeSingle<{ username: string }>()
  return data?.username ?? null
}

export async function getAcceptedFriends(profileId: string): Promise<FriendRecord[]> {
  if (!supabase) {
    throw new Error('Friends service is unavailable. Configure Supabase env.')
  }

  const { data: rows, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('requester_profile_id, recipient_profile_id, created_at, status')
    .eq('status', 'accepted')
    .or(`requester_profile_id.eq.${profileId},recipient_profile_id.eq.${profileId}`)
    .returns<
      {
        requester_profile_id: string
        recipient_profile_id: string
        created_at: string
      }[]
    >()

  if (error) {
    throw new Error(`Could not load friends. (${error.message})`)
  }

  const list = rows ?? []
  const friendIds = list.map((row) =>
    row.requester_profile_id === profileId ? row.recipient_profile_id : row.requester_profile_id,
  )
  const uniqueIds = [...new Set(friendIds)]

  const usernameById: Record<string, string> = {}
  await Promise.all(
    uniqueIds.map(async (id) => {
      const u = await lookupUsername(id)
      if (u) usernameById[id] = u
    }),
  )

  return list.map((row) => {
    const friendId =
      row.requester_profile_id === profileId ? row.recipient_profile_id : row.requester_profile_id
    return {
      friendProfileId: friendId,
      friendUsername: usernameById[friendId] ?? 'Player',
      createdAt: row.created_at,
    }
  })
}

export async function sendFriendRequestByUsername(viewerProfileId: string, username: string): Promise<void> {
  if (!supabase) {
    throw new Error('Friends service is unavailable. Configure Supabase env.')
  }

  const trimmed = username.trim()
  if (!trimmed) throw new Error('Enter a username to add.')

  const { data: account, error: accountError } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username')
    .eq('username_key', normalizeUsername(trimmed))
    .maybeSingle<{ profile_id: string; username: string }>()

  if (accountError) {
    throw new Error(`Could not find that player. (${accountError.message})`)
  }
  if (!account) {
    throw new Error('No account found with that username.')
  }
  const targetId = account.profile_id
  if (targetId === viewerProfileId) {
    throw new Error('You cannot add yourself as a friend.')
  }

  const existing = await fetchPairRow(viewerProfileId, targetId)
  if (!existing) {
    const { error: insError } = await supabase.from(FRIENDSHIPS_TABLE).insert({
      requester_profile_id: viewerProfileId,
      recipient_profile_id: targetId,
      status: 'pending',
    })
    if (insError) {
      throw new Error(`Could not send request. (${insError.message})`)
    }
    return
  }

  if (existing.status === 'accepted') {
    throw new Error(`${account.username} is already your friend.`)
  }
  if (existing.status === 'pending') {
    if (existing.requester_profile_id === viewerProfileId) {
      throw new Error('Friend request already pending.')
    }
    throw new Error('This player already sent you a request. Accept it in Social.')
  }
  if (existing.status === 'declined') {
    const { error: updError } = await supabase
      .from(FRIENDSHIPS_TABLE)
      .update({
        requester_profile_id: viewerProfileId,
        recipient_profile_id: targetId,
        status: 'pending',
      })
      .eq('id', existing.id)
    if (updError) {
      throw new Error(`Could not send request. (${updError.message})`)
    }
  }
}

export async function acceptFriendRequest(recipientProfileId: string, friendshipId: string) {
  if (!supabase) throw new Error('Friends service is unavailable.')
  const { error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('recipient_profile_id', recipientProfileId)
    .eq('status', 'pending')
  if (error) throw new Error(`Could not accept request. (${error.message})`)
}

export async function declineFriendRequest(recipientProfileId: string, friendshipId: string) {
  if (!supabase) throw new Error('Friends service is unavailable.')
  const { error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .update({ status: 'declined' })
    .eq('id', friendshipId)
    .eq('recipient_profile_id', recipientProfileId)
    .eq('status', 'pending')
  if (error) throw new Error(`Could not decline request. (${error.message})`)
}

export async function cancelOutgoingFriendRequest(requesterProfileId: string, friendshipId: string) {
  if (!supabase) throw new Error('Friends service is unavailable.')
  const { error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .delete()
    .eq('id', friendshipId)
    .eq('requester_profile_id', requesterProfileId)
    .eq('status', 'pending')
  if (error) throw new Error(`Could not cancel request. (${error.message})`)
}

export async function unfriend(profileId: string, friendProfileId: string) {
  if (!supabase) throw new Error('Friends service is unavailable.')
  const row = await fetchPairRow(profileId, friendProfileId)
  if (!row || row.status !== 'accepted') return
  const { error } = await supabase.from(FRIENDSHIPS_TABLE).delete().eq('id', row.id)
  if (error) throw new Error(`Could not unfriend. (${error.message})`)
}

export type PendingOutgoingRequest = {
  id: string
  recipientProfileId: string
  recipientUsername: string
  createdAt: string
}

export type AcceptedOutgoingRequest = {
  id: string
  recipientProfileId: string
  recipientUsername: string
  approvedAt: string
}

export async function listPendingOutgoing(profileId: string): Promise<PendingOutgoingRequest[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('id, recipient_profile_id, created_at')
    .eq('requester_profile_id', profileId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<{ id: string; recipient_profile_id: string; created_at: string }[]>()

  if (error || !data) return []

  const out: PendingOutgoingRequest[] = []
  for (const row of data) {
    const name = (await lookupUsername(row.recipient_profile_id)) ?? 'Player'
    out.push({
      id: row.id,
      recipientProfileId: row.recipient_profile_id,
      recipientUsername: name,
      createdAt: row.created_at,
    })
  }
  return out
}

export async function listAcceptedOutgoing(profileId: string): Promise<AcceptedOutgoingRequest[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('id, recipient_profile_id, created_at')
    .eq('requester_profile_id', profileId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<{ id: string; recipient_profile_id: string; created_at: string }[]>()

  if (error || !data) return []

  const out: AcceptedOutgoingRequest[] = []
  for (const row of data) {
    const name = (await lookupUsername(row.recipient_profile_id)) ?? 'Player'
    out.push({
      id: row.id,
      recipientProfileId: row.recipient_profile_id,
      recipientUsername: name,
      approvedAt: row.created_at,
    })
  }
  return out
}

export async function listPendingIncoming(profileId: string): Promise<PendingIncomingRequest[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('id, requester_profile_id, created_at, status')
    .eq('recipient_profile_id', profileId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<{ id: string; requester_profile_id: string; created_at: string; status: string }[]>()

  if (error || !data) return []

  const out: PendingIncomingRequest[] = []
  for (const row of data) {
    const name = (await lookupUsername(row.requester_profile_id)) ?? 'Player'
    out.push({
      id: row.id,
      requesterProfileId: row.requester_profile_id,
      requesterUsername: name,
      createdAt: row.created_at,
    })
  }
  return out
}

export async function countPendingIncoming(profileId: string): Promise<number> {
  if (!supabase) return 0
  const { count, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('recipient_profile_id', profileId)
    .eq('status', 'pending')
  if (error) return 0
  return count ?? 0
}

export async function fetchUsernameForProfileId(profileId: string): Promise<string | null> {
  return lookupUsername(profileId)
}
