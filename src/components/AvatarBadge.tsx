interface AvatarBadgeProps {
  username: string
  avatarIcon?: string
  size?: 'sm' | 'md'
}

export function AvatarBadge({ username, avatarIcon, size = 'md' }: AvatarBadgeProps) {
  const initial = username.trim().charAt(0).toUpperCase() || '?'
  return <div className={`avatar avatar--${size}`}>{avatarIcon ?? initial}</div>
}
