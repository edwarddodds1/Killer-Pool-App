export type RulesGameMode = 'killer' | 'multiball' | 'timer' | 'oneVone'

export type RulesContentEntry = {
  title: string
  rules: string[]
}

export const RULES_BY_MODE: Record<RulesGameMode, RulesContentEntry> = {
  killer: {
    title: 'Killer Pool - Single Ball',
    rules: [
      'Each player is assigned one ball to protect.',
      "Take turns potting any ball that isn't yours.",
      'If you pot the cue ball, your turn ends immediately. The next player shoots forward from behind the baulk line.',
      'You are eliminated when your ball is potted by another player.',
      'Last player with their ball still on the table wins.',
    ],
  },
  multiball: {
    title: 'Killer Pool - Multi Ball',
    rules: [
      "Each player is assigned multiple balls; everyone else's balls must be potted to eliminate them.",
      'Take turns potting balls not assigned to you.',
      'If you pot the cue ball, your turn ends immediately. The next player plays from behind the baulk line, shooting forward.',
      'A player is eliminated only when all of their assigned balls have been potted.',
      'Last player with at least one ball remaining wins.',
    ],
  },
  timer: {
    title: 'Timer Pool',
    rules: [
      'Pot all balls on the table as fast as possible.',
      'All balls must be completely stationary before you play your next shot.',
      'Potting the cue ball = shot from behind the baulk line.',
      'Touching any ball to your advantage = +10 second penalty.',
      'White ball leaving the table = +10 second penalty.',
    ],
  },
  oneVone: {
    title: 'Duel',
    rules: [
      'Standard professional pool rules apply.',
      'Players alternate turns. Pot a ball of your assigned type to continue your turn.',
      'Pot the white or commit a foul and your opponent gets ball-in-hand.',
      'Pot the 8 ball after all your balls are cleared to win.',
      'Potting the black early or off the table = instant loss.',
      'At the end of the game, record the winner and how many balls remain on the table for stats tracking.',
    ],
  },
}
