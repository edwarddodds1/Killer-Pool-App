import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import {
  countPendingIncoming,
  getAcceptedFriends,
  listPendingIncoming,
} from '../../services/social/socialFriendshipService'
import { fetchFeedPage, fetchUsernamesForProfileIds } from '../../services/social/socialFeedService'
import { listHeadToHeadForProfile } from '../../services/social/socialHeadToHeadService'
import { getProfile } from '../../utils/store'
import { SocialNotificationsContext } from './socialNotificationsContext'

const NOTIFICATIONS_LIMIT = 20

function notificationsSeenStorageKey(profileId: string) {
  return `killerpool:social-notifications-seen:${profileId}`
}

export function SocialNotificationsProvider({ children }: { children: ReactNode }) {
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0)
  const [notifications, setNotifications] = useState<
    import('./socialNotificationsContext').SocialNotificationItem[]
  >([])
  const [lastSeenAt, setLastSeenAt] = useState(0)

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

  const refreshNotifications = useCallback(async () => {
    const profile = getProfile()
    if (!profile?.id || !profile.sessionId) {
      setNotifications([])
      setPendingFriendRequests(0)
      setLastSeenAt(0)
      return
    }

    try {
      const [pendingCount, pendingIncoming, friends, h2hRows] = await Promise.all([
        countPendingIncoming(profile.id),
        listPendingIncoming(profile.id),
        getAcceptedFriends(profile.id),
        listHeadToHeadForProfile(profile.id, 8),
      ])

      setPendingFriendRequests(pendingCount)

      const friendIds = friends.map((entry) => entry.friendProfileId)
      const feedPosts = friendIds.length
        ? await fetchFeedPage({
            viewerProfileId: profile.id,
            allowedPosterIds: friendIds,
            offset: 0,
            pageSize: 8,
          })
        : []

      const ids = new Set<string>()
      for (const post of feedPosts) {
        ids.add(post.poster_profile_id)
        if (post.opponent_profile_id) ids.add(post.opponent_profile_id)
        if (post.winner_profile_id) ids.add(post.winner_profile_id)
      }
      for (const game of h2hRows) {
        ids.add(game.player_one_profile_id)
        ids.add(game.player_two_profile_id)
      }
      const names = await fetchUsernamesForProfileIds([...ids])

      const nextNotifications = [
        ...pendingIncoming.map((request) => ({
          id: `friend_request:${request.id}`,
          type: 'friend_request' as const,
          createdAt: request.createdAt,
          title: 'New friend request',
          body: `${request.requesterUsername} wants to connect with you.`,
          href: `/profile/${encodeURIComponent(request.requesterProfileId)}?username=${encodeURIComponent(request.requesterUsername)}`,
        })),
        ...feedPosts
          .filter((post) => post.poster_profile_id !== profile.id)
          .map((post) => {
            const posterName = names[post.poster_profile_id] ?? 'A friend'
            const oppName = post.opponent_profile_id ? names[post.opponent_profile_id] ?? 'another player' : null
            return {
              id: `post:${post.id}`,
              type: 'post' as const,
              createdAt: post.created_at,
              title: 'New social post',
              body: oppName ? `${posterName} shared a post with ${oppName}.` : `${posterName} shared a new post.`,
              href: `/profile/${encodeURIComponent(post.poster_profile_id)}?username=${encodeURIComponent(posterName)}`,
            }
          }),
        ...h2hRows.map((game) => {
          const opponentId =
            game.player_one_profile_id === profile.id ? game.player_two_profile_id : game.player_one_profile_id
          const opponentName = names[opponentId] ?? 'Another player'
          const youWon = game.winner_profile_id === profile.id
          return {
            id: `game:${game.id}`,
            type: 'game' as const,
            createdAt: game.played_at,
            title: '1v1 result recorded',
            body: youWon
              ? `Your match against ${opponentName} was recorded as a win.`
              : `A match against ${opponentName} was recorded in Social.`,
            href: `/profile/${encodeURIComponent(opponentId)}?username=${encodeURIComponent(opponentName)}`,
          }
        }),
      ]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, NOTIFICATIONS_LIMIT)

      setNotifications(nextNotifications)
    } catch {
      setNotifications([])
    }
  }, [])

  const markNotificationsSeen = useCallback(() => {
    const profile = getProfile()
    if (!profile?.id) return
    const seenAt = Date.now()
    window.localStorage.setItem(notificationsSeenStorageKey(profile.id), String(seenAt))
    setLastSeenAt(seenAt)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      const profile = getProfile()
      if (profile?.id) {
        const raw = window.localStorage.getItem(notificationsSeenStorageKey(profile.id))
        setLastSeenAt(raw ? Number(raw) || 0 : 0)
      } else {
        setLastSeenAt(0)
      }
      void refreshNotifications()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refreshNotifications])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client
      .channel('social-notifications-realtime-web')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          void refreshNotifications()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feed_posts' },
        () => {
          void refreshNotifications()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'head_to_head_games' },
        () => {
          void refreshNotifications()
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refreshNotifications])

  const hasUnreadNotifications = useMemo(
    () => notifications.some((entry) => Date.parse(entry.createdAt) > lastSeenAt),
    [lastSeenAt, notifications],
  )

  const value = useMemo(
    () => ({
      pendingFriendRequests,
      hasUnreadNotifications,
      notifications,
      refreshFriendBadge,
      refreshNotifications,
      markNotificationsSeen,
    }),
    [
      pendingFriendRequests,
      hasUnreadNotifications,
      notifications,
      refreshFriendBadge,
      refreshNotifications,
      markNotificationsSeen,
    ],
  )

  return <SocialNotificationsContext.Provider value={value}>{children}</SocialNotificationsContext.Provider>
}
