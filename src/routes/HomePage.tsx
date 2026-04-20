import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameMode, KillerAllocationMode, Profile } from '../types'
import { buildNewRoom, createRandomCode } from '../utils/game'
import { getProfile, getRooms, getRoomRemote, saveProfile, upsertRoom, upsertRoomRemote } from '../utils/store'

function makeProfile(username: string): Profile {
  const existing = getProfile()
  if (existing) {
    return { ...existing, username: username.trim() }
  }
  return { id: crypto.randomUUID(), username: username.trim() }
}

export function HomePage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState(() => getProfile()?.username ?? '')
  const [mode, setMode] = useState<GameMode>('killer')
  const [killerAllocationMode, setKillerAllocationMode] = useState<KillerAllocationMode>('single')
  const [error, setError] = useState('')
  const canCreate = useMemo(() => username.trim().length > 1, [username])

  const onCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!canCreate) {
      setError('Enter at least 2 characters for username.')
      return
    }
    const profile = makeProfile(username)
    saveProfile(profile)
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

  return (
    <main className="page">
      <header className="brand">
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
        <h1>Killer Pool</h1>
      </header>

      <section className="card">
        <h2>{mode === 'timer' ? 'Timer Pool' : 'Create Party'}</h2>
        <form onSubmit={onCreate} className="stack">
          <label className="field">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
            />
          </label>
          <div className="split">
            <label className="field">
              Game
              <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
                <option value="killer">Killer Pool</option>
                <option value="timer">Timer Pool</option>
              </select>
            </label>
            {mode === 'killer' ? (
              <label className="field">
                Allocation
                <select
                  value={killerAllocationMode}
                  onChange={(e) => setKillerAllocationMode(e.target.value as KillerAllocationMode)}
                >
                  <option value="single">Single ball</option>
                  <option value="multi">Multi ball</option>
                </select>
              </label>
            ) : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
          {mode === 'timer' ? (
            <button type="submit" className="btn btn--primary" disabled={!canCreate}>
              Begin Game
            </button>
          ) : (
            <>
              <button type="submit" className="btn btn--primary" disabled={!canCreate}>
                Create Party
              </button>
              <button type="button" className="btn" onClick={() => navigate('/join')}>
                Join Party
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => navigate('/timer/results')}>
            <span className="btn__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="btn__iconSvg">
                <path d="M3 21h18v-2H3v2Zm2-3h4v-7H5v7Zm5 0h4v-11h-4v11Zm5 0h4v-5h-4v5Z" fill="currentColor" />
              </svg>
            </span>{' '}
            Leaderboard
          </button>
        </form>
      </section>
    </main>
  )
}
