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
