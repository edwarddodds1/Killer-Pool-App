import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { AVATAR_ICONS } from '../constants/avatarIcons'

type Phase = 'lineup' | 'flipDown' | 'stackCenter' | 'shufflePile' | 'dealOut' | 'flipUp' | 'done'

interface PreviewPlayer {
  id: number
  name: string
  icon: string
}

interface CardVisual {
  id: number
  name: string
  icon: string
  joinSlot: number
  slot: number | null
  faceDown: boolean
  revealed: boolean
  rotationDeg: number
  pileDepth: number
}

const SHUFFLE_TUNING_KEY = 'killer_pool_shuffle_tuning_v1'

function readPreviewTuning() {
  const defaults = {
    playerCount: 6,
    flipStaggerMs: 120,
    centerGatherMs: 420,
    shuffleMs: 680,
    dealStaggerMs: 120,
    dealTravelMs: 320,
    spinAmplitudeDeg: 28,
  }

  const saved = localStorage.getItem(SHUFFLE_TUNING_KEY)
  if (!saved) return defaults
  try {
    const parsed = JSON.parse(saved) as Partial<typeof defaults>
    const nextPlayerCount =
      parsed.playerCount && parsed.playerCount >= 2 && parsed.playerCount <= 8
        ? parsed.playerCount
        : defaults.playerCount
    return {
      playerCount: nextPlayerCount,
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

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWithRng<T>(items: T[], rng: () => number) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildJoinOrder(players: PreviewPlayer[]) {
  return players.map((player, idx) => ({
    id: player.id,
    name: player.name,
    icon: player.icon,
    joinSlot: idx,
    slot: idx,
    faceDown: false,
    revealed: false,
    rotationDeg: 0,
    pileDepth: idx,
  }))
}

function CardShufflePreview({
  players,
  seed,
  flipStaggerMs,
  centerGatherMs,
  shuffleMs,
  dealStaggerMs,
  dealTravelMs,
  spinAmplitudeDeg,
}: {
  players: PreviewPlayer[]
  seed: number
  flipStaggerMs: number
  centerGatherMs: number
  shuffleMs: number
  dealStaggerMs: number
  dealTravelMs: number
  spinAmplitudeDeg: number
}) {
  const timeoutsRef = useRef<number[]>([])
  const intervalRef = useRef<number | null>(null)
  const [phase, setPhase] = useState<Phase>('lineup')
  const [runId, setRunId] = useState(0)
  const [cards, setCards] = useState<CardVisual[]>(() => buildJoinOrder(players))
  const [dealingSlotIndex, setDealingSlotIndex] = useState<number | null>(null)

  const clearTimers = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t))
    timeoutsRef.current = []
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const schedule = (callback: () => void, delayMs: number) => {
    const id = window.setTimeout(callback, delayMs)
    timeoutsRef.current.push(id)
  }

  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (!runId) return
    clearTimers()
    const rng = mulberry32(seed + runId * 1009 + 7421)
    const nextFinalOrder = shuffleWithRng(players.map((p) => p.id), rng)
    const total = players.length

    schedule(() => {
      setPhase('lineup')
      setCards(buildJoinOrder(players))
      setDealingSlotIndex(null)
    }, 0)

    schedule(() => setPhase('flipDown'), 220)
    for (let i = 0; i < total; i += 1) {
      schedule(() => {
        setCards((prev) => prev.map((card) => (card.joinSlot === i ? { ...card, faceDown: true } : card)))
      }, 280 + i * flipStaggerMs)
    }
    const flipDownEnd = 280 + total * flipStaggerMs

    schedule(() => {
      setPhase('stackCenter')
      setCards((prev) =>
        prev.map((card, idx) => ({ ...card, slot: null, rotationDeg: 0, pileDepth: idx })),
      )
    }, flipDownEnd + 40)
    const stackEnd = flipDownEnd + 40 + centerGatherMs

    schedule(() => {
      setPhase('shufflePile')
      intervalRef.current = window.setInterval(() => {
        setCards((prev) =>
          prev.map((card) => ({
            ...card,
            rotationDeg: (rng() * 2 - 1) * 10,
            pileDepth: Math.floor(rng() * total),
          })),
        )
      }, 90)
    }, stackEnd)
    const shuffleEnd = stackEnd + shuffleMs

    schedule(() => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setPhase('dealOut')
      const effectiveDealStagger = Math.max(dealStaggerMs, 110)
      nextFinalOrder.forEach((cardId, slotIndex) => {
        schedule(() => {
          setDealingSlotIndex(slotIndex)
          setCards((prev) =>
            prev.map((card) =>
              card.id === cardId
                ? {
                    ...card,
                    slot: slotIndex,
                    pileDepth: 0,
                    rotationDeg: spinAmplitudeDeg * (slotIndex % 2 === 0 ? 1 : -1),
                  }
                : card,
            ),
          )
        }, slotIndex * effectiveDealStagger)
        schedule(() => {
          setCards((prev) =>
            prev.map((card) => (card.id === cardId ? { ...card, rotationDeg: 0 } : card)),
          )
        }, slotIndex * effectiveDealStagger + dealTravelMs)
      })
      schedule(() => setDealingSlotIndex(null), total * effectiveDealStagger + 20)
    }, shuffleEnd)
    const effectiveDealStagger = Math.max(dealStaggerMs, 110)
    const dealEnd = shuffleEnd + (total - 1) * effectiveDealStagger + dealTravelMs + 60

    schedule(() => {
      setPhase('flipUp')
      for (let i = total - 1; i >= 0; i -= 1) {
        const revealOrderIndex = total - 1 - i
        const cardId = nextFinalOrder[i]
        schedule(() => {
          setCards((prev) =>
            prev.map((card) =>
              card.id === cardId ? { ...card, faceDown: false, revealed: true } : card,
            ),
          )
        }, revealOrderIndex * flipStaggerMs)
      }
      schedule(() => setPhase('done'), total * flipStaggerMs + 80)
    }, dealEnd)

    return () => clearTimers()
  }, [
    runId,
    seed,
    players,
    flipStaggerMs,
    centerGatherMs,
    shuffleMs,
    dealStaggerMs,
    dealTravelMs,
    spinAmplitudeDeg,
  ])

  const replay = () => setRunId((x) => x + 1)
  const total = players.length

  return (
    <section className="card">
      <div className="header">
        <div>
          <h2>Card Shuffle Preview</h2>
          <p className="muted">Join order, flip down, stack, shuffle, deal, then reveal.</p>
        </div>
        <button className="btn btn--small" onClick={replay}>
          Replay
        </button>
      </div>

      <div className="previewStage previewStage--cards">
        <div className="shuffleTable" style={{ '--slot-count': total } as CSSProperties}>
          <div className="dealSlots">
            {Array.from({ length: total }, (_, slotIndex) => (
              <div
                key={slotIndex}
                className={`dealSlot ${
                  phase === 'dealOut' && dealingSlotIndex === slotIndex ? 'dealSlot--active' : ''
                }`}
                style={{ left: `${(slotIndex + 0.5) * (100 / total)}%` }}
              />
            ))}
          </div>
          {cards.map((card) => {
            const slot = card.slot ?? 0
            const xPercent = card.slot === null ? 50 : (slot + 0.5) * (100 / total)
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
                    {card.revealed && rank !== null ? <span className="rankCorner">{rank}</span> : null}
                    <span className="dealCardIcon">{card.icon}</span>
                    {total <= 6 ? <small>{card.name}</small> : null}
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

    </section>
  )
}

export function BreakPreviewPage() {
  const initialTuning = useMemo(() => readPreviewTuning(), [])
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000))
  const [playerCount, setPlayerCount] = useState(initialTuning.playerCount)
  const [flipStaggerMs, setFlipStaggerMs] = useState(initialTuning.flipStaggerMs)
  const [centerGatherMs, setCenterGatherMs] = useState(initialTuning.centerGatherMs)
  const [shuffleMs, setShuffleMs] = useState(initialTuning.shuffleMs)
  const [dealStaggerMs, setDealStaggerMs] = useState(initialTuning.dealStaggerMs)
  const [dealTravelMs, setDealTravelMs] = useState(initialTuning.dealTravelMs)
  const [spinAmplitudeDeg, setSpinAmplitudeDeg] = useState(initialTuning.spinAmplitudeDeg)

  useEffect(() => {
    localStorage.setItem(
      SHUFFLE_TUNING_KEY,
      JSON.stringify({
        playerCount,
        flipStaggerMs,
        centerGatherMs,
        shuffleMs,
        dealStaggerMs,
        dealTravelMs,
        spinAmplitudeDeg,
      }),
    )
  }, [playerCount, flipStaggerMs, centerGatherMs, shuffleMs, dealStaggerMs, dealTravelMs, spinAmplitudeDeg])

  const allPlayers = useMemo<PreviewPlayer[]>(
    () => [
      { id: 1, name: 'Alex', icon: AVATAR_ICONS[0] },
      { id: 2, name: 'Mia', icon: AVATAR_ICONS[1] },
      { id: 3, name: 'Jay', icon: AVATAR_ICONS[2] },
      { id: 4, name: 'Rae', icon: AVATAR_ICONS[3] },
      { id: 5, name: 'Noah', icon: AVATAR_ICONS[4] },
      { id: 6, name: 'Zoe', icon: AVATAR_ICONS[5] },
      { id: 7, name: 'Kai', icon: AVATAR_ICONS[6] },
      { id: 8, name: 'Luna', icon: AVATAR_ICONS[7] },
    ],
    [],
  )
  const players = useMemo(() => allPlayers.slice(0, playerCount), [allPlayers, playerCount])

  return (
    <main className="page">
      <section className="card">
        <div className="header pageHeadingRow breakPreviewHeadingRow">
          <div className="pageHeadingRow__start breakPreviewHeadingRow__text">
            <h1 className="pageHeadingRow__title">Card Shuffle Tuner</h1>
            <p className="muted">Polish the exact break/order card sequence.</p>
          </div>
          <AppHeaderNavIcons />
        </div>
        <div className="header">
          <small className="muted">Seed: {seed}</small>
          <button className="btn btn--small" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
            Randomize seed
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Tuning controls</h2>
        <div className="previewControls">
          <label className="field">
            Players ({playerCount})
            <input
              type="range"
              min={2}
              max={8}
              step={1}
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Flip cadence ({flipStaggerMs}ms)
            <input type="range" min={70} max={220} step={5} value={flipStaggerMs} onChange={(e) => setFlipStaggerMs(Number(e.target.value))} />
          </label>
          <label className="field">
            Gather to center ({centerGatherMs}ms)
            <input type="range" min={220} max={900} step={10} value={centerGatherMs} onChange={(e) => setCenterGatherMs(Number(e.target.value))} />
          </label>
          <label className="field">
            Shuffle pile ({shuffleMs}ms)
            <input type="range" min={300} max={1300} step={20} value={shuffleMs} onChange={(e) => setShuffleMs(Number(e.target.value))} />
          </label>
          <label className="field">
            Deal stagger ({dealStaggerMs}ms)
            <input type="range" min={70} max={220} step={5} value={dealStaggerMs} onChange={(e) => setDealStaggerMs(Number(e.target.value))} />
          </label>
          <label className="field">
            Deal travel ({dealTravelMs}ms)
            <input type="range" min={180} max={650} step={10} value={dealTravelMs} onChange={(e) => setDealTravelMs(Number(e.target.value))} />
          </label>
          <label className="field">
            Spin amplitude ({spinAmplitudeDeg}deg)
            <input type="range" min={0} max={70} step={1} value={spinAmplitudeDeg} onChange={(e) => setSpinAmplitudeDeg(Number(e.target.value))} />
          </label>
        </div>
      </section>

      <CardShufflePreview
        players={players}
        seed={seed}
        flipStaggerMs={flipStaggerMs}
        centerGatherMs={centerGatherMs}
        shuffleMs={shuffleMs}
        dealStaggerMs={dealStaggerMs}
        dealTravelMs={dealTravelMs}
        spinAmplitudeDeg={spinAmplitudeDeg}
      />
    </main>
  )
}
