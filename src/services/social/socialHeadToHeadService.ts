import { supabase } from '../../lib/supabase'
import { HEAD_TO_HEAD_TABLE } from './socialConstants'

export type HeadToHeadRow = {
  id: string
  player_one_profile_id: string
  player_two_profile_id: string
  winner_profile_id: string
  player_one_balls_remaining: number
  player_two_balls_remaining: number
  played_at: string
}

export async function insertHeadToHeadGame(params: {
  playerOneProfileId: string
  playerTwoProfileId: string
  winnerProfileId: string
  playerOneBallsRemaining: number
  playerTwoBallsRemaining: number
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (params.playerOneProfileId === params.playerTwoProfileId) {
    throw new Error('Pick two different players.')
  }
  if (
    params.winnerProfileId !== params.playerOneProfileId &&
    params.winnerProfileId !== params.playerTwoProfileId
  ) {
    throw new Error('Winner must be one of the two players.')
  }
  const { error } = await supabase.from(HEAD_TO_HEAD_TABLE).insert({
    player_one_profile_id: params.playerOneProfileId,
    player_two_profile_id: params.playerTwoProfileId,
    winner_profile_id: params.winnerProfileId,
    player_one_balls_remaining: params.playerOneBallsRemaining,
    player_two_balls_remaining: params.playerTwoBallsRemaining,
  })
  if (error) throw new Error(`Could not save game. (${error.message})`)
}

function involvesPlayer(row: HeadToHeadRow, profileId: string) {
  return row.player_one_profile_id === profileId || row.player_two_profile_id === profileId
}

function viewerBalls(row: HeadToHeadRow, profileId: string) {
  return row.player_one_profile_id === profileId
    ? row.player_one_balls_remaining
    : row.player_two_balls_remaining
}

function opponentBalls(row: HeadToHeadRow, profileId: string) {
  return row.player_one_profile_id === profileId
    ? row.player_two_balls_remaining
    : row.player_one_balls_remaining
}

/** Win: +{loser balls remaining}; loss: −{your balls remaining}. */
export function formatChallengeBallsMarginLabel(viewerWon: boolean, loserBallsRemaining: number): string {
  return viewerWon ? `+${loserBallsRemaining} balls` : `-${loserBallsRemaining} balls`
}

export function formatHeadToHeadBallsLabel(row: HeadToHeadRow, viewerId: string): string {
  const viewerWon = row.winner_profile_id === viewerId
  const loserBallsRemaining = viewerWon ? opponentBalls(row, viewerId) : viewerBalls(row, viewerId)
  return formatChallengeBallsMarginLabel(viewerWon, loserBallsRemaining)
}

export async function listHeadToHeadForPair(
  profileIdA: string,
  profileIdB: string,
  limit = 20,
): Promise<HeadToHeadRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(HEAD_TO_HEAD_TABLE)
    .select(
      'id, player_one_profile_id, player_two_profile_id, winner_profile_id, player_one_balls_remaining, player_two_balls_remaining, played_at',
    )
    .or(
      `and(player_one_profile_id.eq.${profileIdA},player_two_profile_id.eq.${profileIdB}),and(player_one_profile_id.eq.${profileIdB},player_two_profile_id.eq.${profileIdA})`,
    )
    .order('played_at', { ascending: false })
    .limit(limit)
    .returns<HeadToHeadRow[]>()
  if (error || !data) return []
  return data
}

export async function listHeadToHeadForProfile(profileId: string, limit = 30): Promise<HeadToHeadRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(HEAD_TO_HEAD_TABLE)
    .select(
      'id, player_one_profile_id, player_two_profile_id, winner_profile_id, player_one_balls_remaining, player_two_balls_remaining, played_at',
    )
    .or(`player_one_profile_id.eq.${profileId},player_two_profile_id.eq.${profileId}`)
    .order('played_at', { ascending: false })
    .limit(limit)
    .returns<HeadToHeadRow[]>()
  if (error || !data) return []
  return data
}

export type HeadToHeadSummary = {
  games: number
  wins: number
  losses: number
  totalBallsFor: number | null
  totalBallsAgainst: number | null
}

export function summarizeHeadToHeadForViewer(rows: HeadToHeadRow[], viewerId: string): HeadToHeadSummary {
  const relevant = rows.filter((r) => involvesPlayer(r, viewerId))
  if (!relevant.length) {
    return { games: 0, wins: 0, losses: 0, totalBallsFor: null, totalBallsAgainst: null }
  }
  let wins = 0
  let losses = 0
  let sumFor = 0
  let sumAgainst = 0
  for (const row of relevant) {
    if (row.winner_profile_id === viewerId) wins += 1
    else losses += 1
    sumFor += viewerBalls(row, viewerId)
    sumAgainst += opponentBalls(row, viewerId)
  }
  const n = relevant.length
  return {
    games: n,
    wins,
    losses,
    totalBallsFor: sumFor,
    totalBallsAgainst: sumAgainst,
  }
}
