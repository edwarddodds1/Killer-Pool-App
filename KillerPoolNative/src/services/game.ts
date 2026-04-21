import type {
  GameMode,
  KillerAllocationMode,
  PlayerState,
  Profile,
  RoomState,
} from '../types/domain';

const ALL_BALLS = Array.from({ length: 15 }, (_, idx) => idx + 1);

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export function createRandomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i += 1) code += String(randomInt(10));
  return code;
}

function makePlayers(profiles: Profile[]): PlayerState[] {
  return profiles.map((profile) => ({
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
  }));
}

export function allocateBalls(
  players: PlayerState[],
  mode: GameMode,
  killerAllocationMode: KillerAllocationMode,
): Map<string, number[]> {
  const shuffledBalls = shuffle(ALL_BALLS);
  const byId = new Map<string, number[]>();
  const seats = players.length;
  if (seats === 0) return byId;

  if (mode === 'killer' && killerAllocationMode === 'single') {
    players.forEach((player, idx) => byId.set(player.id, [shuffledBalls[idx]]));
    return byId;
  }

  if (mode === 'killer' && killerAllocationMode === 'multi') {
    const ballsPerPlayer = Math.floor(shuffledBalls.length / seats);
    const assignedCount = ballsPerPlayer * seats;
    shuffledBalls.slice(0, assignedCount).forEach((ball, idx) => {
      const owner = players[idx % seats];
      const current = byId.get(owner.id) ?? [];
      current.push(ball);
      byId.set(owner.id, current);
    });
    return byId;
  }

  shuffledBalls.forEach((ball, idx) => {
    const owner = players[idx % seats];
    const current = byId.get(owner.id) ?? [];
    current.push(ball);
    byId.set(owner.id, current);
  });
  return byId;
}

export function buildNewRoom(
  host: Profile,
  mode: GameMode,
  killerAllocationMode: KillerAllocationMode,
): RoomState {
  return {
    code: createRandomCode(),
    gameNumber: 1,
    mode,
    killerAllocationMode,
    status: 'lobby',
    players: makePlayers([host]),
    playOrder: [],
    turnIndex: 0,
    sunkBalls: [],
    eliminationOrder: [],
  };
}

export function removePlayerFromRoom(room: RoomState, playerId: string): RoomState {
  if (!room.players.some((p) => p.id === playerId)) {
    return room;
  }

  const nextPlayers = room.players.filter((p) => p.id !== playerId);
  const nextPlayOrder = room.playOrder.filter((id) => id !== playerId);
  const nextEliminationOrder = room.eliminationOrder.filter((id) => id !== playerId);

  let nextTurnIndex = 0;
  if (nextPlayOrder.length > 0) {
    const prevActiveId = room.playOrder[room.turnIndex];
    if (prevActiveId === playerId) {
      const len = room.playOrder.length;
      let found = -1;
      for (let step = 1; step <= len; step += 1) {
        const idx = (room.turnIndex + step) % len;
        const candidate = room.playOrder[idx];
        if (candidate !== playerId && nextPlayOrder.includes(candidate)) {
          found = nextPlayOrder.indexOf(candidate);
          break;
        }
      }
      nextTurnIndex = found >= 0 ? found : 0;
    } else if (prevActiveId && nextPlayOrder.includes(prevActiveId)) {
      nextTurnIndex = nextPlayOrder.indexOf(prevActiveId);
    } else {
      nextTurnIndex = Math.min(room.turnIndex, nextPlayOrder.length - 1);
    }
  }

  return {
    ...room,
    players: nextPlayers,
    playOrder: nextPlayOrder,
    eliminationOrder: nextEliminationOrder,
    turnIndex: nextTurnIndex,
  };
}
