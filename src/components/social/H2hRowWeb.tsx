import type { HeadToHeadRow } from '../../services/social/socialHeadToHeadService'

export function H2hRowWeb({
  row,
  viewerId,
  names,
}: {
  row: HeadToHeadRow
  viewerId: string
  names: Record<string, string>
}) {
  const opp = row.player_one_profile_id === viewerId ? row.player_two_profile_id : row.player_one_profile_id
  const oppName = names[opp] ?? 'Opponent'
  const won = row.winner_profile_id === viewerId
  const myBalls = row.player_one_profile_id === viewerId ? row.player_one_balls_remaining : row.player_two_balls_remaining
  const theirBalls = row.player_one_profile_id === viewerId ? row.player_two_balls_remaining : row.player_one_balls_remaining
  return (
    <li className="socialH2hItem">
      vs {oppName} · {won ? 'W' : 'L'} · {myBalls}-{theirBalls} balls — {new Date(row.played_at).toLocaleString()}
    </li>
  )
}
