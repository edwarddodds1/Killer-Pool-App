import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { TimerScore } from '../types'
import { formatTimerElapsedMs, timerScoreBelongsToProfile, timerScoreKey } from '../../shared/timerLeaderboard'
import { flushPendingTimerScores, getProfile, getTimerScores } from '../utils/store'

function formatRunDate(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { profileId } = useParams<{ profileId?: string }>()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [scores, setScores] = useState<TimerScore[]>([])
  const [error, setError] = useState('')
  const requestedUsername = (searchParams.get('username') ?? '').trim()

  useEffect(() => {
    if (!profile) {
      navigate('/', { replace: true })
      return
    }

    const load = async () => {
      setError('')
      try {
        await flushPendingTimerScores()
        setScores(await getTimerScores())
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load profile stats.')
      }
    }

    void load()
  }, [navigate, profile])

  const viewingOwnProfile = !profileId
  const profileRuns = useMemo(() => {
    if (!profile && viewingOwnProfile) return []
    const normalizedRequestedName = requestedUsername.toLowerCase()
    return scores
      .filter((score) => {
        if (viewingOwnProfile) {
          if (!profile) return false
          return timerScoreBelongsToProfile(score, profile)
        }
        if (profileId && score.profileId === profileId) return true
        if (!normalizedRequestedName) return false
        return score.username.trim().toLowerCase() === normalizedRequestedName
      })
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [profile, profileId, requestedUsername, scores, viewingOwnProfile])

  const profileDisplayName = useMemo(() => {
    if (viewingOwnProfile) return profile?.username ?? 'Player'
    return profileRuns[0]?.username ?? (requestedUsername || 'Player')
  }, [profile?.username, profileRuns, requestedUsername, viewingOwnProfile])

  const bestRun = useMemo(() => {
    if (!profileRuns.length) return null
    return profileRuns.reduce((best, run) => (run.elapsedMs < best.elapsedMs ? run : best))
  }, [profileRuns])

  const averageMs = useMemo(() => {
    if (!profileRuns.length) return null
    return Math.round(profileRuns.reduce((total, run) => total + run.elapsedMs, 0) / profileRuns.length)
  }, [profileRuns])

  const latestRun = profileRuns[0] ?? null
  const pendingRuns = profileRuns.filter((run) => run.pendingSync).length

  const progressRuns = useMemo(() => profileRuns.slice().reverse(), [profileRuns])

  const lineChart = useMemo(() => {
    const width = 620
    const height = 190
    if (!progressRuns.length) {
      return {
        width,
        height,
        min: 0,
        max: 0,
        path: '',
        points: [] as Array<{ x: number; y: number; run: TimerScore }>,
        ticks: [] as Array<{ y: number; value: number; label: string }>,
      }
    }
    const min = Math.min(...progressRuns.map((run) => run.elapsedMs))
    const max = Math.max(...progressRuns.map((run) => run.elapsedMs))
    const span = Math.max(1, max - min)
    const points = progressRuns.map((run, index) => {
      const x = progressRuns.length === 1 ? width / 2 : (index / (progressRuns.length - 1)) * width
      const y = height - ((run.elapsedMs - min) / span) * height
      return { x, y, run }
    })
    const ticks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4
      const value = Math.round(max - ratio * span)
      const y = ratio * height
      return { y, value, label: formatTimerElapsedMs(value) }
    })
    return {
      width,
      height,
      min,
      max,
      path: buildLinePath(points.map((p) => ({ x: p.x, y: p.y }))),
      points,
      ticks,
    }
  }, [progressRuns])

  const weekdayAverages = useMemo(() => {
    const byDay = new Map<number, { total: number; runs: number }>()
    for (const run of profileRuns) {
      const day = new Date(run.createdAt).getDay()
      const current = byDay.get(day)
      if (current) {
        current.total += run.elapsedMs
        current.runs += 1
      } else {
        byDay.set(day, { total: run.elapsedMs, runs: 1 })
      }
    }
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return labels.map((label, day) => {
      const stat = byDay.get(day)
      const avg = stat ? Math.round(stat.total / stat.runs) : null
      return {
        label,
        runs: stat?.runs ?? 0,
        averageMs: avg,
      }
    })
  }, [profileRuns])

  const maxWeekdayAverage = Math.max(
    1,
    ...weekdayAverages.map((entry) => (entry.averageMs === null ? 0 : entry.averageMs)),
  )

  const personalRank = useMemo(() => {
    if (!bestRun) return null
    const allBestByPlayer = new Map<string, number>()
    for (const run of scores) {
      const key = run.profileId || run.username.trim().toLowerCase()
      const current = allBestByPlayer.get(key)
      if (current === undefined || run.elapsedMs < current) {
        allBestByPlayer.set(key, run.elapsedMs)
      }
    }
    const fasterPlayers = [...allBestByPlayer.values()].filter((elapsed) => elapsed < bestRun.elapsedMs).length
    return fasterPlayers + 1
  }, [bestRun, scores])

  return (
    <main className="page profilePage">
      <div className="profileTitleRow">
        <h1 className="profileTitle">{viewingOwnProfile ? 'Your Profile' : 'Player Profile'}</h1>
        <button className="timerHomeBtn timerHomeBtn--small" onClick={() => navigate('/')} aria-label="Home">
          <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <section className="card card--pool profileCard">
        <header className="profileCardHeader">
          <h2>{profileDisplayName}</h2>
          <button className="btn" type="button" onClick={() => navigate('/timer/results')}>
            Timer Leaderboard
          </button>
        </header>

        {error ? <p className="error">{error}</p> : null}

        <section className="profileStatsGrid" aria-label="Profile highlights">
          <article className="profileStatCard">
            <span>Best run</span>
            <strong>{bestRun ? formatTimerElapsedMs(bestRun.elapsedMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Average run</span>
            <strong>{averageMs !== null ? formatTimerElapsedMs(averageMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Total runs</span>
            <strong>{profileRuns.length}</strong>
          </article>
          <article className="profileStatCard">
            <span>Global best rank</span>
            <strong>{personalRank ?? '--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Latest run</span>
            <strong>{latestRun ? formatTimerElapsedMs(latestRun.elapsedMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Pending sync</span>
            <strong>{pendingRuns}</strong>
          </article>
        </section>

        <section className="profileChartSection">
          <h3>Run Progress ({progressRuns.length || 0} total runs)</h3>
          {lineChart.points.length ? (
            <div className="profileChartSurface profileChartSurface--progress">
              <div className="profileChartAxis" aria-hidden>
                {lineChart.ticks.map((tick) => (
                  <span
                    key={`${tick.value}-${tick.y}`}
                    style={{ top: `${(tick.y / lineChart.height) * 100}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
              <div className="profileChartPlot">
                <svg viewBox={`0 0 ${lineChart.width} ${lineChart.height}`} preserveAspectRatio="none" className="profileLineChart">
                  {lineChart.ticks.map((tick) => (
                    <line
                      key={`grid-${tick.value}-${tick.y}`}
                      x1={0}
                      x2={lineChart.width}
                      y1={tick.y}
                      y2={tick.y}
                      className="profileLineGrid"
                    />
                  ))}
                  <path d={lineChart.path} fill="none" stroke="#0f172a" strokeWidth="2.75" strokeLinecap="round" />
                  {lineChart.points.length <= 140
                    ? lineChart.points.map((point) => (
                        <circle key={point.run.createdAt} cx={point.x} cy={point.y} r="2.5" fill="#1d4ed8" />
                      ))
                    : null}
                </svg>
              </div>
            </div>
          ) : (
            <p className="muted">Complete timer runs to unlock your progress graph.</p>
          )}
        </section>

        <section className="profileChartSection">
          <h3>Average by Day of Week</h3>
          {weekdayAverages.some((entry) => entry.averageMs !== null) ? (
            <div className="profileBars">
              {weekdayAverages.map((entry) => {
                const heightPct = entry.averageMs ? Math.max(12, (entry.averageMs / maxWeekdayAverage) * 100) : 0
                return (
                  <div key={entry.label} className="profileBarCol">
                    <div className="profileBarTrack">
                      {entry.averageMs ? <div className="profileBarFill" style={{ height: `${heightPct}%` }} /> : null}
                    </div>
                    <span className="profileBarLabel">{entry.label}</span>
                    <small>{entry.averageMs ? formatTimerElapsedMs(entry.averageMs) : '--:--.--'}</small>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted">Play runs across different days to compare pace patterns.</p>
          )}
        </section>

        <section className="profileTableSection">
          <h3>Recent Attempts</h3>
          {profileRuns.length ? (
            <div className="profileTableWrap">
              <table className="profileTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Date</th>
                    <th>Personal Best</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profileRuns.slice(0, 12).map((run, index) => {
                    const deltaMs = bestRun ? run.elapsedMs - bestRun.elapsedMs : 0
                    const isBest = bestRun ? timerScoreKey(run) === timerScoreKey(bestRun) : false
                    return (
                      <tr key={timerScoreKey(run)}>
                        <td>{index + 1}</td>
                        <td>{formatTimerElapsedMs(run.elapsedMs)}</td>
                        <td>{formatRunDate(run.createdAt)}</td>
                        <td>{isBest ? 'PB' : `+${formatTimerElapsedMs(deltaMs)}`}</td>
                        <td>
                          {run.pendingSync ? (
                            <span className="profileStatusText">Pending upload</span>
                          ) : (
                            <span className="profileSyncDot" aria-label="Synced" title="Synced" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{viewingOwnProfile ? 'No timer attempts recorded yet.' : 'No runs found for this player yet.'}</p>
          )}
        </section>
      </section>
    </main>
  )
}

