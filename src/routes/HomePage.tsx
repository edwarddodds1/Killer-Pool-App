import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameMode, KillerAllocationMode } from '../types'
import { buildNewRoom, createRandomCode } from '../utils/game'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { AdminNameIcon } from '../components/AdminNameIcon'
import {
  clearProfile,
  getProfile,
  getRoomRemote,
  getRooms,
  flushPendingTimerScores,
  getTimerScores,
  hydrateProfileSessionFromServer,
  registerAccount,
  timerScoreBelongsToProfile,
  saveProfile,
  signInAccount,
  upsertRoom,
  upsertRoomRemote,
} from '../utils/store'

export function HomePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(() => getProfile())
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [mode, setMode] = useState<GameMode>('killer')
  const [killerAllocationMode, setKillerAllocationMode] = useState<KillerAllocationMode>('single')
  const [error, setError] = useState('')
  const [timerRank, setTimerRank] = useState<number | null>(null)
  const canCreate = useMemo(() => Boolean(profile), [profile])

  useEffect(() => {
    void hydrateProfileSessionFromServer().then(() => {
      setProfile(getProfile())
    })
  }, [])

  useEffect(() => {
    const loadTimerRank = async () => {
      if (!profile) {
        setTimerRank(null)
        return
      }
      try {
        await flushPendingTimerScores()
        const scores = await getTimerScores()
        const userRuns = scores.filter((s) => timerScoreBelongsToProfile(s, profile))
        if (!userRuns.length) {
          setTimerRank(null)
          return
        }
        const userBestMs = Math.min(...userRuns.map((s) => s.elapsedMs))
        const rank = scores.filter((s) => s.elapsedMs < userBestMs).length + 1
        setTimerRank(rank)
      } catch {
        setTimerRank(null)
      }
    }
    void loadTimerRank()
  }, [profile])

  const onAuthSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setAuthBusy(true)
    try {
      if (authMode === 'signup') {
        await registerAccount(authUsername, authPassword)
      } else {
        await signInAccount(authUsername, authPassword)
      }
      setProfile(getProfile())
      setAuthPassword('')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not authenticate.')
    } finally {
      setAuthBusy(false)
    }
  }

  const onContinueAsGuest = () => {
    const guestName = authUsername.trim()
    if (guestName.length < 2) {
      setError('Enter a username with at least 2 characters to continue as guest.')
      return
    }
    saveProfile({
      id: crypto.randomUUID(),
      username: guestName,
    })
    setProfile(getProfile())
    setAuthPassword('')
    setError('')
  }

  const onCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) {
      setError('Sign in to continue.')
      return
    }
    if (!canCreate) {
      setError('Sign in to continue.')
      return
    }
    if (mode === 'timer') {
      navigate('/timer')
      return
    }
    const rooms = getRooms()
    const room = buildNewRoom(profile, mode, killerAllocationMode)
    while (rooms[room.code] || (await getRoomRemote(room.code))) room.code = createRandomCode()
    upsertRoom(room)
    await upsertRoomRemote(room)
    navigate(`/room/${room.code}`)
  }

  const onOpenLeaderboard = () => {
    navigate('/timer/results')
  }

  const onSignOut = () => {
    clearProfile()
    setProfile(null)
    setAuthMode('signin')
    setAuthPassword('')
    setError('')
  }

  return (
    <main className="page homePage">
      <header className="brand homeHero pageHeadingRow">
        <div className="homeHero__main">
          <div className="brand__logo" aria-hidden="true">
            <svg viewBox="0 0 100 100" className="brand__logoSvg">
              <circle cx="50" cy="50" r="48" fill="#000" />
              <circle cx="50" cy="50" r="24" fill="#ececec" />
              <path
                d="M41.2 35.8h4.8v12.4l10.3-12.4h6.4L50.8 50l12.2 14.3h-6.4L46 51.9v12.4h-4.8V35.8Z"
                fill="#000"
              />
            </svg>
          </div>
          <div className="homeTitleBlock">
            <h1 className="pageHeadingRow__title">KILLER POOL</h1>
            {timerRank != null ? (
              <div
                className="homeTimerRankBubble"
                aria-label={`Timer : number ${timerRank} ranked player`}
              >
                <span className="homeTimerRankBubble__label">Timer :</span>
                <span className="homeTimerRankBubble__value">#{timerRank} ranked player</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="pageHeadingRow__tools">
          <AppHeaderNavIcons />
        </div>
      </header>
      <section className="card card--pool homeCard">
        {!profile ? (
          <>
            <div className="homeCard__header">
              <h2>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
              <div className="authSwitch" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  className={`authSwitch__btn ${authMode === 'signin' ? 'authSwitch__btn--active' : ''}`}
                  onClick={() => {
                    setError('')
                    setAuthMode('signin')
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`authSwitch__btn ${authMode === 'signup' ? 'authSwitch__btn--active' : ''}`}
                  onClick={() => {
                    setError('')
                    setAuthMode('signup')
                  }}
                >
                  Create
                </button>
              </div>
            </div>
            <form onSubmit={onAuthSubmit} className="stack">
              <label className="field">
                Username
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="4-15 characters"
                  maxLength={15}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="At least 4 characters"
                  maxLength={32}
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <button type="submit" className="btn btn--primary" disabled={authBusy}>
                {authMode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              <button type="button" className="btn btn--soft" onClick={onContinueAsGuest} disabled={authBusy}>
                Continue as guest
              </button>
              <button
                type="button"
                className="btn btn--soft"
                onClick={() => {
                  setError('')
                  setAuthMode((curr) => (curr === 'signup' ? 'signin' : 'signup'))
                }}
              >
                {authMode === 'signup' ? 'I already have an account' : 'Create a new account'}
              </button>
            </form>
          </>
        ) : (
          <>
            <form onSubmit={onCreate} className="stack homeSetupForm">
              <div className="field">
                <div className="modeSlider" style={{ '--slider-index': mode === 'killer' ? 0 : 1 } as CSSProperties}>
                  <div className="modeSlider__thumb" aria-hidden="true" />
                  <button
                    type="button"
                    className={`modeSlider__btn ${mode === 'killer' ? 'modeSlider__btn--active' : ''}`}
                    onClick={() => setMode('killer')}
                  >
                    Killer Pool
                  </button>
                  <button
                    type="button"
                    className={`modeSlider__btn ${mode === 'timer' ? 'modeSlider__btn--active' : ''}`}
                    onClick={() => setMode('timer')}
                  >
                    Timer Pool
                  </button>
                </div>
              </div>
              <div className="field">
                <div
                  className={`modeSlider ${mode === 'timer' ? 'modeSlider--disabled' : ''}`}
                  style={{
                    '--slider-index': killerAllocationMode === 'single' ? 0 : 1,
                  } as CSSProperties}
                >
                  <div className="modeSlider__thumb" aria-hidden="true" />
                  <button
                    type="button"
                    className={`modeSlider__btn ${killerAllocationMode === 'single' ? 'modeSlider__btn--active' : ''}`}
                    onClick={() => setKillerAllocationMode('single')}
                    disabled={mode === 'timer'}
                  >
                    Single ball
                  </button>
                  <button
                    type="button"
                    className={`modeSlider__btn ${killerAllocationMode === 'multi' ? 'modeSlider__btn--active' : ''}`}
                    onClick={() => setKillerAllocationMode('multi')}
                    disabled={mode === 'timer'}
                  >
                    Multi ball
                  </button>
                </div>
              </div>
              {error ? <p className="error">{error}</p> : null}
              {mode === 'timer' ? (
                <button type="submit" className="btn btn--go" disabled={!canCreate}>
                  Start Game
                </button>
              ) : (
                <>
                  <button type="submit" className="btn btn--go" disabled={!canCreate}>
                    Start Game
                  </button>
                </>
              )}
              <div className="homeActionsRow">
                <button type="button" className="btn btn--soft" onClick={() => navigate('/join')}>
                  Join Party
                </button>
                <button type="button" className="btn btn--soft" onClick={onOpenLeaderboard}>
                  <span className="btn__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="btn__iconSvg">
                      <path d="M3 21h18v-2H3v2Zm2-3h4v-7H5v7Zm5 0h4v-11h-4v11Zm5 0h4v-5h-4v5Z" fill="currentColor" />
                    </svg>
                  </span>{' '}
                  Timer Leaderboard
                </button>
              </div>
            </form>
          </>
        )}
      </section>
      {profile ? (
        <footer className="homeSessionFooter">
          <span className="homeSessionFooter__identity">
            <button type="button" className="homeSessionFooter__profileLink" onClick={() => navigate('/profile')} aria-label="Profile">
              <svg viewBox="0 0 24 24" className="btn__iconSvg" aria-hidden="true">
                <path
                  d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 2.3c-3.9 0-7.2 2.1-8.3 5.2-.2.6.2 1.3.9 1.3h14.8c.7 0 1.1-.7.9-1.3-1.1-3.1-4.4-5.2-8.3-5.2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <strong className="adminInlineName">
              <span>{profile.username}</span>
              <AdminNameIcon username={profile.username} />
            </strong>
            {!profile.sessionId ? (
              <span className="homeSessionFooter__guestBadge" title="Guest — sign in or create an account for Social and cloud saves">
                Guest
              </span>
            ) : null}
          </span>
          <span className="homeSessionFooter__actions">
            <button type="button" className="homeSessionFooter__signOut" onClick={onSignOut}>
              Sign out
            </button>
          </span>
        </footer>
      ) : null}
    </main>
  )
}
