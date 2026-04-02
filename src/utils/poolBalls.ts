export interface PoolBallInfo {
  number: number
  color: string
  striped: boolean
}

const baseColors = ['#f6d500', '#114ad6', '#d32f2f', '#6a1b9a', '#f57c00', '#1b8f3f', '#6d2b16']

const balls: PoolBallInfo[] = [
  { number: 1, color: baseColors[0], striped: false },
  { number: 2, color: baseColors[1], striped: false },
  { number: 3, color: baseColors[2], striped: false },
  { number: 4, color: baseColors[3], striped: false },
  { number: 5, color: baseColors[4], striped: false },
  { number: 6, color: baseColors[5], striped: false },
  { number: 7, color: baseColors[6], striped: false },
  { number: 8, color: baseColors[5], striped: false },
  { number: 9, color: baseColors[0], striped: true },
  { number: 10, color: baseColors[1], striped: true },
  { number: 11, color: baseColors[2], striped: true },
  { number: 12, color: baseColors[3], striped: true },
  { number: 13, color: baseColors[4], striped: true },
  { number: 14, color: baseColors[5], striped: true },
  { number: 15, color: baseColors[6], striped: true },
]

export function getBall(ballNumber: number) {
  return balls.find((ball) => ball.number === ballNumber) ?? balls[0]
}
