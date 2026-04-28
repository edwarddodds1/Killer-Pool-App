import { useContext } from 'react'
import { SocialNotificationsContext } from './socialNotificationsContext'

export function useSocialNotifications() {
  const ctx = useContext(SocialNotificationsContext)
  if (!ctx) {
    return {
      pendingFriendRequests: 0,
      hasUnreadNotifications: false,
      notifications: [],
      refreshFriendBadge: async () => {},
      refreshNotifications: async () => {},
      markNotificationsSeen: () => {},
    }
  }
  return ctx
}
