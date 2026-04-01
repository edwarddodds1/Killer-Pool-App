import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AVATAR_ICONS } from '../constants/avatarIcons'
import { AvatarBadge } from '../components/AvatarBadge'
import { BallIcon } from '../components/BallIcon'
import type { PlayerState, RoomState } from '../types'
import { activePlayer, allocateBalls, createNextGame, pickPlayerByBall, shuffle } from '../utils/game'
import {
  getProfile,
  getRoom,
  getRoomRemote,
  saveProfile,
  subscribeRoomRemote,
  upsertRoom,
  upsertRoomRemote,
} from '../utils/store'

const TICK_MS = 600
const REMOTE_SYNC_MS = 1800
const MAX_PLAYERS = 8
const BOT_NAMES = ['CueBot', 'RackBot', 'SpinBot', 'GhostCue', 'PocketPro', 'RailRunner', 'BankShot', 'SidePocket']
const SHUFFLE_TUNING_KEY = 'killer_pool_shuffle_tuning_v1'

type OrderAnimPhase =
  | 'lineup'
  | 'flipDown'
  | 'stackCenter'
  | 'shufflePile'
  | 'dealOut'
  | 'flipUp'
  | 'done'

interface OrderAnimCard {
  id: string
  name: string
  icon: string
  joinSlot: number
  slot: number | null
  faceDown: boolean
  revealed: boolean
  rotationDeg: number
  pileDepth: number
}

function randomIndex(maxExclusive: number) {
  if (maxExclusive <= 0) return 0
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0] % maxExclusive
}

function findNextTurn(room: RoomState, from: number) {
  if (!room.playOrder.length) return 0
  for (let i = 1; i <= room.playOrder.length; i += 1) {
    const idx = (from + i) % room.playOrder.length
    const candidateId = room.playOrder[idx]
    const candidate = room.players.find((p) => p.id === candidateId)
    if (candidate && !candidate.eliminated) return idx
  }
  return from
}

function buildJoinOrderCards(room: RoomState): OrderAnimCard[] {
  return room.players.map((player, idx) => ({
    id: player.id,
    name: player.username,
    icon: player.avatarIcon ?? player.username.charAt(0).toUpperCase(),
    joinSlot: idx,
    slot: idx,
    faceDown: false,
    revealed: false,
    rotationDeg: 0,
    pileDepth: idx,
  }))
}

