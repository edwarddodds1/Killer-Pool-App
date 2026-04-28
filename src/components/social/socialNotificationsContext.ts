import { createContext } from 'react'

export type SocialNotificationItem = {
  id: string
  type: 'friend_request' | 'post' | 'game'
  createdAt: string
  title: string
  body: string
  href?: string
}

export type SocialNotificationsValue = {
  pendingFriendRequests: number
  hasUnreadNotifications: boolean
  notifications: SocialNotificationItem[]
  refreshFriendBadge: () => Promise<void>
  refreshNotifications: () => Promise<void>
  markNotificationsSeen: () => void
}

export const SocialNotificationsContext = createContext<SocialNotificationsValue | null>(null)
