import { createContext } from 'react'

export type SocialNotificationsValue = {
  pendingFriendRequests: number
  refreshFriendBadge: () => Promise<void>
}

export const SocialNotificationsContext = createContext<SocialNotificationsValue | null>(null)
