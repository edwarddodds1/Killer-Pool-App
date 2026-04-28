import { useEffect, useMemo, useState } from 'react'
import { fetchProfilePictureStorageUrl } from '../../services/social/socialProfilePictureService'
import { loadAvatarUrl, readAvatarCache } from './avatarCache'

function hashHue(input: string) {
  let h = 0
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return h % 360
}

function initialsFor(username: string | undefined, userId: string) {
  const base = (username ?? '').trim() || userId
  const parts = base.split(/[\s_]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase().slice(0, 2)
  }
  return base.slice(0, 2).toUpperCase() || '?'
}

type AvatarProps = {
  userId: string
  size: number
  username?: string
  className?: string
}

export function Avatar({ userId, size, username, className }: AvatarProps) {
  const cached = readAvatarCache(userId)
  const [url, setUrl] = useState<string | null | undefined>(cached)

  useEffect(() => {
    let cancelled = false
    void loadAvatarUrl(userId, fetchProfilePictureStorageUrl).then((next) => {
      if (!cancelled) setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const initials = useMemo(() => initialsFor(username, userId), [username, userId])
  const hue = useMemo(() => hashHue(userId), [userId])
  const showImage = Boolean(url)

  return (
    <span
      className={`socialAvatar ${className ?? ''}`.trim()}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      aria-hidden={!showImage}
    >
      {showImage ? (
        <img
          src={url as string}
          alt=""
          width={size}
          height={size}
          className="socialAvatar__img"
          style={{ borderRadius: size / 2 }}
        />
      ) : (
        <span
          className="socialAvatar__fallback"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            background: `hsl(${hue} 42% 42%)`,
            fontSize: size * 0.32,
          }}
        >
          {initials}
        </span>
      )}
    </span>
  )
}
