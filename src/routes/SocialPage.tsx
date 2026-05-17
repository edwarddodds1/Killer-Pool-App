import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { isSupabaseEnabled } from '../lib/supabase'
import {
  getProfile,
  hydrateProfileSessionFromServer,
} from '../utils/store'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { RulesHelpIconButton, RulesModal } from '../components/ui/RulesModal'
import { useSocialNotifications } from '../components/social/useSocialNotifications'
import { Avatar } from '../components/social/Avatar'
import { H2hRowWeb } from '../components/social/H2hRowWeb'
import { formatChallengeBallsMarginLabel } from '../services/social/socialHeadToHeadService'
import { mergeFeedPostsNewestFirst, sortFeedPostsNewestFirst } from '../services/social/socialFeedService'
import { formatTimerElapsedMs } from '../../shared/timerLeaderboard'
import {
  acceptFriendRequest,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
  getAcceptedFriends,
  listPendingIncoming,
  listPendingOutgoing,
  lookupAccountByUsername,
  searchAccountsByPrefix,
  sendFriendRequestByUsername,
  type FriendRecord,
  type PendingIncomingRequest,
} from '../services/social/socialFriendshipService'
import {
  createFeedPostFromFiles,
  deleteFeedPost,
  fetchFeedPage,
  fetchUsernamesForProfileIds,
  updateFeedPostDetails,
  type FeedPostRow,
} from '../services/social/socialFeedService'
import { isAdminUsername } from '../utils/admin'
import {
  insertHeadToHeadGame,
  listHeadToHeadForProfile,
  summarizeHeadToHeadForViewer,
  type HeadToHeadRow,
} from '../services/social/socialHeadToHeadService'
type TabKey = 'feed' | 'friends' | 'games' | 'notifications'

const PAGE = 10

