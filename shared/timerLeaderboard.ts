/**
 * Pure timer leaderboard helpers shared by web (Vite) and React Native (Metro).
 * Keep this module free of DOM, React Native, or bundler-specific APIs.
 */

export type TimerScoreLike = {
  profileId: string
  username: string
  elapsedMs: number
  createdAt: string
}

export type ProfileLike = {
  id: string
  username: string
}

export function timerScoreBelongsToProfile(score: TimerScoreLike, profile: ProfileLike): boolean {
  if (score.profileId === profile.id) return true
  const name = profile.username.trim().toLowerCase()
  if (!name) return false
  return score.username.trim().toLowerCase() === name
}

export function timerScoreKey(score: Pick<TimerScoreLike, 'profileId' | 'elapsedMs' | 'createdAt'>): string {
  return `${score.profileId}__${score.elapsedMs}__${score.createdAt}`
}

export function formatTimerElapsedMs(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  const centiseconds = Math.floor((ms % 1_000) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

/** e.g. "21 Apr" for recent runs (day + short month). */
export function formatRecentRunDayMonth(iso: string, locale?: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(locale ?? 'en-GB', { day: 'numeric', month: 'short' })
}
