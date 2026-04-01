import type { CSSProperties } from 'react'
import { getBall } from '../utils/poolBalls'

interface BallIconProps {
  ball: number
  sunk?: boolean
  large?: boolean
  showNumber?: boolean
  onClick?: () => void
}

export function BallIcon({
  ball,
  sunk = false,
  large = false,
  showNumber = true,
  onClick,
}: BallIconProps) {
  const info = getBall(ball)
  const classNames = [
    'ball',
    info.striped ? 'ball--striped' : 'ball--solid',
    sunk ? 'ball--sunk' : '',
    large ? 'ball--large' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classNames}
      style={{ '--ball-color': info.color } as CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Ball ${ball}`}
    >
      <span className="ball__face">
        {showNumber ? <span>{ball}</span> : null}
      </span>
    </button>
  )
}