function readShuffleTuning() {
  const defaults = {
    flipStaggerMs: 120,
    centerGatherMs: 420,
    shuffleMs: 680,
    dealStaggerMs: 120,
    dealTravelMs: 320,
    spinAmplitudeDeg: 28,
  }

  try {
    const raw = localStorage.getItem(SHUFFLE_TUNING_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<typeof defaults>
    return {
      flipStaggerMs: parsed.flipStaggerMs ?? defaults.flipStaggerMs,
      centerGatherMs: parsed.centerGatherMs ?? defaults.centerGatherMs,
      shuffleMs: parsed.shuffleMs ?? defaults.shuffleMs,
      dealStaggerMs: parsed.dealStaggerMs ?? defaults.dealStaggerMs,
      dealTravelMs: parsed.dealTravelMs ?? defaults.dealTravelMs,
      spinAmplitudeDeg: parsed.spinAmplitudeDeg ?? defaults.spinAmplitudeDeg,
    }
  } catch {
    return defaults
  }
}

export function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const profile = getProfile()
  const [room, setRoom] = useState<RoomState | null>(() => getRoom(code))
  const [allocationPreview, setAllocationPreview] = useState<number | null>(null)
  const [orderSpinName, setOrderSpinName] = useState<string | null>(null)
  const [eliminationText, setEliminationText] = useState('')
  const [orderPhase, setOrderPhase] = useState<OrderAnimPhase>('lineup')
  const [orderCards, setOrderCards] = useState<OrderAnimCard[]>([])
  const [dealingSlotIndex, setDealingSlotIndex] = useState<number | null>(null)
  const [orderAnimationDone, setOrderAnimationDone] = useState(false)
  const [localOrderStarted, setLocalOrderStarted] = useState(false)
  const [localOrderRunId, setLocalOrderRunId] = useState(0)
  const orderTimeoutsRef = useRef<number[]>([])
  const orderIntervalRef = useRef<number | null>(null)
  const orderAnimKeyRef = useRef('')
  const roomSnapshotRef = useRef<string>(JSON.stringify(room))

  useEffect(() => {
    if (!profile) {
      navigate('/')
      return
    }

    const syncFromRemote = async () => {
      const latest = await getRoomRemote(code)
      if (!latest) return
      const nextSnapshot = JSON.stringify(latest)
      if (nextSnapshot === roomSnapshotRef.current) return
      roomSnapshotRef.current = nextSnapshot
      setRoom(latest)
      upsertRoom(latest)
    }

    void syncFromRemote()
    const unsubscribe = subscribeRoomRemote(code, (latest) => {
      const nextSnapshot = JSON.stringify(latest)
      if (nextSnapshot === roomSnapshotRef.current) return
      roomSnapshotRef.current = nextSnapshot
      setRoom(latest)
      upsertRoom(latest)
    })

    const ticker = setInterval(() => {
      const latest = getRoom(code)
      if (!latest) return
      const nextSnapshot = JSON.stringify(latest)
      if (nextSnapshot === roomSnapshotRef.current) return
      roomSnapshotRef.current = nextSnapshot
      setRoom(latest)
    }, TICK_MS)

    let remoteSyncInFlight = false
    const remoteTicker = setInterval(() => {
      if (remoteSyncInFlight) return
      remoteSyncInFlight = true
      void getRoomRemote(code)
        .then((latest) => {
          if (!latest) return
          const nextSnapshot = JSON.stringify(latest)
          if (nextSnapshot === roomSnapshotRef.current) return
          roomSnapshotRef.current = nextSnapshot
          setRoom(latest)
          upsertRoom(latest)
        })
        .finally(() => {
          remoteSyncInFlight = false
        })
    }, REMOTE_SYNC_MS)
    return () => {
      clearInterval(ticker)
      clearInterval(remoteTicker)
      unsubscribe()
    }
  }, [code, navigate, profile])

  useEffect(
    () => () => {
      orderTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
      orderTimeoutsRef.current = []
      if (orderIntervalRef.current) {
        window.clearInterval(orderIntervalRef.current)
        orderIntervalRef.current = null
      }
    },
    [],
  )

  const me = useMemo(() => room?.players.find((player) => player.id === profile?.id), [profile?.id, room])
  const allReady = room ? room.players.length > 1 && room.players.every((player) => player.ready) : false
  const currentTurnPlayer = room ? activePlayer(room) : undefined
  const botsCount = room ? room.players.filter((player) => player.isBot).length : 0
  const playOrderKey = room ? room.playOrder.join(',') : ''
  const orderPlayersKey = room
    ? room.players.map((player) => `${player.id}:${player.username}:${player.avatarIcon ?? ''}`).join('|')
    : ''
  const shouldShowOrderStage = room
    ? room.status === 'order' || (room.status === 'allocation' && localOrderStarted && room.playOrder.length > 0)
    : false
  const takenIcons = new Set(
    (room?.players ?? [])
      .filter((player) => player.id !== me?.id)
      .map((player) => player.avatarIcon)
      .filter((icon): icon is string => Boolean(icon)),
  )

  const saveRoom = (next: RoomState, oldCode?: string) => {
    roomSnapshotRef.current = JSON.stringify(next)
    setRoom(next)
    upsertRoom(next, oldCode)
    void upsertRoomRemote(next, oldCode)
  }

  useEffect(() => {
    if (!room) return
    if (!shouldShowOrderStage || room.playOrder.length === 0) {
      orderAnimKeyRef.current = ''
      return
    }

    const nextAnimKey = `${room.code}-${room.gameNumber}-${playOrderKey}-${localOrderRunId}`
    if (orderAnimKeyRef.current === nextAnimKey) return
    orderAnimKeyRef.current = nextAnimKey

    orderTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
    orderTimeoutsRef.current = []
    if (orderIntervalRef.current) {
      window.clearInterval(orderIntervalRef.current)
      orderIntervalRef.current = null
    }

    const schedule = (callback: () => void, delayMs: number) => {
      const id = window.setTimeout(callback, delayMs)
      orderTimeoutsRef.current.push(id)
    }

    const tuning = readShuffleTuning()
    const total = room.playOrder.length
    const nextFinalOrder = room.playOrder

    schedule(() => {
      setOrderPhase('lineup')
      setOrderAnimationDone(false)
      setDealingSlotIndex(null)
      setOrderCards(buildJoinOrderCards(room))
    }, 0)

    schedule(() => setOrderPhase('flipDown'), 220)
    for (let i = 0; i < total; i += 1) {
      schedule(() => {
        setOrderCards((prev) =>
          prev.map((card) => (card.joinSlot === i ? { ...card, faceDown: true } : card)),
        )
      }, 280 + i * tuning.flipStaggerMs)
    }
    const flipDownEnd = 280 + total * tuning.flipStaggerMs

    schedule(() => {
      setOrderPhase('stackCenter')
      setOrderCards((prev) =>
        prev.map((card, idx) => ({ ...card, slot: null, rotationDeg: 0, pileDepth: idx })),
      )
    }, flipDownEnd + 40)
    const stackEnd = flipDownEnd + 40 + tuning.centerGatherMs

    schedule(() => {
      setOrderPhase('shufflePile')
      orderIntervalRef.current = window.setInterval(() => {
        setOrderCards((prev) =>
          prev.map((card) => ({
            ...card,
            rotationDeg: (Math.random() * 2 - 1) * 10,
            pileDepth: Math.floor(Math.random() * total),
          })),
        )
      }, 90)
    }, stackEnd)
    const shuffleEnd = stackEnd + tuning.shuffleMs

    schedule(() => {
      if (orderIntervalRef.current) {
        window.clearInterval(orderIntervalRef.current)
        orderIntervalRef.current = null
      }
      setOrderPhase('dealOut')
      const effectiveDealStagger = Math.max(tuning.dealStaggerMs, 110)
      nextFinalOrder.forEach((cardId, slotIndex) => {
        schedule(() => {
          setDealingSlotIndex(slotIndex)
          setOrderCards((prev) =>
            prev.map((card) =>
              card.id === cardId
                ? {
                    ...card,
                    slot: slotIndex,
                    pileDepth: 0,
                    rotationDeg:
                      tuning.spinAmplitudeDeg * (slotIndex % 2 === 0 ? 1 : -1),
                  }
                : card,
            ),
          )
        }, slotIndex * effectiveDealStagger)
        schedule(() => {
          setOrderCards((prev) =>
            prev.map((card) => (card.id === cardId ? { ...card, rotationDeg: 0 } : card)),
          )
        }, slotIndex * effectiveDealStagger + tuning.dealTravelMs)
      })
      schedule(() => setDealingSlotIndex(null), total * effectiveDealStagger + 20)
    }, shuffleEnd)

    const effectiveDealStagger = Math.max(tuning.dealStaggerMs, 110)
    const dealEnd = shuffleEnd + (total - 1) * effectiveDealStagger + tuning.dealTravelMs + 60

    schedule(() => {
      setOrderPhase('flipUp')
      for (let i = total - 1; i >= 0; i -= 1) {
        const revealOrderIndex = total - 1 - i
        const cardId = nextFinalOrder[i]
        schedule(() => {
          setOrderCards((prev) =>
            prev.map((card) =>
              card.id === cardId ? { ...card, faceDown: false, revealed: true } : card,
            ),
          )
        }, revealOrderIndex * tuning.flipStaggerMs)
      }
      schedule(() => {
        setOrderPhase('done')
        setOrderAnimationDone(true)
      }, total * tuning.flipStaggerMs + 80)
    }, dealEnd)

    return () => {
      orderTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
      orderTimeoutsRef.current = []
      if (orderIntervalRef.current) {
        window.clearInterval(orderIntervalRef.current)
        orderIntervalRef.current = null
      }
    }
  }, [room, room?.code, room?.gameNumber, shouldShowOrderStage, localOrderRunId, playOrderKey, orderPlayersKey])

  if (!room || !profile || !me) {
    return (
      <main className="page">
        <section className="card">
          <h2>Room not found</h2>
          <button className="btn btn--primary" onClick={() => navigate('/')}>
            Back to home
          </button>
        </section>
      </main>
    )
  }

  const toggleReady = () => {
    saveRoom({
      ...room,
      players: room.players.map((player) =>
        player.id === me.id ? { ...player, ready: !player.ready } : player,
      ),
    })
  }

  const startAllocation = () => {
    if (!allReady) return
    const allocation = allocateBalls(room.players, room.mode, room.killerAllocationMode)
    const nextPlayers = room.players.map((player) => ({
      ...player,
      assignedBalls: allocation.get(player.id) ?? [],
    }))
    const tempSpinner = setInterval(() => setAllocationPreview(Math.floor(Math.random() * 15) + 1), 90)
    setTimeout(() => {
      clearInterval(tempSpinner)
      setAllocationPreview((allocation.get(me.id) ?? [1])[0])
      saveRoom({ ...room, status: 'allocation', players: nextPlayers })
    }, 1300)
  }

  const startOrder = () => {
    setLocalOrderStarted(true)
    setLocalOrderRunId((current) => current + 1)
    if (room.playOrder.length) {
      setOrderSpinName(room.players.find((player) => player.id === room.playOrder[0])?.username ?? null)
      if (room.status !== 'order') {
        saveRoom({ ...room, status: 'order' })
      }
      return
    }
    const names = room.players.map((player) => player.username)
    const spin = setInterval(() => setOrderSpinName(names[Math.floor(Math.random() * names.length)]), 80)
    setTimeout(() => {
      clearInterval(spin)
      const order = shuffle(room.players.map((player) => player.id))
      const next: RoomState = {
        ...room,
        status: 'order',
        playOrder: order,
        turnIndex: 0,
      }
      setOrderSpinName(next.players.find((player) => player.id === order[0])?.username ?? null)
      saveRoom(next)
    }, 1200)
  }

  const beginMatch = () => {
    const nextPlayers = room.players.map((player) => ({ ...player }))
    const firstTurnId = room.playOrder[0]
    const firstTurnPlayer = nextPlayers.find((player) => player.id === firstTurnId)
    if (firstTurnPlayer) {
      firstTurnPlayer.turns = (firstTurnPlayer.turns ?? 0) + 1
    }
    saveRoom({ ...room, status: 'inGame', players: nextPlayers, turnIndex: 0 })
  }

  const potBall = (ball: number) => {
    if (room.sunkBalls.includes(ball) || !currentTurnPlayer) return
    const nextPlayers = room.players.map((player) => ({ ...player }))
    const current = nextPlayers.find((player) => player.id === currentTurnPlayer.id)
    if (!current) return
    current.pottedBalls = [...current.pottedBalls, ball]

    const owner = pickPlayerByBall(room, ball)
    const nextEliminationOrder = [...room.eliminationOrder]
    if (owner) {
      const owned = nextPlayers.find((player) => player.id === owner.id)
      const ownerAllBallsSunk = owned
        ? owned.assignedBalls.every((assignedBall) => assignedBall === ball || room.sunkBalls.includes(assignedBall))
        : false
      if (owned && !owned.eliminated && ownerAllBallsSunk) {
        owned.eliminated = true
        if (owner.id !== current.id) current.kills += 1
        nextEliminationOrder.push(owned.id)
        setEliminationText(`${owned.username} eliminated (all assigned balls sunk)`)
      }
    }

    const isCurrentPlayersOwnBall = owner?.id === current.id
    const currentAllOwnBallsSunk = current.assignedBalls.every(
      (assignedBall) => assignedBall === ball || room.sunkBalls.includes(assignedBall),
    )
    const shouldAutoEndTurn =
      isCurrentPlayersOwnBall &&
      (room.mode !== 'killer' ||
        room.killerAllocationMode !== 'multi' ||
        currentAllOwnBallsSunk)

    const activeRemaining = nextPlayers.filter((player) => !player.eliminated)
    const nextStatus = activeRemaining.length <= 1 ? 'results' : room.status
    const roomAfterPot = { ...room, players: nextPlayers }
    const nextTurnIndex =
      shouldAutoEndTurn && nextStatus !== 'results'
        ? findNextTurn(roomAfterPot, room.turnIndex)
        : room.turnIndex
    if (shouldAutoEndTurn && nextStatus !== 'results') {
      const nextTurnPlayerId = room.playOrder[nextTurnIndex]
      const nextTurnPlayer = nextPlayers.find((player) => player.id === nextTurnPlayerId)
      if (nextTurnPlayer) {
        nextTurnPlayer.turns = (nextTurnPlayer.turns ?? 0) + 1
      }
    }
    saveRoom({
      ...room,
      status: nextStatus,
      players: nextPlayers,
      turnIndex: nextTurnIndex,
      sunkBalls: [...room.sunkBalls, ball],
      eliminationOrder: nextEliminationOrder,
    })
  }

  const endTurn = () => {
    const nextTurnIndex = findNextTurn(room, room.turnIndex)
    const nextPlayers = room.players.map((player) => ({ ...player }))
    const nextTurnPlayerId = room.playOrder[nextTurnIndex]
    const nextTurnPlayer = nextPlayers.find((player) => player.id === nextTurnPlayerId)
    if (nextTurnPlayer) {
      nextTurnPlayer.turns = (nextTurnPlayer.turns ?? 0) + 1
    }
    saveRoom({ ...room, players: nextPlayers, turnIndex: nextTurnIndex })
  }

  const replay = () => {
    const oldCode = room.code
    let next = createNextGame(room)
    while (getRoom(next.code)) next = createNextGame(room)
    saveRoom(next, oldCode)
    navigate(`/room/${next.code}`)
  }

  const selectAvatarIcon = (icon: string) => {
    if (takenIcons.has(icon)) return
    saveProfile({ ...profile, avatarIcon: icon })
    saveRoom({
      ...room,
      players: room.players.map((player) => (player.id === me.id ? { ...player, avatarIcon: icon } : player)),
    })
  }

  const addRandomBots = () => {
    if (room.status !== 'lobby') return
    const openSpots = MAX_PLAYERS - room.players.length
    if (openSpots <= 0) return
    const usedNames = new Set(room.players.map((player) => player.username))
    const usedIcons = new Set(
      room.players
        .map((player) => player.avatarIcon)
        .filter((icon): icon is string => Boolean(icon)),
    )
    const nextPlayers = [...room.players]
    const baseName = BOT_NAMES[randomIndex(BOT_NAMES.length)]
    let candidateName = baseName
    let suffix = 2
    while (usedNames.has(candidateName)) {
      candidateName = `${baseName}${suffix}`
      suffix += 1
    }
    usedNames.add(candidateName)
    const availableIcons = AVATAR_ICONS.filter((icon) => !usedIcons.has(icon))
    if (!availableIcons.length) return
    const icon = availableIcons[randomIndex(availableIcons.length)]
    usedIcons.add(icon)
    nextPlayers.push({
      id: `bot-${crypto.randomUUID()}`,
      username: candidateName,
      avatarIcon: icon,
      isBot: true,
      ready: true,
      assignedBalls: [],
      pottedBalls: [],
      turns: 0,
      kills: 0,
      eliminated: false,
    })
    saveRoom({ ...room, players: nextPlayers })
  }

  const clearBots = () => {
    if (room.status !== 'lobby') return
    saveRoom({ ...room, players: room.players.filter((player) => !player.isBot) })
  }

  const resultsOrder = (() => {
    const byId = new Map(room.players.map((player) => [player.id, player]))
    const eliminatedReverse = room.eliminationOrder
      .slice()
      .reverse()
      .map((id) => byId.get(id))
      .filter((player): player is PlayerState => Boolean(player))
    const survivors = room.players.filter((player) => !player.eliminated)
    return [...survivors, ...eliminatedReverse]
  })()

  const breakerPlayer = room.playOrder.length
    ? room.players.find((player) => player.id === room.playOrder[0])?.username
    : null
  const breakerName = breakerPlayer ?? orderSpinName ?? 'Pending...'

  const shareLink = `${window.location.origin}/join?code=${room.code}`

  return (
    <main className="page">
      <header className="card header">
        <div className="header__left">
          <AvatarBadge username={me.username} avatarIcon={me.avatarIcon} />
          <div>
            <strong>{me.username}</strong>
            {room.status !== 'inGame' ? <p>Code: {room.code}</p> : null}
          </div>
        </div>
        {me.assignedBalls.length > 0 ? (
          <div className="headerBallIndicator">
            {me.assignedBalls.map((ball) => (
              <BallIcon key={ball} ball={ball} />
            ))}
          </div>
        ) : room.status !== 'inGame' ? (
          <button className="btn btn--small" onClick={() => navigator.clipboard?.writeText(shareLink)}>
            Copy invite link
          </button>
        ) : null}
      </header>

      {room.status === 'lobby' ? (
        <section className="card">
          <h2>Lobby</h2>
          <div className="stack">
            <p className="muted">
              {me.avatarIcon
                ? 'You can change your icon any time. Taken icons are unavailable.'
                : 'Icon is optional. You can keep your initial letter or pick an icon.'}
            </p>
            <div className="avatarPicker">
              {AVATAR_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={`avatarPick ${
                    takenIcons.has(icon) && me.avatarIcon !== icon ? 'avatarPick--taken' : ''
                  } ${me.avatarIcon === icon ? 'avatarPick--selected' : ''}`}
                  onClick={() => selectAvatarIcon(icon)}
                  disabled={takenIcons.has(icon) && me.avatarIcon !== icon}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <p className="muted">
            {room.mode === 'killer' ? 'Killer Pool' : 'Kelly Pool'} · {room.killerAllocationMode} ball allocation
          </p>
          <div className="playerList">
            {room.players.map((player) => (
              <div key={player.id} className="playerRow">
                <div className="header__left">
                  <AvatarBadge username={player.username} avatarIcon={player.avatarIcon} size="sm" />
                  <span>
                    {player.username}
                    {player.isBot ? ' (BOT)' : ''}
                  </span>
                </div>
                <span className={player.ready ? 'ready ready--yes' : 'ready'}>
                  {player.ready ? 'Ready' : 'Waiting'}
                </span>
              </div>
            ))}
          </div>
          <div className="stack">
            <button className="btn btn--ready" onClick={toggleReady}>
              {me.ready ? 'Unready' : 'Ready'}
            </button>
            <button className="btn btn--primary" onClick={startAllocation} disabled={!allReady}>
              Start Ball Allocation
            </button>
            <div className="split">
              <button className="btn" onClick={addRandomBots} disabled={room.players.length >= MAX_PLAYERS}>
                Add Bot
              </button>
              <button className="btn" onClick={clearBots} disabled={botsCount === 0}>
                Clear bots
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {room.status === 'allocation' && !shouldShowOrderStage ? (
        <section className="card center">
          <h2>Ball Allocation</h2>
          <p className="muted">Your random ball</p>
          <div className={`ballReveal ${me.assignedBalls.length > 1 ? 'ballReveal--multi' : ''}`}>
            {(me.assignedBalls.length > 0 ? me.assignedBalls : [allocationPreview ?? 1]).map((ball) => (
              <BallIcon key={ball} ball={ball} large={me.assignedBalls.length <= 1} />
            ))}
          </div>
          <button className="btn btn--primary" onClick={startOrder}>
            {room.playOrder.length ? 'Open Break and Order' : 'Decide Break and Order'}
          </button>
        </section>
      ) : null}

      {shouldShowOrderStage ? (
        <section className="card">
          <h2>Break & Order</h2>
          <p className="muted">
            Breaker:{' '}
            <span className={`breakerName ${orderAnimationDone ? 'breakerName--visible' : ''}`}>
              {orderAnimationDone ? breakerName : ''}
            </span>
          </p>
          <div className="previewStage previewStage--cards">
            <div
              className="shuffleTable"
              style={{ '--slot-count': room.playOrder.length } as CSSProperties}
            >
              <div className="dealSlots">
                {Array.from({ length: room.playOrder.length }, (_, slotIndex) => (
                  <div
                    key={slotIndex}
                    className={`dealSlot ${
                      orderPhase === 'dealOut' && dealingSlotIndex === slotIndex
                        ? 'dealSlot--active'
                        : ''
                    }`}
                    style={{ left: `${(slotIndex + 0.5) * (100 / room.playOrder.length)}%` }}
                  />
                ))}
              </div>
              {orderCards.map((card) => {
                const slot = card.slot ?? 0
                const xPercent = card.slot === null ? 50 : (slot + 0.5) * (100 / room.playOrder.length)
                const pileNudgeX = card.slot === null ? (card.pileDepth % 3) * 2 - 2 : 0
                const pileNudgeY = card.slot === null ? Math.floor(card.pileDepth / 2) * 1.3 : 0
                const rank = card.slot !== null ? card.slot + 1 : null

                return (
                  <div
                    key={card.id}
                    className={`dealCard ${card.faceDown ? 'dealCard--down' : 'dealCard--up'}`}
                    style={{
                      left: `${xPercent}%`,
                      transform: `translate(-50%, -50%) translate(${pileNudgeX}px, ${pileNudgeY}px) rotate(${card.rotationDeg}deg)`,
                    }}
                  >
                    <div className="dealCard__inner">
                      <div className="dealCard__face dealCard__face--front">
                        {card.revealed && rank !== null ? (
                          <span className="rankCorner">{rank}</span>
                        ) : null}
                        <span className="dealCardIcon">{card.icon}</span>
                        {room.playOrder.length <= 6 ? <small>{card.name}</small> : null}
                      </div>
                      <div className="dealCard__face dealCard__face--back">
                        <span className="backMark">K</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button className="btn btn--primary" onClick={beginMatch} disabled={!orderAnimationDone}>
            Start Match
          </button>
        </section>
      ) : null}

      {room.status === 'inGame' ? (
        <section className="card">
          <h2>In Game</h2>
          <p className="turnText">
            Turn: <strong>{currentTurnPlayer?.username ?? '-'}</strong>
          </p>
          <div className="ballGrid">
            {Array.from({ length: 15 }, (_, idx) => idx + 1).map((ball) => (
              <BallIcon key={ball} ball={ball} sunk={room.sunkBalls.includes(ball)} onClick={() => potBall(ball)} />
            ))}
          </div>
          {eliminationText ? <p className="error">{eliminationText}</p> : null}
          <div className="playersRow">
            {room.playOrder.map((id) => {
              const player = room.players.find((p) => p.id === id)
              if (!player) return null
              const isTurn = currentTurnPlayer?.id === player.id
              return (
                <div
                  className={`playerMiniCard ${isTurn ? 'playerMiniCard--turn' : ''} ${
                    player.eliminated ? 'playerMiniCard--out' : 'playerMiniCard--in'
                  }`}
                  key={player.id}
                >
                  <div className="stack center">
                    <AvatarBadge username={player.username} avatarIcon={player.avatarIcon} size="sm" />
                    <small>{player.username}</small>
                    {isTurn ? <small className="turnBadge">TURN</small> : null}
                  </div>
                  <div className="playerMiniPots">
                    {player.pottedBalls.map((ball, index) => (
                      <BallIcon key={`${ball}-${index}`} ball={ball} showNumber={false} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <button className="btn btn--danger" onClick={endTurn}>
            End {currentTurnPlayer?.username ?? 'player'}'s turn
          </button>
        </section>
      ) : null}

      {room.status === 'results' ? (
        <section className="card">
          <h2>Winner</h2>
          <div className="stack">
            <div className="playerRow resultsHeaderRow" aria-hidden="true">
              <span />
              <small className="resultsStats resultsStats--head">
                <span className="resultsStat">Turns</span>
                <span className="resultsStat">Shots</span>
                <span className="resultsStat">Pots</span>
                <span className="resultsStat">Accuracy</span>
              </small>
            </div>
            {resultsOrder.map((player, index) => (
              <div className="playerRow" key={player.id}>
                <span>
                  {index + 1}. {player.username}
                </span>
                <small className="resultsStats">
                  <span className="resultsStat">
                    <strong>{player.turns ?? 0}</strong>
                  </span>
                  <span className="resultsStat">
                    <strong>{(player.turns ?? 0) + player.pottedBalls.length}</strong>
                  </span>
                  <span className="resultsStat">
                    <strong>{player.pottedBalls.length}</strong>
                  </span>
                  <span className="resultsStat">
                    <strong>
                      {Math.round(
                        player.pottedBalls.length === 0
                          ? 0
                          : (player.pottedBalls.length /
                              ((player.turns ?? 0) + player.pottedBalls.length)) *
                              100,
                      )}
                      %
                    </strong>
                  </span>
                </small>
              </div>
            ))}
          </div>
          <div className="split">
            <button className="btn btn--primary" onClick={replay}>
              Replay
            </button>
            <button className="btn" onClick={() => navigate('/')}>
              Quit
            </button>
          </div>
        </section>
      ) : null}

      <button className="leaveGameBtn" onClick={() => navigate('/')}>
        Leave game
      </button>
    </main>
  )
}
