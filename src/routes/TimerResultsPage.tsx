import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { TimerScore } from '../types'
import {
  formatRecentRunDayMonth,
  formatTimerElapsedMs,
  timerScoreBelongsToProfile,
  timerScoreKey,
} from '../../shared/timerLeaderboard'
import { deleteTimerScore, flushPendingTimerScores, getProfile, getTimerScores } from '../utils/store'
import { isSupabaseEnabled } from '../lib/supabase'

const ADMIN_USERNAMES = new Set(['edwarddodds1'])
const ADMIN_PROFILE_IDS = new Set(
  (import.meta.env.VITE_TIMER_ADMIN_PROFILE_IDS ?? '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean),
)

function formatDateLabel(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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

export function TimerResultsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [scores, setScores] = useState<TimerScore[]>([])
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deletingRunKey, setDeletingRunKey] = useState<string | null>(null)

  const invalidRun = searchParams.get('invalid') === '1'

  const isAdmin = useMemo(() => {
    if (!profile) return false
    const normalized = profile.username.trim().toLowerCase()
    return ADMIN_USERNAMES.has(normalized) || ADMIN_PROFILE_IDS.has(profile.id)
  }, [profile])
  const supabaseEnabled = isSupabaseEnabled()

  const loadScores = async () => {
    setError('')
    try {
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
    return scores
      .filter((s) => timerScoreBelongsToProfile(s, profile))
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [scores, profile])

  const userBest = userRuns.reduce<TimerScore | null>((best, s) => {
    if (!best) return s
    return s.elapsedMs < best.elapsedMs ? s : best
  }, null)
  const userAverageMs = userRuns.length
    ? Math.round(userRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / userRuns.length)
    : null

  const allRankedRuns = useMemo(
    () => scores.slice().sort((a, b) => a.elapsedMs - b.elapsedMs),
    [scores],
  )

  const leaderboard = useMemo(() => {
    // Keep all records, but only render top 10 fastest.
    return allRankedRuns.slice(0, 10)
  }, [allRankedRuns])

  const hasPendingSync = useMemo(() => scores.some((s) => s.pendingSync), [scores])

  const bestRuns = userRuns
    .slice()
    .sort((a, b) => a.elapsedMs - b.elapsedMs)
    .slice(0, 3)
  const recent5Runs = userRuns.slice(0, 5)

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

  return (
    <main className="page timerResultsPage">
      <div className="timerResultsTitleRow">
        <div className="timerResultsTitleLeft">
          <h1 className="timerResultsTitle">Leaderboard</h1>
          {isAdmin ? (
            <span className="adminModeIcon" aria-label="Admin mode active" title="Admin mode active">
              👥
            </span>
          ) : null}
        </div>
        <button className="timerHomeBtn timerHomeBtn--small" onClick={() => navigate('/')} aria-label="Home">
          <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z" fill="currentColor" />
          </svg>
        </button>
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
                            {isSelected ? <small>{formatDateLabel(score.createdAt)}</small> : null}
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
                  {recent5Runs.length ? (
                    recent5Runs.map((score, index) => {
                      const runKey = timerScoreKey(score)
                      const isSelected = selectedRunKey === runKey
                      const deleting = deletingRunKey === runKey
                      return (
                        <div
                          key={runKey}
                          className={`timerRow timerRow--compact timerRow--recent timerRow--selectable ${isSelected ? 'timerRow--selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedRunKey(runKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSelectedRunKey(runKey)
                          }}
                        >
                          <span>#{index + 1}</span>
                          <strong>{formatTimerElapsedMs(score.elapsedMs)}</strong>
                          <span className="timerRecentDate">{formatRecentRunDayMonth(score.createdAt)}</span>
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
                  return (
                    <div key={runKey} className="timerRow timerRow--leaderboardCompact">
                      <span>#{index + 1}</span>
                      <span className="timerRowUser">{score.username}</span>
                      <div className="timerRowActions">
                        <strong>{formatTimerElapsedMs(score.elapsedMs)}</strong>
                        {isAdmin ? (
                          <TimerDeleteIconButton busy={deleting} onClick={() => void onDeleteRun(score)} />
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
        <div className="timerResultsActions">
          <button className="btn btn--primary" onClick={() => navigate('/timer')}>
            Replay
          </button>
        </div>
      </section>
    </main>
  )
}

