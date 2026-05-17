import { formatHeadToHeadBallsLabel, type HeadToHeadRow } from '../../services/social/socialHeadToHeadService'

const DAY_FIRST_DATE_LOCALE = 'en-GB'

function formatRelativeTimestamp(iso: string) {
  const createdMs = new Date(iso).getTime()
  if (!Number.isFinite(createdMs)) return ''
  const elapsedMs = Date.now() - createdMs
  if (elapsedMs < 0) {
    return new Date(createdMs).toLocaleDateString(DAY_FIRST_DATE_LOCALE, { day: 'numeric', month: 'short' })
  }

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (elapsedMs < hourMs) {
    const minutes = Math.max(1, Math.floor(elapsedMs / minuteMs))
    return `${minutes} min ago`
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs)
    return `${hours}h ago`
  }
  if (elapsedMs < 4 * dayMs) {
    const days = Math.floor(elapsedMs / dayMs)
    return `${days}d ago`
  }
  return new Date(createdMs).toLocaleDateString(DAY_FIRST_DATE_LOCALE, { day: 'numeric', month: 'short' })
}

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
  const ballsLabel = formatHeadToHeadBallsLabel(row, viewerId)
  const timestampLabel = formatRelativeTimestamp(row.played_at)
  return (
    <li className={`socialH2hItem ${won ? 'socialH2hItem--win' : 'socialH2hItem--loss'}`}>
      vs {oppName} · {won ? 'W' : 'L'} · {ballsLabel} — {timestampLabel}
    </li>
  )
}
