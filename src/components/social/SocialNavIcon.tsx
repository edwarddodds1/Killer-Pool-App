import { USER_PERSON_PATH } from './userPersonPath'

type SocialNavIconProps = {
  className?: string
  /** Pixel size; default matches small header buttons */
  size?: number
}

/**
 * Three people using the same silhouette as Profile — rear pair + front, scaled to read as a group.
 */
export function SocialNavIcon({ className, size = 20 }: SocialNavIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      {/* Back left */}
      <g transform="translate(5, 14.2) scale(0.38) translate(-12, -12)">
        <path d={USER_PERSON_PATH} />
      </g>
      {/* Back right */}
      <g transform="translate(19, 14.2) scale(0.38) translate(-12, -12)">
        <path d={USER_PERSON_PATH} />
      </g>
      {/* Front center (drawn last) */}
      <g transform="translate(12, 11) scale(0.52) translate(-12, -12)">
        <path d={USER_PERSON_PATH} />
      </g>
    </svg>
  )
}
