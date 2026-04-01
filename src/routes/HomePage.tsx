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
        <div className="brand__logo">K</div>
        <h1>Killer Pool</h1>
      </header>

      <section className="card">
        <h2>Create Party</h2>
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
                <option value="kelly">Kelly Pool</option>
              </select>
            </label>
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
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn--primary" disabled={!canCreate}>
            Create Party
          </button>
          <button type="button" className="btn" onClick={() => navigate('/join')}>
            Join Party
          </button>
        </form>
      </section>
    </main>
  )
}
