import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { TimerScore } from '../types'
import { deleteTimerScore, getProfile, getTimerScores } from '../utils/store'

const ADMIN_USERNAMES = new Set(['edward', 'edwarddodds1'])
const ADMIN_PROFILE_IDS = new Set(
  (import.meta.env.VITE_TIMER_ADMIN_PROFILE_IDS ?? '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean),
)

function formatElapsed(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  const centiseconds = Math.floor((ms % 1_000) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

function formatDateLabel(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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

  const scoreKey = (score: Pick<TimerScore, 'profileId' | 'elapsedMs' | 'createdAt'>) =>
    `${score.profileId}__${score.elapsedMs}__${score.createdAt}`

  const isAdmin = useMemo(() => {
    if (!profile) return false
    const normalized = profile.username.trim().toLowerCase()
    return ADMIN_USERNAMES.has(normalized) || ADMIN_PROFILE_IDS.has(profile.id)
  }, [profile])

  const loadScores = async () => {
    const nextScores = await getTimerScores()
    setScores(nextScores)
    setSelectedRunKey(null)
  }

  useEffect(() => {
    if (!profile) {
      navigate('/')
      return
    }
    void loadScores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const userRuns = useMemo(() => {
    if (!profile) return []
    return scores
      .filter((s) => s.profileId === profile.id)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [scores, profile])

  const userBest = userRuns.reduce<TimerScore | null>((best, s) => {
    if (!best) return s
    return s.elapsedMs < best.elapsedMs ? s : best
  }, null)

  const leaderboard = useMemo(() => {
    // Show fastest 10 runs overall (not just per-player bests).
    return scores
      .slice()
      .sort((a, b) => a.elapsedMs - b.elapsedMs)
      .slice(0, 10)
  }, [scores])

  const bestRuns = userRuns
    .slice()
    .sort((a, b) => a.elapsedMs - b.elapsedMs)
    .slice(0, 3)
  const recent5Runs = userRuns.slice(0, 5)

  const onDeleteRun = async (score: TimerScore) => {
    if (!profile || score.profileId !== profile.id) return
    const runKey = scoreKey(score)
    const confirmed = window.confirm('Delete this attempt?')
    if (!confirmed) return

    setError('')
    setDeletingRunKey(runKey)
    const previous = scores
    setScores((prev) => prev.filter((run) => scoreKey(run) !== runKey))
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
      <section className="card timerResultsCard">
        <div className="timerResultsHeader">
          <h2>Leaderboard</h2>
          <button className="timerHomeBtn timerHomeBtn--small" onClick={() => navigate('/')} aria-label="Home">
            <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="timerResultsGrid">
          <div className="timerResultsPanel">
            <h3>Your performance</h3>
            {invalidRun ? (
              <p className="muted">Runs under 20 seconds are invalid and are not recorded.</p>
            ) : null}
            {isAdmin ? <p className="muted">Admin mode is active: you can delete any leaderboard attempt.</p> : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="timerResultsSummary">
              <div className="timerSummaryRow">
                <span>Best</span>
                <strong>{userBest ? formatElapsed(userBest.elapsedMs) : '--:--.--'}</strong>
              </div>
              <div className="timerSummaryRow">
                <span>Runs</span>
                <strong>{userRuns.length}</strong>
              </div>
            </div>
            <div className="timerPerformanceLists">
              <div className="timerPerformanceBlock">
                <h3>Your best</h3>
                <div className="timerList timerList--dense">
                  {bestRuns.length ? (
                    bestRuns.map((score, index) => {
                      const runKey = scoreKey(score)
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
                          <strong>{formatElapsed(score.elapsedMs)}</strong>
                          <div className="timerRowActions">
                            {isSelected ? <small>{formatDateLabel(score.createdAt)}</small> : null}
                            <button
                              type="button"
                              className="timerDeleteBtn"
                              disabled={deleting}
                              onClick={(event) => {
                                event.stopPropagation()
                                void onDeleteRun(score)
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                              }}
                            >
                              {deleting ? 'Deleting...' : 'Delete'}
                            </button>
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
                      const runKey = scoreKey(score)
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
                          <strong>{formatElapsed(score.elapsedMs)}</strong>
                          <div className="timerRowActions">
                            {isSelected ? <small>{formatDateLabel(score.createdAt)}</small> : null}
                            <button
                              type="button"
                              className="timerDeleteBtn"
                              disabled={deleting}
                              onClick={(event) => {
                                event.stopPropagation()
                                void onDeleteRun(score)
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                              }}
                            >
                              {deleting ? 'Deleting...' : 'Delete'}
                            </button>
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
                  const runKey = scoreKey(score)
                  const deleting = deletingRunKey === runKey
                  return (
                    <div key={runKey} className="timerRow timerRow--leaderboardCompact">
                      <span>#{index + 1}</span>
                      <span className="timerRowUser">{score.username}</span>
                      <div className="timerRowActions">
                        <strong>{formatElapsed(score.elapsedMs)}</strong>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="timerDeleteBtn"
                            disabled={deleting}
                            onClick={() => {
                              void onDeleteRun(score)
                            }}
                          >
                            {deleting ? 'Deleting...' : 'Delete'}
                          </button>
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
          <button className="btn" onClick={() => navigate('/')}>
            Home
          </button>
        </div>
      </section>
    </main>
  )
}