export function SocialPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { hasUnreadNotifications, notifications, refreshFriendBadge, refreshNotifications, markNotificationsSeen } =
    useSocialNotifications()
  const [tab, setTab] = useState<TabKey>('friends')
  const [, setHydrated] = useState(0)
  const profile = getProfile()
  const isAdmin = isAdminUsername(profile?.username)

  const registered = Boolean(profile?.sessionId)
  const profileId = profile?.id ?? null

  useEffect(() => {
    let alive = true
    void hydrateProfileSessionFromServer().then((changed) => {
      if (!alive) return
      setHydrated((tick) => tick + 1)
      if (changed) {
        void refreshFriendBadge()
        void refreshNotifications()
      }
    })
    return () => {
      alive = false
    }
  }, [refreshFriendBadge, refreshNotifications])

  const friendOkClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const friendErrClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (friendOkClearRef.current) clearTimeout(friendOkClearRef.current)
      if (friendErrClearRef.current) clearTimeout(friendErrClearRef.current)
    }
  }, [])

  const [friends, setFriends] = useState<FriendRecord[]>([])
  const [pendingIn, setPendingIn] = useState<PendingIncomingRequest[]>([])
  const [pendingOut, setPendingOut] = useState<
    { id: string; recipientProfileId: string; recipientUsername: string; createdAt: string }[]
  >([])
  const [friendInput, setFriendInput] = useState('')
  const [friendBusy, setFriendBusy] = useState(false)
  const [friendErr, setFriendErr] = useState('')
  const [friendOk, setFriendOk] = useState('')
  const [friendSuggestions, setFriendSuggestions] = useState<{ profileId: string; username: string }[]>([])

  const [feedPosts, setFeedPosts] = useState<FeedPostRow[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const [feedError, setFeedError] = useState('')
  const [nameById, setNameById] = useState<Record<string, string>>({})
  const feedOffsetRef = useRef(0)

  const [h2hRows, setH2hRows] = useState<HeadToHeadRow[]>([])
  const [gameSearch, setGameSearch] = useState('')
  const [gameSuggestions, setGameSuggestions] = useState<{ profileId: string; username: string }[]>([])
  const [opponentPick, setOpponentPick] = useState<{ id: string; username: string } | null>(null)
  const [winnerIsMe, setWinnerIsMe] = useState(true)
  const [loserBallsRemaining, setLoserBallsRemaining] = useState('7')
  const [gameBusy, setGameBusy] = useState(false)
  const [gameErr, setGameErr] = useState('')

  const [composerOpen, setComposerOpen] = useState(false)
  const [imgLeft, setImgLeft] = useState<File | null>(null)
  const [imgRight, setImgRight] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [postOpponentMode, setPostOpponentMode] = useState<'friend' | 'other'>('friend')
  const [tagFriendId, setTagFriendId] = useState<string | null>(null)
  const [postOtherOpponentUsername, setPostOtherOpponentUsername] = useState('')
  const [postWinnerSelf, setPostWinnerSelf] = useState<boolean | null>(null)
  const [postBusy, setPostBusy] = useState(false)
  const [postErr, setPostErr] = useState('')
  const [showRules, setShowRules] = useState(false)
  const highlightedFriendProfileId = (searchParams.get('friend') ?? '').trim()

  const loadFriendsBlock = useCallback(async () => {
    if (!profileId || !registered) {
      setFriends([])
      setPendingIn([])
      setPendingOut([])
      return
    }
    try {
      const [f, inc, out] = await Promise.all([
        getAcceptedFriends(profileId),
        listPendingIncoming(profileId),
        listPendingOutgoing(profileId),
      ])
      setFriends(f)
      setPendingIn(inc)
      setPendingOut(out)
    } catch {
      setFriends([])
      setPendingIn([])
      setPendingOut([])
    }
  }, [profileId, registered])

  const loadH2h = useCallback(async () => {
    if (!profileId || !registered) {
      setH2hRows([])
      return
    }
    const rows = await listHeadToHeadForProfile(profileId, 300)
    setH2hRows(rows)
  }, [profileId, registered])

  const allowedFeedIds = useCallback(async (): Promise<string[]> => {
    if (!profileId) return []
    const f = await getAcceptedFriends(profileId)
    return [profileId, ...f.map((x) => x.friendProfileId)]
  }, [profileId])

  const loadFeed = useCallback(
    async (mode: 'reset' | 'more') => {
      if (!profileId || !registered) {
        setFeedPosts([])
        return
      }
      setFeedError('')
      const allowed = await allowedFeedIds()
      if (!allowed.length) {
        setFeedPosts([])
        return
      }
      const offset = mode === 'reset' ? 0 : feedOffsetRef.current
      if (mode === 'reset') {
        setFeedLoading(true)
        feedOffsetRef.current = 0
      }
      try {
        const rows = await fetchFeedPage({
          viewerProfileId: profileId,
          allowedPosterIds: allowed,
          offset,
          pageSize: PAGE,
        })
        const ids = new Set<string>()
        for (const r of rows) {
          ids.add(r.poster_profile_id)
          if (r.opponent_profile_id) ids.add(r.opponent_profile_id)
          if (r.winner_profile_id) ids.add(r.winner_profile_id)
        }
        const names = await fetchUsernamesForProfileIds([...ids])
        setNameById((prev) => ({ ...prev, ...names }))
        if (mode === 'reset') {
          const sorted = sortFeedPostsNewestFirst(rows)
          setFeedPosts(sorted)
          feedOffsetRef.current = sorted.length
          setFeedHasMore(sorted.length === PAGE)
        } else {
          setFeedPosts((prev) => {
            const merged = mergeFeedPostsNewestFirst(prev, rows)
            feedOffsetRef.current = merged.length
            return merged
          })
          setFeedHasMore(rows.length === PAGE)
        }
      } catch (e) {
        setFeedError(e instanceof Error ? e.message : 'Could not load feed.')
      } finally {
        setFeedLoading(false)
        setFeedRefreshing(false)
      }
    },
    [profileId, registered, allowedFeedIds],
  )

  useEffect(() => {
    if (highlightedFriendProfileId) {
      setTab('friends')
    }
  }, [highlightedFriendProfileId])

  useEffect(() => {
    if (tab === 'friends') {
      void loadFriendsBlock()
      void loadH2h()
    }
    if (tab === 'games') void loadH2h()
    if (tab === 'feed') void loadFeed('reset')
    if (tab === 'notifications') markNotificationsSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profileId, registered, markNotificationsSeen])

  useEffect(() => {
    if (!h2hRows.length || !profileId) return
    const ids = new Set<string>()
    for (const r of h2hRows) {
      ids.add(r.player_one_profile_id)
      ids.add(r.player_two_profile_id)
    }
    void fetchUsernamesForProfileIds([...ids]).then((n) => setNameById((prev) => ({ ...prev, ...n })))
  }, [h2hRows, profileId])

  const onRefreshFeed = () => {
    setFeedRefreshing(true)
    void loadFeed('reset')
  }

  const onPostUpdated = (postId: string, nextCaption: string | null, nextWinnerProfileId: string | null) => {
    setFeedPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              caption: nextCaption?.trim() || null,
              winner_profile_id: nextWinnerProfileId,
            }
          : post,
      ),
    )
  }

  const onPostDeleted = (postId: string) => {
    setFeedPosts((prev) => prev.filter((post) => post.id !== postId))
  }

  const onAddFriend = async () => {
    if (!profileId || !friendInput.trim()) return
    if (profile && friendInput.trim().toLowerCase() === profile.username.trim().toLowerCase()) {
      const selfMsg = 'You cannot add yourself as a friend.'
      setFriendErr(selfMsg)
      setFriendOk('')
      if (friendErrClearRef.current) {
        clearTimeout(friendErrClearRef.current)
        friendErrClearRef.current = null
      }
      friendErrClearRef.current = setTimeout(() => {
        setFriendErr((t) => (t === selfMsg ? '' : t))
        friendErrClearRef.current = null
      }, 3000)
      return
    }
    setFriendBusy(true)
    setFriendErr('')
    if (friendOkClearRef.current) {
      clearTimeout(friendOkClearRef.current)
      friendOkClearRef.current = null
    }
    if (friendErrClearRef.current) {
      clearTimeout(friendErrClearRef.current)
      friendErrClearRef.current = null
    }
    setFriendOk('')
    try {
      await sendFriendRequestByUsername(profileId, friendInput)
      setFriendOk('Request sent.')
      friendOkClearRef.current = setTimeout(() => {
        setFriendOk((t) => (t === 'Request sent.' ? '' : t))
        friendOkClearRef.current = null
      }, 3000)
      setFriendInput('')
      setFriendSuggestions([])
      await loadFriendsBlock()
      await refreshFriendBadge()
      await refreshNotifications()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send request.'
      setFriendErr(msg)
      friendErrClearRef.current = setTimeout(() => {
        setFriendErr((t) => (t === msg ? '' : t))
        friendErrClearRef.current = null
      }, 3000)
    } finally {
      setFriendBusy(false)
    }
  }

  const onAccept = async (id: string) => {
    if (!profileId) return
    setFriendBusy(true)
    try {
      await acceptFriendRequest(profileId, id)
      await loadFriendsBlock()
      await refreshFriendBadge()
      await refreshNotifications()
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not accept.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onDecline = async (id: string) => {
    if (!profileId) return
    setFriendBusy(true)
    try {
      await declineFriendRequest(profileId, id)
      await loadFriendsBlock()
      await refreshFriendBadge()
      await refreshNotifications()
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not decline.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onCancelOutgoing = async (id: string) => {
    if (!profileId) return
    setFriendBusy(true)
    try {
      await cancelOutgoingFriendRequest(profileId, id)
      await loadFriendsBlock()
      await refreshNotifications()
      await refreshFriendBadge()
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not cancel request.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onChallengeFriend = (friend: FriendRecord) => {
    setTab('games')
    setGameErr('')
    setWinnerIsMe(true)
    setLoserBallsRemaining('7')
    setOpponentPick({ id: friend.friendProfileId, username: friend.friendUsername })
    setGameSearch(friend.friendUsername)
    setGameSuggestions([])
  }

  const resolveOpponent = async () => {
    setGameErr('')
    const acc = await lookupAccountByUsername(gameSearch)
    if (!acc) {
      setGameErr('No player found.')
      setOpponentPick(null)
      return
    }
    if (profileId && acc.profile_id === profileId) {
      setGameErr('Pick someone else.')
      setOpponentPick(null)
      return
    }
    setOpponentPick({ id: acc.profile_id, username: acc.username })
    setGameSuggestions([])
  }

  const submitGame = async () => {
    if (!profileId || !opponentPick) return
    const loserBalls = Number(loserBallsRemaining)
    if (!Number.isInteger(loserBalls) || loserBalls < 0 || loserBalls > 15) {
      setGameErr('Balls remaining must be integers 0–15.')
      return
    }
    const winnerId = winnerIsMe ? profileId : opponentPick.id
    const b1 = winnerIsMe ? 0 : loserBalls
    const b2 = winnerIsMe ? loserBalls : 0
    setGameBusy(true)
    setGameErr('')
    try {
      await insertHeadToHeadGame({
        playerOneProfileId: profileId,
        playerTwoProfileId: opponentPick.id,
        winnerProfileId: winnerId,
        playerOneBallsRemaining: b1,
        playerTwoBallsRemaining: b2,
      })
      await loadH2h()
      await refreshNotifications()
      setOpponentPick(null)
      setGameSearch('')
      setLoserBallsRemaining('7')
    } catch (e) {
      setGameErr(e instanceof Error ? e.message : 'Could not save game.')
    } finally {
      setGameBusy(false)
    }
  }

  const submitPost = async () => {
    if (!profileId || !registered || !imgLeft || !imgRight) {
      setPostErr('Choose two images.')
      return
    }
    if (postWinnerSelf === null) {
      setPostErr('Select who won before posting.')
      return
    }

    setPostBusy(true)
    setPostErr('')
    try {
      let opponentId: string | null = null
      if (postOpponentMode === 'friend') {
        if (!tagFriendId) {
          setPostErr('Select a friend opponent before posting.')
          return
        }
        opponentId = tagFriendId
      } else {
        const otherName = postOtherOpponentUsername.trim()
        if (!otherName) {
          setPostErr('Enter an opponent username before posting.')
          return
        }
        const account = await lookupAccountByUsername(otherName)
        if (!account) {
          setPostErr('No player found for that username.')
          return
        }
        if (account.profile_id === profileId) {
          setPostErr('Pick someone else.')
          return
        }
        opponentId = account.profile_id
      }
      const winnerId = postWinnerSelf ? profileId : opponentId
      await createFeedPostFromFiles({
        posterProfileId: profileId,
        opponentProfileId: opponentId,
        winnerProfileId: winnerId,
        caption: caption.trim() || null,
        imageLeft: imgLeft,
        imageRight: imgRight,
      })
      setComposerOpen(false)
      setImgLeft(null)
      setImgRight(null)
      setCaption('')
      setPostOpponentMode('friend')
      setTagFriendId(null)
      setPostOtherOpponentUsername('')
      setPostWinnerSelf(null)
      await loadFeed('reset')
      await refreshNotifications()
    } catch (e) {
      setPostErr(e instanceof Error ? e.message : 'Could not post.')
    } finally {
      setPostBusy(false)
    }
  }

  const openComposer = () => {
    setPostErr('')
    void loadFriendsBlock()
    setPostOpponentMode(friends.length ? 'friend' : 'other')
    setTagFriendId(null)
    setPostOtherOpponentUsername('')
    setPostWinnerSelf(null)
    setComposerOpen(true)
  }

  const h2hSummary = profileId ? summarizeHeadToHeadForViewer(h2hRows, profileId) : null

  const friendIdSet = useMemo(() => new Set(friends.map((f) => f.friendProfileId)), [friends])
  const outgoingRecipientIds = useMemo(() => new Set(pendingOut.map((p) => p.recipientProfileId)), [pendingOut])
  const incomingRequesterIds = useMemo(() => new Set(pendingIn.map((r) => r.requesterProfileId)), [pendingIn])
  const visibleFriendSuggestions = useMemo(
    () =>
      friendSuggestions.filter((entry) => {
        if (profileId && entry.profileId === profileId) return false
        if (friendIdSet.has(entry.profileId)) return false
        if (outgoingRecipientIds.has(entry.profileId)) return false
        if (incomingRequesterIds.has(entry.profileId)) return false
        return true
      }),
    [friendSuggestions, friendIdSet, incomingRequesterIds, outgoingRecipientIds, profileId],
  )

  useEffect(() => {
    if (!registered || !profileId) {
      setFriendSuggestions([])
      return
    }
    const query = friendInput.trim()
    if (!query) {
      setFriendSuggestions([])
      return
    }
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchAccountsByPrefix(query, 3).then((rows) => {
        if (cancelled) return
        setFriendSuggestions(rows.map((row) => ({ profileId: row.profile_id, username: row.username })))
      })
    }, 100)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [friendInput, profileId, registered])

  useEffect(() => {
    if (!registered || !profileId) {
      setGameSuggestions([])
      return
    }
    const query = gameSearch.trim()
    if (!query) {
      setGameSuggestions([])
      return
    }
    if (opponentPick && opponentPick.username.trim().toLowerCase() === query.toLowerCase()) {
      setGameSuggestions([])
      return
    }
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchAccountsByPrefix(query, 5).then((rows) => {
        if (cancelled) return
        setGameSuggestions(
          rows
            .filter((row) => row.profile_id !== profileId)
            .map((row) => ({ profileId: row.profile_id, username: row.username })),
        )
      })
    }, 100)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [gameSearch, opponentPick, profileId, registered])

  const suggestFriendsFromH2h = useMemo(() => {
    if (!profileId) return []
    const out: { profileId: string; username: string }[] = []
    const seen = new Set<string>()
    for (const r of h2hRows) {
      const opp: string =
        r.player_one_profile_id === profileId ? r.player_two_profile_id : r.player_one_profile_id
      if (!opp || opp === profileId) continue
      if (friendIdSet.has(opp) || outgoingRecipientIds.has(opp) || incomingRequesterIds.has(opp) || seen.has(opp)) {
        continue
      }
      const username = nameById[opp]?.trim()
      if (!username) continue
      seen.add(opp)
      out.push({ profileId: opp, username })
      if (out.length >= 8) break
    }
    return out
  }, [profileId, h2hRows, friendIdSet, outgoingRecipientIds, incomingRequesterIds, nameById])

  const rivalryByFriendId = useMemo(() => {
    if (!profileId) return new Map<string, { wins: number; losses: number; gamesPlayed: number; ballsDiff: number }>()
    const summary = new Map<string, { wins: number; losses: number; gamesPlayed: number; ballsDiff: number }>()
    for (const row of h2hRows) {
      const isViewerPlayerOne = row.player_one_profile_id === profileId
      const isViewerPlayerTwo = row.player_two_profile_id === profileId
      if (!isViewerPlayerOne && !isViewerPlayerTwo) continue

      const opponentId = isViewerPlayerOne ? row.player_two_profile_id : row.player_one_profile_id
      const current = summary.get(opponentId) ?? { wins: 0, losses: 0, gamesPlayed: 0, ballsDiff: 0 }
      const viewerWon = row.winner_profile_id === profileId
      const loserBallsRemaining = viewerWon
        ? isViewerPlayerOne
          ? row.player_two_balls_remaining
          : row.player_one_balls_remaining
        : isViewerPlayerOne
          ? row.player_one_balls_remaining
          : row.player_two_balls_remaining

      current.gamesPlayed += 1
      if (viewerWon) {
        current.wins += 1
        current.ballsDiff += loserBallsRemaining
      } else {
        current.losses += 1
        current.ballsDiff -= loserBallsRemaining
      }
      summary.set(opponentId, current)
    }
    return summary
  }, [h2hRows, profileId])

  const onRequestSuggestedFriend = async (username: string) => {
    if (!profileId) return
    setFriendBusy(true)
    setFriendErr('')
    if (friendErrClearRef.current) {
      clearTimeout(friendErrClearRef.current)
      friendErrClearRef.current = null
    }
    try {
      await sendFriendRequestByUsername(profileId, username)
      setFriendInput('')
      setFriendSuggestions([])
      await loadFriendsBlock()
      await refreshNotifications()
      await refreshFriendBadge()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send request.'
      setFriendErr(msg)
      friendErrClearRef.current = setTimeout(() => {
        setFriendErr((t) => (t === msg ? '' : t))
        friendErrClearRef.current = null
      }, 3000)
    } finally {
      setFriendBusy(false)
    }
  }

  if (!isSupabaseEnabled()) {
    return (
      <main className="page socialPage">
        <div className="pageHeadingRow socialPageHeadingRow">
          <h1 className="pageHeadingRow__title">Social</h1>
          <div className="pageHeadingRow__tools">
            <AppHeaderNavIcons />
          </div>
        </div>
        <p className="muted">
          Social features need Supabase on this deployment. Set <code className="socialInlineCode">VITE_SUPABASE_URL</code> and{' '}
          <code className="socialInlineCode">VITE_SUPABASE_ANON_KEY</code>, then rebuild.
        </p>
        <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="page socialPage">
        <div className="pageHeadingRow socialPageHeadingRow">
          <h1 className="pageHeadingRow__title">Social</h1>
          <div className="pageHeadingRow__tools">
            <AppHeaderNavIcons />
          </div>
        </div>
        <p className="muted">Open Home to sign in, create an account, or continue as guest.</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
          Go to Home
        </button>
        <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
      </main>
    )
  }

  if (!registered) {
    return (
      <main className="page socialPage">
        <div className="pageHeadingRow socialPageHeadingRow">
          <h1 className="pageHeadingRow__title">Social</h1>
          <div className="pageHeadingRow__tools">
            <AppHeaderNavIcons />
          </div>
        </div>
        <section className="card socialGuestGate">
          <h2>Saved account required</h2>
          <p className="muted">
            You’re using <strong>Continue as guest</strong> on Home (no saved account). Friends, feed, and cloud Challenge records need the
            same username and password you use on Home.
          </p>
          <p className="muted">
            On Home, use <strong>Sign in</strong> if you already have an account, or <strong>Create</strong> to register. Your guest
            name can stay for display until you switch.
          </p>
          <div className="socialGuestGate__actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </div>
        </section>
        <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
      </main>
    )
  }

  return (
    <main className="page socialPage">
      <div className="pageHeadingRow socialPageHeadingRow">
        <h1 className="pageHeadingRow__title">Social</h1>
        <div className="pageHeadingRow__tools">
          <AppHeaderNavIcons />
        </div>
      </div>

      <div className="socialTabs" role="tablist">
        {(['feed', 'friends', 'notifications', 'games'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-tab={key}
            aria-selected={tab === key}
            className={`socialTabs__btn${tab === key ? ' socialTabs__btn--active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'feed' ? (
              'Feed'
            ) : key === 'friends' ? (
              'Friends'
            ) : key === 'games' ? (
              'Games'
            ) : (
              <span className="socialTabs__bellWrap">
                <BellGlyph />
                <span>Notifications</span>
                {hasUnreadNotifications && tab !== 'notifications' ? <span className="socialTabs__bellDot" aria-hidden="true" /> : null}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'feed' ? (
        <section className="socialSection card card--pool">
          <div className="socialFeedToolbar">
            <button type="button" className="btn btn--soft" onClick={openComposer}>
              New post
            </button>
            <button
              type="button"
              className="btn btn--soft btn--small socialIconBtn socialFeedRefreshBtn"
              onClick={onRefreshFeed}
              disabled={feedRefreshing}
              aria-label={feedRefreshing ? 'Refreshing feed' : 'Refresh feed'}
              title={feedRefreshing ? 'Refreshing…' : 'Refresh'}
            >
              <RefreshGlyph />
            </button>
          </div>
          {feedError ? <p className="error">{feedError}</p> : null}
          {feedLoading && !feedPosts.length ? <p className="muted">Loading…</p> : null}
          <div className="socialFeedList">
            {!feedLoading && !feedPosts.length ? <p className="muted">No posts yet.</p> : null}
            {feedPosts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                names={nameById}
                viewerProfileId={profileId}
                canAdminEdit={isAdmin}
                onPostUpdated={onPostUpdated}
                onDeleted={onPostDeleted}
              />
            ))}
            {feedHasMore && feedPosts.length > 0 ? (
              <button type="button" className="btn btn--soft" onClick={() => void loadFeed('more')} disabled={feedLoading}>
                Load more
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'friends' ? (
        <section className="socialSection card card--pool stack">
          <h2>Add friend</h2>
          <div className="socialRowInput socialRowInput--gameSearch">
            <div className="socialFriendLookup">
              <input
                className="fieldInput"
                placeholder="Username"
                value={friendInput}
                dir="ltr"
                onChange={(e) => setFriendInput(e.target.value)}
                maxLength={15}
              />
              {visibleFriendSuggestions.length ? (
                <div className="socialSuggestDropdown" aria-label="Matching usernames">
                  {visibleFriendSuggestions.map((entry) => (
                    <button
                      key={entry.profileId}
                      type="button"
                      className="socialSuggestOption"
                      disabled={friendBusy}
                      onClick={() => {
                        setFriendInput(entry.username)
                        setFriendSuggestions([])
                        setFriendErr('')
                        setFriendOk('')
                      }}
                    >
                      {entry.username}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn--primary" onClick={() => void onAddFriend()} disabled={friendBusy}>
              Request
            </button>
          </div>
          {friendErr ? <p className="error">{friendErr}</p> : null}
          {friendOk ? <p className="muted">{friendOk}</p> : null}

          {suggestFriendsFromH2h.length ? (
            <>
              <h2>Suggested — from your Challenge games</h2>
              <p className="muted socialHint">Players you’ve recorded games with who aren’t friends yet.</p>
              {suggestFriendsFromH2h.map((s) => (
                <div key={s.profileId} className="socialCard">
                  <div className="socialCardRow socialCardRow--spread">
                    <div className="socialCardRow">
                      <Avatar userId={s.profileId} size={40} username={s.username} />
                      <strong className="adminInlineName">
                        <Link
                          className="socialProfileLink"
                          to={`/profile/${encodeURIComponent(s.profileId)}?username=${encodeURIComponent(s.username)}`}
                        >
                          <span>{s.username}</span>
                        </Link>
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="btn btn--soft btn--small"
                      disabled={friendBusy}
                      onClick={() => void onRequestSuggestedFriend(s.username)}
                    >
                      Request
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {pendingIn.length ? (
            <>
              <h2>Requests</h2>
              {pendingIn.map((r) => (
                <div key={r.id} className="socialCard">
                  <div className="socialCardRow">
                    <Avatar userId={r.requesterProfileId} size={40} username={r.requesterUsername} />
                    <strong className="adminInlineName">
                      <Link
                        className="socialProfileLink"
                        to={`/profile/${encodeURIComponent(r.requesterProfileId)}?username=${encodeURIComponent(r.requesterUsername)}`}
                      >
                        <span>{r.requesterUsername}</span>
                      </Link>
                    </strong>
                  </div>
                  <div className="socialRowInput">
                    <button type="button" className="btn btn--primary" onClick={() => void onAccept(r.id)} disabled={friendBusy}>
                      Accept
                    </button>
                    <button type="button" className="btn btn--soft" onClick={() => void onDecline(r.id)} disabled={friendBusy}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {pendingOut.length ? (
            <>
              <h2>Sent requests</h2>
              <p className="muted socialHint">Waiting for them to accept.</p>
              {pendingOut.map((r) => (
                <div key={r.id} className="socialCard">
                  <div className="socialCardRow">
                    <Avatar userId={r.recipientProfileId} size={40} username={r.recipientUsername} />
                    <strong className="adminInlineName">
                      <Link
                        className="socialProfileLink"
                        to={`/profile/${encodeURIComponent(r.recipientProfileId)}?username=${encodeURIComponent(r.recipientUsername)}`}
                      >
                        <span>{r.recipientUsername}</span>
                      </Link>
                    </strong>
                    <div className="socialPendingActions">
                      <span className="socialPendingBadge">Pending</span>
                      <button type="button" className="btn btn--soft btn--small" onClick={() => void onCancelOutgoing(r.id)} disabled={friendBusy}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          <h2>Friends</h2>
          {!friends.length ? <p className="muted">No friends yet.</p> : null}
          {friends.map((f) => (
            <FriendRowWeb
              key={f.friendProfileId}
              friend={f}
              rivalry={rivalryByFriendId.get(f.friendProfileId) ?? { wins: 0, losses: 0, gamesPlayed: 0, ballsDiff: 0 }}
              highlighted={highlightedFriendProfileId === f.friendProfileId}
              busy={friendBusy}
              onChallenge={() => void onChallengeFriend(f)}
            />
          ))}
        </section>
      ) : null}

      {tab === 'games' ? (
        <section className="socialSection card card--pool stack">
          <div className="pageHeadingRow">
            <h2 className="pageHeadingRow__title">RECORD CHALLENGE</h2>
            <div className="pageHeadingRow__tools">
              <RulesHelpIconButton onPress={() => setShowRules(true)} label="Duel rules" />
            </div>
          </div>
          <div className="socialRowInput socialRowInput--friendSearch">
            <div className="socialFriendLookup">
              <input
                className="fieldInput"
                placeholder="Opponent username"
                value={gameSearch}
                dir="ltr"
                onChange={(e) => {
                  setGameSearch(e.target.value)
                  if (opponentPick && opponentPick.username.toLowerCase() !== e.target.value.trim().toLowerCase()) {
                    setOpponentPick(null)
                  }
                }}
              />
              {gameSuggestions.length ? (
                <div className="socialSuggestDropdown" aria-label="Matching opponents">
                  {gameSuggestions.map((entry) => (
                    <button
                      key={entry.profileId}
                      type="button"
                      className="socialSuggestOption"
                      onClick={() => {
                        setOpponentPick({ id: entry.profileId, username: entry.username })
                        setGameSearch(entry.username)
                        setGameSuggestions([])
                        setGameErr('')
                      }}
                    >
                      {entry.username}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn--soft" onClick={() => void resolveOpponent()}>
              Find
            </button>
          </div>
          <div className="socialWinnerSliderWrap">
            <div
              className={`modeSlider socialWinnerSlider ${!opponentPick ? 'modeSlider--disabled' : ''}`}
              style={{ '--slider-index': winnerIsMe ? 0 : 1 } as CSSProperties}
            >
              <div className="modeSlider__thumb" aria-hidden="true" />
              <button
                type="button"
                className={`modeSlider__btn ${winnerIsMe ? 'modeSlider__btn--active' : ''}`}
                onClick={() => setWinnerIsMe(true)}
              >
                {(profile?.username ?? 'You').trim() || 'You'} Wins
              </button>
              <button
                type="button"
                className={`modeSlider__btn ${!winnerIsMe ? 'modeSlider__btn--active' : ''}`}
                onClick={() => setWinnerIsMe(false)}
                disabled={!opponentPick}
              >
                {(opponentPick?.username ?? 'Opponent').trim() || 'Opponent'} Wins
              </button>
            </div>
          </div>
          <label className="field">
            Losers Remaining Balls
            <input
              className="fieldInput"
              value={loserBallsRemaining}
              onChange={(e) => setLoserBallsRemaining(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <p className="socialRecordBallsPreview">
            {formatChallengeBallsMarginLabel(winnerIsMe, Number(loserBallsRemaining) || 0)}
          </p>
          {gameErr ? <p className="error">{gameErr}</p> : null}
          <button type="button" className="btn btn--go" onClick={() => void submitGame()} disabled={gameBusy || !opponentPick}>
            {gameBusy ? 'Saving…' : 'Save game'}
          </button>

          <h2>YOUR CHALLENGE HISTORY</h2>
          {h2hSummary && h2hSummary.games > 0 ? (
            <p className="muted">
              {h2hSummary.games} games · {h2hSummary.wins}W-{h2hSummary.losses}L · Balls {h2hSummary.totalBallsFor ?? '—'} /{' '}
              {h2hSummary.totalBallsAgainst ?? '—'}
            </p>
          ) : (
            <p className="muted">No recorded games yet.</p>
          )}
          <ul className="socialH2hList">
            {h2hRows.map((row) => (
              <H2hRowWeb key={row.id} row={row} viewerId={profileId!} names={nameById} />
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'notifications' ? (
        <section className="socialSection card card--pool stack">
          <div className="socialNotificationsHeader">
            <div className="socialNotificationsTitle">
              <BellGlyph />
              <h2>Notifications</h2>
            </div>
            <button
              type="button"
              className="btn btn--soft btn--small socialIconBtn"
              onClick={() => void refreshNotifications()}
              aria-label="Refresh notifications"
              title="Refresh notifications"
            >
              <RefreshGlyph />
            </button>
          </div>
          {!notifications.length ? (
            <p className="muted">No social notifications yet.</p>
          ) : (
            <div className="socialNotificationsList">
              {notifications.map((item) => (
                <article key={item.id} className={`socialNotificationCard socialNotificationCard--${item.type}`}>
                  {item.actorProfileId ? (
                    item.href ? (
                      <Link className="socialAvatarLink" to={item.href} aria-label={`Open ${item.actorUsername ?? 'player'} profile`}>
                        <Avatar userId={item.actorProfileId} size={40} username={item.actorUsername ?? 'Player'} />
                      </Link>
                    ) : (
                      <Avatar userId={item.actorProfileId} size={40} username={item.actorUsername ?? 'Player'} />
                    )
                  ) : (
                    <div className="socialNotificationIcon" aria-hidden="true">
                      {item.type === 'friend_request'
                        ? '+'
                        : item.type === 'friend_accepted'
                          ? 'ok'
                          : item.type === 'pb'
                            ? 'PB'
                            : item.type === 'post'
                              ? '#'
                              : 'vs'}
                    </div>
                  )}
                  <div className="socialNotificationBody">
                    <div className="socialNotificationHead">
                      <strong>{item.title}</strong>
                      <time className="muted" dateTime={item.createdAt}>
                          {formatFeedTimestamp(item.createdAt)}
                      </time>
                    </div>
                    {item.type === 'pb' && item.pbElapsedMs !== undefined ? (
                      <div className="socialPbBody">
                        <p>
                          {(item.actorUsername ?? 'A friend')} set a new PB of {formatTimerElapsedMs(item.pbElapsedMs)}{' '}
                          {item.pbDroppedMs !== undefined ? (
                            <strong>
                              (<span className="socialPbDrop">-{formatTimerElapsedMs(item.pbDroppedMs)}</span>)
                            </strong>
                          ) : null}
                        </p>
                        {item.pbRankCopy ? <p className="socialPbRankCopy">{item.pbRankCopy}</p> : null}
                      </div>
                    ) : (
                      <p>{item.body}</p>
                    )}
                    {item.href ? (
                      <Link className="socialProfileLink socialNotificationLink" to={item.href}>
                        Open
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {composerOpen ? (
        <div className="socialModalOverlay" role="presentation" onClick={() => setComposerOpen(false)}>
          <div
            className="socialModal card card--pool"
            role="dialog"
            aria-modal="true"
            aria-label="New post"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="socialModalHeader">
              <h2>New post</h2>
              <button type="button" className="btn btn--soft" onClick={() => setComposerOpen(false)}>
                Close
              </button>
            </div>
            <p className="muted">Pick two JPEG/PNG images under 5MB each.</p>
            <div className="socialDualPick">
              <label className="field">
                Image left
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setImgLeft(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="field">
                Image right
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setImgRight(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="muted">Tag opponent (required)</p>
            <div className="socialChips">
              <button
                type="button"
                className={`btn btn--soft${postOpponentMode === 'friend' ? ' btn--primary' : ''}`}
                onClick={() => {
                  setPostOpponentMode('friend')
                  setPostOtherOpponentUsername('')
                }}
              >
                Friend
              </button>
              <button
                type="button"
                className={`btn btn--soft${postOpponentMode === 'other' ? ' btn--primary' : ''}`}
                onClick={() => {
                  setPostOpponentMode('other')
                  setTagFriendId(null)
                }}
              >
                Other
              </button>
            </div>
            {postOpponentMode === 'friend' ? (
              <>
                <div className="socialChips">
                  {friends.map((f) => (
                    <button
                      key={f.friendProfileId}
                      type="button"
                      className={`btn btn--soft${tagFriendId === f.friendProfileId ? ' btn--primary' : ''}`}
                      onClick={() => setTagFriendId(f.friendProfileId)}
                    >
                      {f.friendUsername}
                    </button>
                  ))}
                </div>
                {!friends.length ? <p className="muted">No friends found. Choose Other and type a username.</p> : null}
              </>
            ) : (
              <label className="field">
                Opponent username
                <input
                  className="fieldInput"
                  value={postOtherOpponentUsername}
                  onChange={(e) => setPostOtherOpponentUsername(e.target.value)}
                  maxLength={15}
                  placeholder="Type username"
                  dir="ltr"
                />
              </label>
            )}
            {(postOpponentMode === 'other' || tagFriendId) ? (
              <div className="socialRowInput">
                <button type="button" className={`btn${postWinnerSelf === true ? ' btn--primary' : ' btn--soft'}`} onClick={() => setPostWinnerSelf(true)}>
                  You win
                </button>
                <button type="button" className={`btn${postWinnerSelf === false ? ' btn--primary' : ' btn--soft'}`} onClick={() => setPostWinnerSelf(false)}>
                  Opponent wins
                </button>
              </div>
            ) : null}
            <label className="field">
              Caption
              <input className="fieldInput" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={280} />
            </label>
            {postErr ? <p className="error">{postErr}</p> : null}
            <button
              type="button"
              className="btn btn--go"
              onClick={() => void submitPost()}
              disabled={
                postBusy ||
                postWinnerSelf === null ||
                (postOpponentMode === 'friend' ? !tagFriendId : !postOtherOpponentUsername.trim())
              }
            >
              {postBusy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      ) : null}
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
    </main>
  )
}

function FeedCard({
  post,
  names,
  viewerProfileId,
  canAdminEdit,
  onPostUpdated,
  onDeleted,
}: {
  post: FeedPostRow
  names: Record<string, string>
  viewerProfileId: string | null
  canAdminEdit: boolean
  onPostUpdated: (postId: string, nextCaption: string | null, nextWinnerProfileId: string | null) => void
  onDeleted: (postId: string) => void
}) {
  const posterName = names[post.poster_profile_id] ?? 'Player'
  const oppId = post.opponent_profile_id
  const oppName = oppId ? names[oppId] ?? 'Player' : null
  const [editing, setEditing] = useState(false)
  const [draftCaption, setDraftCaption] = useState(post.caption ?? '')
  const [draftWinnerProfileId, setDraftWinnerProfileId] = useState<string | null>(post.winner_profile_id)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canEdit = Boolean(viewerProfileId) && (canAdminEdit || viewerProfileId === post.poster_profile_id)
  const winnerBadge = (
    <span className="socialWinnerBadge" title="Winner">
      🏆 Winner
    </span>
  )
  const timestampLabel = formatFeedTimestamp(post.created_at)

  useEffect(() => {
    if (!editing) {
      setDraftCaption(post.caption ?? '')
      setDraftWinnerProfileId(post.winner_profile_id)
    }
  }, [post.caption, post.winner_profile_id, editing])

  const onSaveCaption = async () => {
    if (!canEdit) return
    if (oppId && !draftWinnerProfileId) {
      setSaveError('Select who won before saving.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const nextCaption = draftCaption.trim() || null
      const nextWinnerProfileId = oppId ? draftWinnerProfileId : null
      await updateFeedPostDetails({
        postId: post.id,
        caption: nextCaption,
        winnerProfileId: nextWinnerProfileId,
      })
      onPostUpdated(post.id, nextCaption, nextWinnerProfileId)
      setEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save post changes.')
    } finally {
      setSaving(false)
    }
  }

  const onDeletePost = async () => {
    if (!canEdit || saving || deleting) return
    const confirmed = window.confirm('Are you sure you want to delete this post?')
    if (!confirmed) return
    setDeleting(true)
    setSaveError('')
    try {
      await deleteFeedPost({ postId: post.id })
      onDeleted(post.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not delete post.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <article className="socialPostCard">
      <div className="socialPostHead">
        <Avatar userId={post.poster_profile_id} size={40} username={posterName} />
        <div className="socialPostHeadMain">
          <div className="socialNameRow">
            <strong className="adminInlineName">
              <Link
                className="socialProfileLink"
                to={`/profile/${encodeURIComponent(post.poster_profile_id)}?username=${encodeURIComponent(posterName)}`}
              >
                <span>{posterName}</span>
              </Link>
            </strong>
            {post.winner_profile_id === post.poster_profile_id ? winnerBadge : null}
          </div>
          {oppName && oppId ? (
            <div className="socialNameRow">
              <Avatar userId={oppId} size={28} username={oppName} />
              <Link className="socialProfileLink adminInlineName" to={`/profile/${encodeURIComponent(oppId)}?username=${encodeURIComponent(oppName)}`}>
                <span>{oppName}</span>
              </Link>
              {post.winner_profile_id === oppId ? winnerBadge : null}
            </div>
          ) : null}
        </div>
        {canEdit ? (
          <div className="socialPostHeadActions">
            <button
              type="button"
              className="socialPostIconBtn"
              aria-label="Edit post"
              title="Edit post"
              onClick={() => setEditing(true)}
              disabled={editing || saving || deleting}
            >
              ✏️
            </button>
            <button
              type="button"
              className="socialPostIconBtn socialPostIconBtn--danger"
              aria-label="Delete post"
              title="Delete post"
              onClick={() => void onDeletePost()}
              disabled={saving || deleting}
            >
              🗑
            </button>
          </div>
        ) : null}
      </div>
      <div className="socialDualImg">
        <img src={post.image_url_left} alt="" className="socialDualImg__img" />
        <img src={post.image_url_right} alt="" className="socialDualImg__img" />
      </div>
      {editing ? (
        <div className="socialPostEdit">
          <label className="field">
            Edit caption
            <input
              className="fieldInput"
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              maxLength={280}
              disabled={saving}
            />
          </label>
          {oppName && oppId ? (
            <div className="socialRowInput">
              <button
                type="button"
                className={`btn${draftWinnerProfileId === post.poster_profile_id ? ' btn--primary' : ' btn--soft'}`}
                onClick={() => setDraftWinnerProfileId(post.poster_profile_id)}
                disabled={saving}
              >
                {posterName} wins
              </button>
              <button
                type="button"
                className={`btn${draftWinnerProfileId === oppId ? ' btn--primary' : ' btn--soft'}`}
                onClick={() => setDraftWinnerProfileId(oppId)}
                disabled={saving}
              >
                {oppName} wins
              </button>
            </div>
          ) : null}
          <div className="socialRowInput">
            <button type="button" className="btn btn--primary btn--small" onClick={() => void onSaveCaption()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn btn--soft btn--small"
              onClick={() => {
                setEditing(false)
                setDraftCaption(post.caption ?? '')
                setDraftWinnerProfileId(post.winner_profile_id)
                setSaveError('')
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
          {saveError ? <p className="error">{saveError}</p> : null}
        </div>
      ) : (
        <>
          {post.caption ? <p>{post.caption}</p> : null}
        </>
      )}
      <time className="socialPostTimestamp" dateTime={post.created_at}>
        {timestampLabel}
      </time>
    </article>
  )
}

const DAY_FIRST_DATE_LOCALE = 'en-GB'

function formatFeedTimestamp(iso: string) {
  const createdMs = new Date(iso).getTime()
  if (!Number.isFinite(createdMs)) return ''
  const elapsedMs = Date.now() - createdMs
  if (elapsedMs < 0) {
    return new Date(createdMs).toLocaleDateString(DAY_FIRST_DATE_LOCALE, { day: 'numeric', month: 'short' })
  }

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (elapsedMs < hourMs) {
    const minutes = Math.max(1, Math.floor(elapsedMs / minuteMs))
    return `${minutes} min ago`
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs)
    return `${hours}h ago`
  }
  if (elapsedMs < 4 * dayMs) {
    const days = Math.floor(elapsedMs / dayMs)
    return `${days}d ago`
  }
  return new Date(createdMs).toLocaleDateString(DAY_FIRST_DATE_LOCALE, { day: 'numeric', month: 'short' })
}

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="socialBellIcon">
      <path
        d="M12 3a4 4 0 0 0-4 4v1.1c0 1.5-.5 3-1.5 4.2L5 14.2V16h14v-1.8l-1.5-1.9A7 7 0 0 1 16 8.1V7a4 4 0 0 0-4-4Zm0 18a2.7 2.7 0 0 0 2.5-1.7h-5A2.7 2.7 0 0 0 12 21Z"
        fill="currentColor"
      />
    </svg>
  )
}

function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="socialRefreshIcon">
      <path
        d="M12 6V3L8 7l4 4V8c2.21 0 4 1.79 4 4 0 .73-.2 1.41-.54 2h2.13c.26-.63.41-1.31.41-2 0-3.31-2.69-6-6-6Zm-4 4c0-.73.2-1.41.54-2H6.43c-.26.63-.41 1.31-.41 2 0 3.31 2.69 6 6 6v3l4-4-4-4v3c-2.21 0-4-1.79-4-4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function FriendRowWeb({
  friend,
  rivalry,
  highlighted,
  busy,
  onChallenge,
}: {
  friend: FriendRecord
  rivalry: { wins: number; losses: number; gamesPlayed: number; ballsDiff: number }
  highlighted: boolean
  busy: boolean
  onChallenge: () => void
}) {
  const ballsDiffLabel = `${rivalry.ballsDiff >= 0 ? '+' : ''}${rivalry.ballsDiff}`

  return (
    <div className={`socialCard${highlighted ? ' socialCard--highlighted' : ''}`}>
      <div className="socialCardRow socialCardRow--spread socialFriendRow">
        <div className="socialCardRow">
          <Link
            className="socialAvatarLink"
            to={`/profile/${encodeURIComponent(friend.friendProfileId)}?username=${encodeURIComponent(friend.friendUsername)}`}
            aria-label={`Open ${friend.friendUsername} profile`}
            title={`Open ${friend.friendUsername} profile`}
          >
            <Avatar userId={friend.friendProfileId} size={44} username={friend.friendUsername} />
          </Link>
          <div className="socialFriendIdentityLine">
            <strong className="adminInlineName">
              <Link
                className="socialProfileLink"
                to={`/profile/${encodeURIComponent(friend.friendProfileId)}?username=${encodeURIComponent(friend.friendUsername)}`}
              >
                <span>{friend.friendUsername}</span>
              </Link>
            </strong>
            <div className="socialRivalryRow" aria-label="Head-to-head wins, losses, and total balls differential">
              <span className="socialRivalryRow__wins">{rivalry.wins}</span>
              <span>-</span>
              <span className="socialRivalryRow__losses">{rivalry.losses}</span>
              <span className={`socialRivalryRow__diff ${rivalry.ballsDiff >= 0 ? 'socialRivalryRow__diff--plus' : 'socialRivalryRow__diff--minus'}`}>
                ({ballsDiffLabel})
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--soft socialChallengeBtn"
          onClick={onChallenge}
          disabled={busy}
          aria-label={`Challenge ${friend.friendUsername}`}
          title={`Challenge ${friend.friendUsername}`}
        >
          <span className="socialChallengeBtn__label">Challenge</span>
        </button>
      </div>
    </div>
  )
}

