// Supabase Edge Function: send push notifications for social/timer events.
// Configure DB webhooks to POST table changes here (friendships, feed_posts,
// head_to_head_games, timer_pool_scores).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

type WebhookPayload = {
  type?: string
  table?: string
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
}

type PushRow = {
  profile_id: string
  expo_push_token: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchUsername(profileId: string): Promise<string> {
  const { data } = await supabase
    .from('user_accounts')
    .select('username')
    .eq('profile_id', profileId)
    .maybeSingle<{ username: string }>()
  return data?.username ?? 'Player'
}

async function acceptedFriendIds(profileId: string): Promise<string[]> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_profile_id, recipient_profile_id')
    .eq('status', 'accepted')
    .or(`requester_profile_id.eq.${profileId},recipient_profile_id.eq.${profileId}`)
    .returns<Array<{ requester_profile_id: string; recipient_profile_id: string }>>()
  if (!data) return []
  const set = new Set<string>()
  for (const row of data) {
    set.add(row.requester_profile_id === profileId ? row.recipient_profile_id : row.requester_profile_id)
  }
  return [...set]
}

async function top5ProfileIdsByBestTime(): Promise<Set<string>> {
  const { data } = await supabase
    .from('timer_pool_scores')
    .select('profile_id, elapsed_ms')
    .order('elapsed_ms', { ascending: true })
    .limit(4000)
    .returns<Array<{ profile_id: string; elapsed_ms: number }>>()
  if (!data?.length) return new Set()
  const bestByProfile = new Map<string, number>()
  for (const row of data) {
    const cur = bestByProfile.get(row.profile_id)
    if (cur === undefined || row.elapsed_ms < cur) bestByProfile.set(row.profile_id, row.elapsed_ms)
  }
  const ids = [...bestByProfile.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map((entry) => entry[0])
  return new Set(ids)
}

async function isNewPb(profileId: string, elapsedMs: number, createdAt: string): Promise<boolean> {
  const { data } = await supabase
    .from('timer_pool_scores')
    .select('elapsed_ms, created_at')
    .eq('profile_id', profileId)
    .lt('created_at', createdAt)
    .order('elapsed_ms', { ascending: true })
    .limit(1)
    .returns<Array<{ elapsed_ms: number; created_at: string }>>()
  // If this is the first recorded score, treat it as a PB event.
  if (!data?.length) return true
  const previousBest = data[0]?.elapsed_ms
  if (typeof previousBest !== 'number' || !Number.isFinite(previousBest)) return false
  return elapsedMs < previousBest
}

async function fetchPushRows(profileIds: string[]): Promise<PushRow[]> {
  if (!profileIds.length) return []
  const unique = [...new Set(profileIds.filter(Boolean))]
  if (!unique.length) return []
  const out: PushRow[] = []
  for (const part of chunk(unique, 200)) {
    const { data } = await supabase
      .from('push_device_tokens')
      .select('profile_id, expo_push_token')
      .eq('enabled', true)
      .in('profile_id', part)
      .returns<PushRow[]>()
    out.push(...(data ?? []))
  }
  return out
}

function isDeviceNotRegisteredError(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const details = value as { error?: unknown }
  return details.error === 'DeviceNotRegistered'
}

async function disablePushTokens(tokens: string[], reason: string): Promise<void> {
  const unique = [...new Set(tokens.filter(Boolean))]
  if (!unique.length) return
  const { error } = await supabase
    .from('push_device_tokens')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .in('expo_push_token', unique)
  if (error) {
    console.error('Failed disabling push tokens', reason, error.message)
  }
}

async function fetchExpoReceiptsAndDisableInvalidTokens(ticketToToken: Map<string, string>): Promise<void> {
  const receiptIds = [...ticketToToken.keys()]
  if (!receiptIds.length) return
  const invalidTokens = new Set<string>()
  for (const idsPart of chunk(receiptIds, 300)) {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsPart }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('Expo receipts fetch failed', res.status, text)
      continue
    }
    const payload = (await res.json()) as {
      data?: Record<string, { status?: string; details?: { error?: string } }>
    }
    const receipts = payload.data ?? {}
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt?.status === 'error' && isDeviceNotRegisteredError(receipt.details)) {
        const token = ticketToToken.get(receiptId)
        if (token) invalidTokens.add(token)
      }
    }
  }
  if (invalidTokens.size) {
    await disablePushTokens([...invalidTokens], 'expo_receipt_device_not_registered')
  }
}

async function sendExpoPush(
  recipients: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const rows = await fetchPushRows(recipients)
  if (!rows.length) return
  const messages = rows.map((row) => ({
    to: row.expo_push_token,
    title,
    body,
    data: { ...data, toProfileId: row.profile_id },
    sound: 'default',
  }))
  const invalidTokens = new Set<string>()
  const ticketToToken = new Map<string, string>()
  for (const part of chunk(messages, 100)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('Expo push send failed', res.status, text)
      continue
    }
    const payload = (await res.json()) as {
      data?: Array<{ id?: string; status?: string; details?: { error?: string } }>
    }
    const tickets = payload.data ?? []
    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i]
      const token = part[i]?.to
      if (!token) continue
      if (ticket?.status === 'ok' && ticket.id) {
        ticketToToken.set(ticket.id, token)
        continue
      }
      if (ticket?.status === 'error' && isDeviceNotRegisteredError(ticket.details)) {
        invalidTokens.add(token)
      }
    }
  }
  if (invalidTokens.size) {
    await disablePushTokens([...invalidTokens], 'expo_ticket_device_not_registered')
  }
  await fetchExpoReceiptsAndDisableInvalidTokens(ticketToToken)
}

