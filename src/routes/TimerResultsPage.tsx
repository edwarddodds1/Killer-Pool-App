import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { Avatar } from '../components/social/Avatar'
import type { TimerScore } from '../types'
import {
  formatTimerElapsedMs,
  timerScoreBelongsToProfile,
  timerScoreKey,
} from '../../shared/timerLeaderboard'
import {
  deleteTimerScore,
  flushPendingTimerScores,
  getProfile,
  getTimerScores,
  getTimerScoresLocal,
} from '../utils/store'
import { isSupabaseEnabled } from '../lib/supabase'

const ADMIN_USERNAMES = new Set(['edwarddodds1'])
const LEADERBOARD_FRESH_WINDOW_MS = 48 * 60 * 60 * 1000

function formatDateLabel(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function isLeaderboardRecent(iso: string) {
  const createdMs = new Date(iso).getTime()
  if (!Number.isFinite(createdMs)) return false
  return Date.now() - createdMs <= LEADERBOARD_FRESH_WINDOW_MS
}

function TimerDeleteIconButton({
  disabled,
  busy,
  onClick,
  onKeyDown,
}: {
  disabled?: boolean
  busy?: boolean
  onClick: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  return (
    <button
      type="button"
      className="timerDeleteBtn timerDeleteBtn--icon"
      disabled={disabled || busy}
      aria-label={busy ? 'Deleting' : 'Delete attempt'}
      title="Delete"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {busy ? (
        <span className="timerDeleteBtn__busy" aria-hidden>
          …
        </span>
      ) : (
        <svg
          className="timerDeleteIcon"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M4 7h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 7v11a2 2 0 002 2h4a2 2 0 002-2V7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

function leaderboardAvatarId(score: Pick<TimerScore, 'profileId' | 'username'>) {
  const pid = score.profileId?.trim()
  if (pid) return pid
  return `anon:${score.username.trim().toLowerCase()}`
}

export function TimerResultsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [scores, setScores] = useState<TimerScore[]>([])
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deletingRunKey, setDeletingRunKey] = useState<string | null>(null)
  const deferredScores = useDeferredValue(scores)

  const invalidRun = searchParams.get('invalid') === '1'

  const isAdmin = useMemo(() => {
    if (!profile) return false
    const normalized = profile.username.trim().toLowerCase()
    return ADMIN_USERNAMES.has(normalized)
  }, [profile])
  const supabaseEnabled = isSupabaseEnabled()

  const loadScores = async () => {
    setError('')
    try {
      // Hydrate instantly from local cache for fast back/forward navigation.
      const local = getTimerScoresLocal()
      if (local.length) {
        setScores(local)
      }
      await flushPendingTimerScores()
      const nextScores = await getTimerScores()
      setScores(nextScores)
      setSelectedRunKey(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load leaderboard.')
    }
  }

  useEffect(() => {
    void loadScores()
  }, [])

  const userRuns = useMemo(() => {
    if (!profile) return []
    return deferredScores
      .filter((s) => timerScoreBelongsToProfile(s, profile))
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [deferredScores, profile])

  const userBest = userRuns.reduce<TimerScore | null>((best, s) => {
    if (!best) return s
    return s.elapsedMs < best.elapsedMs ? s : best
  }, null)
  const userAverageMs = userRuns.length
    ? Math.round(userRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / userRuns.length)
    : null

  const allRankedRuns = useMemo(
    () => deferredScores.slice().sort((a, b) => a.elapsedMs - b.elapsedMs),
    [deferredScores],
  )

  const leaderboard = useMemo(() => {
    // Keep all records, but only render top 10 fastest.
    return allRankedRuns.slice(0, 10)
  }, [allRankedRuns])

  const averageLeaderboard = useMemo(() => {
    const grouped = new Map<
      string,
      {
        profileId: string
        username: string
        totalMs: number
        runs: number
      }
    >()

    for (const score of deferredScores) {
      const key = score.profileId || score.username.trim().toLowerCase()
      const existing = grouped.get(key)
      if (existing) {
        existing.totalMs += score.elapsedMs
        existing.runs += 1
      } else {
        grouped.set(key, {
          profileId: score.profileId,
          username: score.username,
          totalMs: score.elapsedMs,
          runs: 1,
        })
      }
    }

    return [...grouped.values()]
      .map((entry) => ({
        ...entry,
        averageMs: Math.round(entry.totalMs / entry.runs),
      }))
      .sort((a, b) => a.averageMs - b.averageMs)
      .slice(0, 10)
  }, [deferredScores])

  const hasPendingSync = useMemo(() => deferredScores.some((s) => s.pendingSync), [deferredScores])

  const bestRuns = useMemo(
    () =>
      userRuns
        .slice()
        .sort((a, b) => a.elapsedMs - b.elapsedMs)
        .slice(0, 3),
    [userRuns],
  )
  const recent3Runs = useMemo(() => userRuns.slice(0, 3), [userRuns])

  const onDeleteRun = async (score: TimerScore) => {
    if (!profile) return
    if (!isAdmin && !timerScoreBelongsToProfile(score, profile)) return
    const runKey = timerScoreKey(score)
    const confirmed = window.confirm('Delete this attempt?')
    if (!confirmed) return

    setError('')
    setDeletingRunKey(runKey)
    const previous = scores
    setScores((prev) => prev.filter((run) => timerScoreKey(run) !== runKey))
    if (selectedRunKey === runKey) {
      setSelectedRunKey(null)
    }

    try {
      await deleteTimerScore({
        id: score.id,
        profileId: score.profileId,
        elapsedMs: score.elapsedMs,
        createdAt: score.createdAt,
      })
    } catch {
      setScores(previous)
      setError('Could not delete that attempt. Please try again.')
    } finally {
      setDeletingRunKey(null)
    }
  }

  const openPlayerProfile = (score: Pick<TimerScore, 'profileId' | 'username'>) => {
    const username = score.username.trim()
    const suffix = username ? `?username=${encodeURIComponent(username)}` : ''
    navigate(`/profile/${encodeURIComponent(score.profileId)}${suffix}`)
  }

  return (
    <main className="page timerResultsPage">
      <div className="timerResultsTitleRow pageHeadingRow">
        <div className="timerResultsTitleLeft pageHeadingRow__start">
          <h1 className="timerResultsTitle pageHeadingRow__title">Leaderboard</h1>
          {isAdmin ? (
            <span className="adminModeIcon" aria-label="Admin mode active" title="Admin mode active">
              👥
            </span>
          ) : null}
        </div>
        <AppHeaderNavIcons />
      </div>
      <section className="card card--pool timerResultsCard">
        <div className="timerResultsGrid">
          <div className="timerResultsPanel">
            <h3>Your performance</h3>
            {invalidRun ? (
              <p className="muted">Runs under 20 seconds are invalid and are not recorded.</p>
            ) : null}
            {!supabaseEnabled ? (
              <p className="muted">Cloud leaderboard is not connected on this deployment yet.</p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            {hasPendingSync && supabaseEnabled ? (
              <p className="muted">
                Some runs are saved on this device only and will upload when you are online.
              </p>
            ) : null}
            <div className="timerResultsSummary">
              <div className="timerSummaryRow">
                <span>Best</span>
                <strong>{userBest ? formatTimerElapsedMs(userBest.elapsedMs) : '--:--.--'}</strong>
              </div>
              <div className="timerSummaryRow">
                <span>Runs</span>
                <strong>{userRuns.length}</strong>
              </div>
              <div className="timerSummaryRow">
                <span>Average</span>
                <strong>{userAverageMs !== null ? formatTimerElapsedMs(userAverageMs) : '--:--.--'}</strong>
              </div>
            </div>
            <div className="timerPerformanceLists">
              <div className="timerPerformanceBlock">
                <h3>Your best</h3>
                <div className="timerList timerList--dense">
                  {bestRuns.length ? (
                    bestRuns.map((score, index) => {
                      const runKey = timerScoreKey(score)
                      const isSelected = selectedRunKey === runKey
                      const deleting = deletingRunKey === runKey
                      return (
                        <div
                          key={runKey}
                          className={`timerRow timerRow--compact timerRow--selectable ${isSelected ? 'timerRow--selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedRunKey(runKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSelectedRunKey(runKey)
                          }}
                        >
                          <span>#{index + 1}</span>
                          <strong>{formatTimerElapsedMs(score.elapsedMs)}</strong>
                          <div className="timerRowActions">
                            <TimerDeleteIconButton
                              busy={deleting}
                              onClick={(event) => {
                                event.stopPropagation()
                                void onDeleteRun(score)
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                              }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="muted">No best runs yet.</p>
                  )}
                </div>
              </div>

              <div className="timerPerformanceBlock">
                <h3>Recent</h3>
                <div className="timerList timerList--dense">
                  {recent3Runs.length ? (
                    recent3Runs.map((score, index) => {
                      const runKey = timerScoreKey(score)
                      const isSelected = selectedRunKey === runKey
                      const deleting = deletingRunKey === runKey
                      return (
                        <div
                          key={runKey}
                          className={`timerRow timerRow--compact timerRow--recent timerRow--selectable ${isSelected ? 'timerRow--selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedRunKey((current) => (current === runKey ? null : runKey))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedRunKey((current) => (current === runKey ? null : runKey))
                            }
                          }}
                        >
                          <span>#{index + 1}</span>
                          <strong className={isSelected ? 'timerRecentValue timerRecentValue--date' : 'timerRecentValue'}>
                            {isSelected ? formatDateLabel(score.createdAt) : formatTimerElapsedMs(score.elapsedMs)}
                          </strong>
                          <div className="timerRowActions">
                            <TimerDeleteIconButton
                              busy={deleting}
                              onClick={(event) => {
                                event.stopPropagation()
                                void onDeleteRun(score)
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                              }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="muted">No recent runs yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="timerResultsPanel">
            <h3>All-time leaderboard</h3>
            <div className="timerList">
              {leaderboard.length ? (
                leaderboard.map((score, index) => {
                  const runKey = timerScoreKey(score)
                  const deleting = deletingRunKey === runKey
                  const isFresh = isLeaderboardRecent(score.createdAt)
                  return (
                    <div
                      key={runKey}
                      className="timerRow timerRow--leaderboardCompact timerRow--selectable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openPlayerProfile(score)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') openPlayerProfile(score)
                      }}
                    >
                      <span>#{index + 1}</span>
                      <div className="timerRowLeaderUser">
                        <Avatar userId={leaderboardAvatarId(score)} size={32} username={score.username} />
                        <span className="timerRowUser">{score.username}</span>
                      </div>
                      <div className="timerRowActions">
                        {isFresh ? <span className="timerFreshBadge">NEW</span> : null}
                        <strong>{formatTimerElapsedMs(score.elapsedMs)}</strong>
                        {isAdmin ? (
                          <TimerDeleteIconButton
                            busy={deleting}
                            onClick={(event) => {
                              event.stopPropagation()
                              void onDeleteRun(score)
                            }}
                            onKeyDown={(event) => {
                              event.stopPropagation()
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="muted">Leaderboard is empty.</p>
              )}
            </div>
          </div>
        </div>
        <div className="timerAverageRankings">
          <h3>Average rankings</h3>
          <div className="timerList">
            {averageLeaderboard.length ? (
              averageLeaderboard.map((entry, index) => (
                <div
                  key={`${entry.profileId}-${entry.username}`}
                  className="timerRow timerRow--leaderboardCompact timerRow--selectable"
                  role="button"
                  tabIndex={0}
                  onClick={() => openPlayerProfile(entry)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openPlayerProfile(entry)
                  }}
                >
                  <span>#{index + 1}</span>
                  <div className="timerRowLeaderUser">
                    <Avatar userId={leaderboardAvatarId(entry)} size={32} username={entry.username} />
                    <span className="timerRowUser">{entry.username}</span>
                  </div>
                  <div className="timerRowActions">
                    <small>{entry.runs} {entry.runs === 1 ? 'run' : 'runs'}</small>
                    <strong>{formatTimerElapsedMs(entry.averageMs)}</strong>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">Average rankings will appear after recorded runs.</p>
            )}
          </div>
        </div>
        <div className="timerResultsActions">
          <button className="btn btn--primary" onClick={() => navigate('/timer')}>
            Replay
          </button>
        </div>
      </section>
    </main>
  )
}

