import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addTimerScore, getProfile } from '../utils/store'

function formatElapsedParts(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  const centiseconds = Math.floor((ms % 1_000) / 10)
  return {
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    centiseconds: String(centiseconds).padStart(2, '0'),
  }
}

export function TimerPoolPage() {
  const navigate = useNavigate()
  const profile = getProfile()
  const [runningSince, setRunningSince] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [saving, setSaving] = useState(false)
  const [runFinalized, setRunFinalized] = useState(false)

  useEffect(() => {
    if (!profile) {
      navigate('/')
      return
    }
  }, [navigate, profile])

  useEffect(() => {
    if (runningSince === null) return
    const timerId = window.setInterval(() => {
      setElapsedMs(Date.now() - runningSince)
    }, 50)
    return () => window.clearInterval(timerId)
  }, [runningSince])

  const startRun = () => {
    if (runFinalized) {
      setElapsedMs(0)
      setRunFinalized(false)
      setRunningSince(Date.now())
      return
    }
    setRunningSince(Date.now() - elapsedMs)
  }

  const stopRun = () => {
    if (runningSince === null) return
    const nextElapsed = Date.now() - runningSince
    setRunningSince(null)
    setElapsedMs(nextElapsed)
  }

  const finishRun = async () => {
    if (!profile || elapsedMs <= 0 || saving) return
    const finalElapsed = runningSince === null ? elapsedMs : Date.now() - runningSince
    setRunningSince(null)
    setElapsedMs(finalElapsed)
    setSaving(true)
    try {
      await addTimerScore({
        profileId: profile.id,
        username: profile.username,
        elapsedMs: finalElapsed,
      })
      setRunFinalized(true)
      navigate('/timer/results')
    } finally {
      setSaving(false)
    }
  }

  const elapsedParts = formatElapsedParts(elapsedMs)

  return (
    <main className="page timerPage">
      <section className="card timerCard timerCard--main">
        <div className="timerHeader">
          <button className="timerHomeBtn" onClick={() => navigate('/')} aria-label="Home">
            <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <div className="timerDisplay" aria-live="polite">
          <span className="timerDisplay__group">{elapsedParts.minutes}</span>
          <span className="timerDisplay__separator">:</span>
          <span className="timerDisplay__group">{elapsedParts.seconds}</span>
          <span className="timerDisplay__separator">.</span>
          <span className="timerDisplay__group timerDisplay__group--centi">{elapsedParts.centiseconds}</span>
        </div>
        <div className="timerControls">
          {runningSince === null ? (
            <button className="btn btn--primary" onClick={startRun} disabled={saving}>
              Start
            </button>
          ) : (
            <button className="btn btn--danger" onClick={stopRun} disabled={saving}>
              Stop
            </button>
          )}
          <button className="btn" onClick={finishRun} disabled={elapsedMs === 0 || saving}>
            Finish
          </button>
        </div>
      </section>
    </main>
  )
}
