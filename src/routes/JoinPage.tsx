import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Profile } from '../types'
import { getProfile, getRoom, getRoomRemote, saveProfile, upsertRoom, upsertRoomRemote } from '../utils/store'

function ensureProfile(username: string): Profile {
  const existing = getProfile()
  if (existing) {
    const next = { ...existing, username: username.trim() }
    saveProfile(next)
    return next
  }
  const profile: Profile = { id: crypto.randomUUID(), username: username.trim() }
  saveProfile(profile)
  return profile
}

export function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState(getProfile()?.username ?? '')
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [error, setError] = useState('')

  const onJoin = async (event: FormEvent) => {
    event.preventDefault()
    const cleanCode = code.replace(/\D/g, '').slice(0, 4)
    const room = (await getRoomRemote(cleanCode)) ?? getRoom(cleanCode)
    if (!room) return setError('No party found for that code.')
    if (username.trim().length < 2) return setError('Enter a username with at least 2 characters.')

    const profile = ensureProfile(username)
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
        <form onSubmit={onJoin} className="stack">
          <label className="field">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
            />
          </label>
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
