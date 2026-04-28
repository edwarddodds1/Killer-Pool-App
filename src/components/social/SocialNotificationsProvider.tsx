import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { countPendingIncoming } from '../../services/social/socialFriendshipService'
import { getProfile } from '../../utils/store'
import { SocialNotificationsContext } from './socialNotificationsContext'

export function SocialNotificationsProvider({ children }: { children: ReactNode }) {
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0)

  const refreshFriendBadge = useCallback(async () => {
    const profile = getProfile()
    if (!profile?.id || !profile.sessionId) {
      setPendingFriendRequests(0)
      return
    }
    try {
      const n = await countPendingIncoming(profile.id)
      setPendingFriendRequests(n)
    } catch {
      setPendingFriendRequests(0)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshFriendBadge()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refreshFriendBadge])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client
      .channel('social-friendships-realtime-web')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          void refreshFriendBadge()
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refreshFriendBadge])

  const value = useMemo(
    () => ({ pendingFriendRequests, refreshFriendBadge }),
    [pendingFriendRequests, refreshFriendBadge],
  )

  return <SocialNotificationsContext.Provider value={value}>{children}</SocialNotificationsContext.Provider>
}
