import { useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { getProfile, getRoom, getRoomRemote, upsertRoom, upsertRoomRemote } from '../utils/store'

export function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [code, setCode] = useState((searchParams.get('code') ?? '').replace(/\D/g, '').slice(0, 4))
  const [error, setError] = useState('')
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const codeChars = Array.from({ length: 4 }, (_, index) => code[index] ?? '')

  const setCodeAtIndex = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const nextChars = [...codeChars]
    nextChars[index] = digit
    const nextCode = nextChars.join('').slice(0, 4)
    setCode(nextCode)
    if (digit && index < 3) {
      codeInputRefs.current[index + 1]?.focus()
      codeInputRefs.current[index + 1]?.select()
    }
  }

  const onCodeKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !codeChars[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
      codeInputRefs.current[index - 1]?.select()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      codeInputRefs.current[index - 1]?.focus()
      codeInputRefs.current[index - 1]?.select()
    }
    if (event.key === 'ArrowRight' && index < 3) {
      event.preventDefault()
      codeInputRefs.current[index + 1]?.focus()
      codeInputRefs.current[index + 1]?.select()
    }
  }

  const onCodePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted) return
    setCode(pasted)
    const focusIndex = Math.min(3, Math.max(0, pasted.length - 1))
    codeInputRefs.current[focusIndex]?.focus()
    codeInputRefs.current[focusIndex]?.select()
  }

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
      <div className="joinTitleRow pageHeadingRow">
        <h1 className="joinTitle pageHeadingRow__title">Join Party</h1>
        <AppHeaderNavIcons />
      </div>
      <section className="card card--pool joinCard">
        {!profile ? <p className="muted">Sign in from Home to join with your account.</p> : null}
        <form onSubmit={onJoin} className="stack">
          <label className="field">
            4-digit code
            <div className="joinCodeInputWrap">
              <div className="joinCodeSlots">
                {codeChars.map((char, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      codeInputRefs.current[index] = element
                    }}
                    className={`joinCodeInput joinCodeSlot ${char ? 'joinCodeSlot--filled' : ''}`}
                    value={char}
                    onChange={(event) => setCodeAtIndex(index, event.target.value)}
                    onKeyDown={(event) => onCodeKeyDown(index, event)}
                    onPaste={onCodePaste}
                    onFocus={(event) => event.target.select()}
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`Code digit ${index + 1}`}
                  />
                ))}
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
