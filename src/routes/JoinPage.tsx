import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getProfile, getRoom, getRoomRemote, upsertRoom, upsertRoomRemote } from '../utils/store'

export function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [error, setError] = useState('')

  const onJoin = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) return setError('Please sign in on the home screen first.')
    const cleanCode = code.replace(/\D/g, '').slice(0, 4)
    const room = (await getRoomRemote(cleanCode)) ?? getRoom(cleanCode)
    if (!room) return setError('No party found for that code.')
    if (room.status !== 'lobby') {
      return setError('This party is already in progress and can no longer be joined.')
    }
    if (!room.players.some((player) => player.id === profile.id)) {
      room.players.push({
        id: profile.id,
        username: profile.username,
        avatarIcon: profile.avatarIcon,
        isBot: false,
        ready: false,
        assignedBalls: [],
        pottedBalls: [],
        turns: 0,
        kills: 0,
        eliminated: false,
      })
    }
    upsertRoom(room)
    await upsertRoomRemote(room)
    navigate(`/room/${cleanCode}`)
  }

  return (
    <main className="page">
      <section className="card">
        <h2>Join Party</h2>
        {!profile ? <p className="muted">Sign in from Home to join with your account.</p> : null}
        <form onSubmit={onJoin} className="stack">
          {profile ? <p className="muted">Joining as <strong>{profile.username}</strong></p> : null}
          <label className="field">
            4-digit code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              maxLength={4}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn--primary">
            Enter Lobby
          </button>
          <button type="button" className="btn" onClick={() => navigate('/')}>
            Back
          </button>
        </form>
      </section>
    </main>
  )
}
