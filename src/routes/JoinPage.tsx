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
    <main className="page joinPage">
      <div className="joinTitleRow">
        <h1 className="joinTitle">Join Party</h1>
        <div className="timerTitleActions">
          <button type="button" className="timerHomeBtn timerHomeBtn--small" onClick={() => navigate('/')} aria-label="Home">
            <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <section className="card card--pool joinCard">
        {!profile ? <p className="muted">Sign in from Home to join with your account.</p> : null}
        <form onSubmit={onJoin} className="stack">
          <label className="field">
            4-digit code
            <div className="joinCodeInputWrap">
              <input
                className="joinCodeInput"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                inputMode="numeric"
                maxLength={4}
                aria-label="4-digit code"
              />
              <div className="joinCodeSlots" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => {
                  const char = code[index] ?? ''
                  return (
                    <span key={index} className={`joinCodeSlot ${char ? 'joinCodeSlot--filled' : ''}`}>
                      {char || '0'}
                    </span>
                  )
                })}
              </div>
            </div>
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
