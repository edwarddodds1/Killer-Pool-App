import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TimerScore } from '../types'
import { getProfile, getTimerScores } from '../utils/store'

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
  const profile = getProfile()
  const [scores, setScores] = useState<TimerScore[]>([])
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null)

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
                      const runKey = `best-${score.createdAt}-${index}`
                      const isSelected = selectedRunKey === runKey
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
                          {isSelected ? <small>{formatDateLabel(score.createdAt)}</small> : null}
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
                      const runKey = `recent-${score.createdAt}-${index}`
                      const isSelected = selectedRunKey === runKey
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
                          {isSelected ? <small>{formatDateLabel(score.createdAt)}</small> : null}
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
                leaderboard.map((score, index) => (
                  <div key={`${score.profileId}-${index}`} className="timerRow timerRow--leaderboardCompact">
                    <span>#{index + 1}</span>
                    <span className="timerRowUser">{score.username}</span>
                    <strong>{formatElapsed(score.elapsedMs)}</strong>
                  </div>
                ))
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

