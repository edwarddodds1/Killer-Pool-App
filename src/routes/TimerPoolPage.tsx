import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { RulesHelpIconButton, RulesModal } from '../components/ui/RulesModal'
import { addTimerScore, getProfile } from '../utils/store'

const MIN_VALID_TIMER_RUN_MS = 20_000
const START_COUNTDOWN_SECONDS = 5

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
  const [error, setError] = useState('')
  const [countdownEnabled, setCountdownEnabled] = useState(false)
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null)
  const [penaltyCount, setPenaltyCount] = useState(0)
  const [showRules, setShowRules] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

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

  const beginRunNow = () => {
    if (runFinalized) {
      setElapsedMs(0)
      setRunFinalized(false)
      setPenaltyCount(0)
      setRunningSince(Date.now())
      return
    }
    setRunningSince(Date.now() - elapsedMs)
  }

  const playStartBeep = () => {
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtor) return
      const ctx = audioContextRef.current ?? new AudioCtor()
      audioContextRef.current = ctx
      if (ctx.state === 'suspended') void ctx.resume()

      const startAt = ctx.currentTime + 0.01
      const playTone = (frequency: number, offset: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(frequency, startAt + offset)
        gain.gain.setValueAtTime(0.0001, startAt + offset)
        gain.gain.exponentialRampToValueAtTime(0.65, startAt + offset + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.22)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(startAt + offset)
        osc.stop(startAt + offset + 0.24)
      }

      playTone(820, 0)
      playTone(1220, 0.24)
      // Add haptic fallback for devices/browsers where audio is muted by system mode.
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate([100, 70, 120])
      }
    } catch {
      // Beep is optional UX enhancement; ignore if blocked/unavailable.
    }
  }

  const primeBeepAudio = () => {
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtor) return
      const ctx = audioContextRef.current ?? new AudioCtor()
      audioContextRef.current = ctx
      if (ctx.state === 'suspended') void ctx.resume()

      // Mobile Safari often needs an actual (even silent) source started
      // during a user gesture to fully unlock subsequent audio playback.
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.02)

      // Also prime a very short audible unlock pulse so subsequent countdown beeps
      // are less likely to be blocked on restrictive mobile browsers.
      const unlockOsc = ctx.createOscillator()
      const unlockGain = ctx.createGain()
      unlockOsc.type = 'sine'
      unlockOsc.frequency.setValueAtTime(660, ctx.currentTime + 0.03)
      unlockGain.gain.setValueAtTime(0.0001, ctx.currentTime + 0.03)
      unlockGain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05)
      unlockGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11)
      unlockOsc.connect(unlockGain)
      unlockGain.connect(ctx.destination)
      unlockOsc.start(ctx.currentTime + 0.03)
      unlockOsc.stop(ctx.currentTime + 0.12)
    } catch {
      // Ignore if browser blocks/doesn't support audio context.
    }
  }

  useEffect(() => {
    if (countdownRemaining === null) return
    if (countdownRemaining === 0) {
      playStartBeep()
      setCountdownRemaining(null)
      beginRunNow()
      return
    }
    const timerId = window.setTimeout(() => {
      setCountdownRemaining((current) => (current === null ? null : current - 1))
    }, 1000)
    return () => window.clearTimeout(timerId)
  }, [beginRunNow, countdownRemaining, playStartBeep])

  useEffect(
    () => () => {
      if (!audioContextRef.current) return
      void audioContextRef.current.close()
      audioContextRef.current = null
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    const requestWakeLock = async () => {
      try {
        if (!('wakeLock' in navigator) || wakeLockRef.current || cancelled) return
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await lock.release()
          return
        }
        wakeLockRef.current = lock
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) {
            wakeLockRef.current = null
          }
        })
      } catch {
        // Some browsers/devices do not allow wake locks; continue without it.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
      }
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const lock = wakeLockRef.current
      wakeLockRef.current = null
      if (lock) void lock.release()
    }
  }, [])

  const startRun = () => {
    if (countdownRemaining !== null) return
    if (runningSince === null && elapsedMs === 0) {
      setPenaltyCount(0)
    }
    const shouldCountdown = countdownEnabled && runningSince === null && (elapsedMs === 0 || runFinalized)
    if (shouldCountdown) {
      setError('')
      primeBeepAudio()
      setCountdownRemaining(START_COUNTDOWN_SECONDS)
      return
    }
    beginRunNow()
  }

  const stopRun = () => {
    if (runningSince === null) return
    const nextElapsed = Date.now() - runningSince
    setRunningSince(null)
    setElapsedMs(nextElapsed)
  }

  const finishRun = async () => {
    if (!profile || elapsedMs <= 0 || saving || countdownRemaining !== null) return
    const finalElapsed = runningSince === null ? elapsedMs : Date.now() - runningSince
    const isValidRun = finalElapsed >= MIN_VALID_TIMER_RUN_MS
    setError('')
    setRunningSince(null)
    setElapsedMs(finalElapsed)
    setSaving(true)
    try {
      if (isValidRun) {
        await addTimerScore({
          profileId: profile.id,
          username: profile.username,
          elapsedMs: finalElapsed,
        })
      }
      setRunFinalized(true)
      navigate(isValidRun ? '/timer/results' : '/timer/results?invalid=1')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save run.')
    } finally {
      setSaving(false)
    }
  }

  const addPenalty = () => {
    if (saving || countdownRemaining !== null) return
    if (runningSince === null && elapsedMs === 0) return
    setPenaltyCount((current) => current + 1)
    setElapsedMs((current) => current + 10_000)
    setRunningSince((current) => (current === null ? null : current - 10_000))
  }

  const removePenalty = () => {
    if (saving || countdownRemaining !== null) return
    if (penaltyCount <= 0) return
    setPenaltyCount((current) => Math.max(0, current - 1))
    setElapsedMs((current) => Math.max(0, current - 10_000))
    setRunningSince((current) => (current === null ? null : current + 10_000))
  }

  const elapsedParts = formatElapsedParts(elapsedMs)

  return (
    <main className="page timerPage">
      <div className="timerPageTitleRow pageHeadingRow">
        <h1 className="timerTitle pageHeadingRow__title">Timer</h1>
        <div className="pageHeadingRow__tools">
          <RulesHelpIconButton onPress={() => setShowRules(true)} label="Timer Pool rules" />
          <AppHeaderNavIcons />
        </div>
      </div>
      <section className="card card--pool timerCard timerCard--main">
        <div className="timerDisplayWrap">
          {penaltyCount > 0 ? (
            <div className="timerPenaltyDots" aria-label={`${penaltyCount} penalty ${penaltyCount === 1 ? 'dot' : 'dots'}`}>
              {Array.from({ length: penaltyCount }, (_, index) => (
                <span key={index} className="timerPenaltyDot" aria-hidden="true" />
              ))}
            </div>
          ) : null}
          <div className="timerDisplay" aria-live="polite">
            <span className="timerDisplay__group">{elapsedParts.minutes}</span>
            <span className="timerDisplay__separator">:</span>
            <span className="timerDisplay__group">{elapsedParts.seconds}</span>
            <span className="timerDisplay__separator">.</span>
            <span className="timerDisplay__group timerDisplay__group--centi">{elapsedParts.centiseconds}</span>
          </div>
        </div>
        <div className="timerControls">
          {runningSince === null ? (
            <button className="btn btn--primary" onClick={startRun} disabled={saving || countdownRemaining !== null}>
              {countdownRemaining !== null ? `Starting in ${countdownRemaining}...` : 'Start'}
            </button>
          ) : (
            <button className="btn btn--danger" onClick={stopRun} disabled={saving}>
              Stop
            </button>
          )}
          <button className="btn" onClick={finishRun} disabled={elapsedMs === 0 || saving || countdownRemaining !== null}>
            Finish
          </button>
        </div>
        <div className="timerOptionsRow">
          <label className="timerCountdownOption">
            <input
              type="checkbox"
              checked={countdownEnabled}
              onChange={(event) => setCountdownEnabled(event.target.checked)}
              disabled={runningSince !== null || countdownRemaining !== null || saving}
            />
            5s countdown
          </label>
          <div className="timerPenaltyControls">
            <button
              type="button"
              className="btn btn--small timerPenaltyBtn"
              onClick={addPenalty}
              disabled={saving || countdownRemaining !== null || (runningSince === null && elapsedMs === 0)}
            >
              +10s penalty
            </button>
            {penaltyCount > 0 ? (
              <button
                type="button"
                className="btn btn--small timerPenaltyBtn timerPenaltyBtn--remove"
                onClick={removePenalty}
                disabled={saving || countdownRemaining !== null}
              >
                Remove penalty
              </button>
            ) : null}
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="timer" />
    </main>
  )
}