async function notifyFriendship(payload: WebhookPayload): Promise<void> {
  if (payload.table !== 'friendships') return
  const row = payload.record ?? {}
  const status = asString(row.status)
  const requester = asString(row.requester_profile_id)
  const recipient = asString(row.recipient_profile_id)
  const rowId = asString(row.id)
  if (!requester || !recipient || !rowId) return

  if (payload.type === 'INSERT' && status === 'pending') {
    const requesterName = await fetchUsername(requester)
    await sendExpoPush(
      [recipient],
      'New friend request',
      `${requesterName} wants to connect with you.`,
      { type: 'friend_request', id: `friend_request:${rowId}` },
    )
  }

  const oldStatus = asString(payload.old_record?.status)
  if (payload.type === 'UPDATE' && oldStatus !== 'accepted' && status === 'accepted') {
    const recipientName = await fetchUsername(recipient)
    await sendExpoPush(
      [requester],
      'Friend request accepted',
      `${recipientName} accepted your friend request.`,
      { type: 'friend_accepted', id: `friend_accepted:${rowId}` },
    )
  }
}

async function notifyFeedPost(payload: WebhookPayload): Promise<void> {
  if (payload.table !== 'feed_posts' || payload.type !== 'INSERT') return
  const row = payload.record ?? {}
  const postId = asString(row.id)
  const poster = asString(row.poster_profile_id)
  const opponent = asString(row.opponent_profile_id)
  if (!postId || !poster) return
  const friends = await acceptedFriendIds(poster)
  const recipients = friends.filter((id) => id !== poster)
  if (!recipients.length) return

  const posterName = await fetchUsername(poster)
  const opponentName = opponent ? await fetchUsername(opponent) : null
  const body = opponentName
    ? `${posterName} shared a post with ${opponentName}.`
    : `${posterName} shared a new post.`
  await sendExpoPush(recipients, 'New social post', body, {
    type: 'post',
    id: `post:${postId}`,
    actorProfileId: poster,
  })
}

async function notifyGame(payload: WebhookPayload): Promise<void> {
  if (payload.table !== 'head_to_head_games' || payload.type !== 'INSERT') return
  const row = payload.record ?? {}
  const gameId = asString(row.id)
  const p1 = asString(row.player_one_profile_id)
  const p2 = asString(row.player_two_profile_id)
  const winner = asString(row.winner_profile_id)
  if (!gameId || !p1 || !p2) return

  const [name1, name2] = await Promise.all([fetchUsername(p1), fetchUsername(p2)])
  // Game records are posted by player one in current app flow.
  // Notify only the other participant (player two).
  const p2Won = winner === p2
  await sendExpoPush([p2], 'Challenge result recorded', `Your ${p2Won ? 'win' : 'loss'} against ${name1} was recorded.`, {
    type: 'game',
    id: `game:${gameId}`,
    actorProfileId: p1,
  })
}

async function notifyPb(payload: WebhookPayload): Promise<void> {
  if (payload.table !== 'timer_pool_scores' || payload.type !== 'INSERT') return
  const row = payload.record ?? {}
  const actor = asString(row.profile_id)
  const createdAt = asString(row.created_at)
  const elapsedMs = asNumber(row.elapsed_ms)
  if (!actor || !createdAt || elapsedMs === null) return

  const pb = await isNewPb(actor, elapsedMs, createdAt)
  if (!pb) return

  const actorName = asString(row.username) ?? (await fetchUsername(actor))
  const friends = await acceptedFriendIds(actor)
  const top5 = await top5ProfileIdsByBestTime()
  let recipients: string[] = friends
  if (top5.has(actor)) {
    const { data } = await supabase
      .from('user_accounts')
      .select('profile_id')
      .returns<Array<{ profile_id: string }>>()
    recipients = (data ?? []).map((r) => r.profile_id)
  }
  recipients = recipients.filter((id) => id !== actor)
  if (!recipients.length) return

  await sendExpoPush(
    recipients,
    'New personal best',
    `${actorName} set a new personal best.`,
    { type: 'pb', actorProfileId: actor, createdAt },
  )
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }
  try {
    const payload = (await req.json()) as WebhookPayload
    await Promise.all([
      notifyFriendship(payload),
      notifyFeedPost(payload),
      notifyGame(payload),
      notifyPb(payload),
    ])
    return Response.json({ ok: true })
  } catch (error) {
    console.error(error)
    return Response.json({ ok: false }, { status: 500 })
  }
})
