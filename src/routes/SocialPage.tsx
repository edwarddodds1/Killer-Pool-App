import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildNewRoom } from '../utils/game'
import { isSupabaseEnabled } from '../lib/supabase'
import {
  getFriendChallengeStats,
  getProfile,
  getRoomRemote,
  hydrateProfileSessionFromServer,
  upsertRoom,
  upsertRoomRemote,
} from '../utils/store'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { RulesHelpIconButton, RulesModal } from '../components/ui/RulesModal'
import { useSocialNotifications } from '../components/social/useSocialNotifications'
import { Avatar } from '../components/social/Avatar'
import { H2hRowWeb } from '../components/social/H2hRowWeb'
import {
  acceptFriendRequest,
  declineFriendRequest,
  getAcceptedFriends,
  listPendingIncoming,
  listPendingOutgoing,
  lookupAccountByUsername,
  sendFriendRequestByUsername,
  unfriend,
  type FriendRecord,
  type PendingIncomingRequest,
} from '../services/social/socialFriendshipService'
import {
  createFeedPostFromFiles,
  fetchFeedPage,
  fetchUsernamesForProfileIds,
  type FeedPostRow,
} from '../services/social/socialFeedService'
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
  const { hasUnreadNotifications, notifications, refreshFriendBadge, refreshNotifications, markNotificationsSeen } =
    useSocialNotifications()
  const [tab, setTab] = useState<TabKey>('feed')
  const [, setHydrated] = useState(0)
  const profile = getProfile()
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

  const [friends, setFriends] = useState<FriendRecord[]>([])
  const [pendingIn, setPendingIn] = useState<PendingIncomingRequest[]>([])
  const [pendingOut, setPendingOut] = useState<
    { id: string; recipientProfileId: string; recipientUsername: string; createdAt: string }[]
  >([])
  const [friendInput, setFriendInput] = useState('')
  const [friendBusy, setFriendBusy] = useState(false)
  const [friendErr, setFriendErr] = useState('')
  const [friendOk, setFriendOk] = useState('')

  const [feedPosts, setFeedPosts] = useState<FeedPostRow[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const [feedError, setFeedError] = useState('')
  const [nameById, setNameById] = useState<Record<string, string>>({})
  const feedOffsetRef = useRef(0)

  const [h2hRows, setH2hRows] = useState<HeadToHeadRow[]>([])
  const [gameSearch, setGameSearch] = useState('')
  const [opponentPick, setOpponentPick] = useState<{ id: string; username: string } | null>(null)
  const [winnerIsMe, setWinnerIsMe] = useState(true)
  const [loserBallsRemaining, setLoserBallsRemaining] = useState('7')
  const [gameBusy, setGameBusy] = useState(false)
  const [gameErr, setGameErr] = useState('')

  const [composerOpen, setComposerOpen] = useState(false)
  const [imgLeft, setImgLeft] = useState<File | null>(null)
  const [imgRight, setImgRight] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [tagFriendId, setTagFriendId] = useState<string | null>(null)
  const [postWinnerSelf, setPostWinnerSelf] = useState<boolean | null>(null)
  const [postBusy, setPostBusy] = useState(false)
  const [postErr, setPostErr] = useState('')
  const [showRules, setShowRules] = useState(false)

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
    const rows = await listHeadToHeadForProfile(profileId, 40)
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
          setFeedPosts(rows)
          feedOffsetRef.current = rows.length
          setFeedHasMore(rows.length === PAGE)
        } else {
          setFeedPosts((prev) => [...prev, ...rows])
          feedOffsetRef.current += rows.length
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

  const onAddFriend = async () => {
    if (!profileId || !friendInput.trim()) return
    setFriendBusy(true)
    setFriendErr('')
    setFriendOk('')
    try {
      await sendFriendRequestByUsername(profileId, friendInput)
      setFriendOk('Request sent.')
      setFriendInput('')
      await loadFriendsBlock()
      await refreshFriendBadge()
      await refreshNotifications()
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not send request.')
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

  const onUnfriend = async (friend: FriendRecord) => {
    if (!profileId) return
    setFriendBusy(true)
    try {
      await unfriend(profileId, friend.friendProfileId)
      await loadFriendsBlock()
      await refreshNotifications()
      setFriendOk('Removed friend.')
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not remove.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onChallengeFriend = async (friend: FriendRecord) => {
    if (!profileId || !profile) return
    if (!friend.friendProfileId) return
    setFriendBusy(true)
    setFriendErr('')
    try {
      let room = buildNewRoom({ id: profileId, username: profile.username }, 'killer', 'multi')
      while (await getRoomRemote(room.code)) {
        room = buildNewRoom({ id: profileId, username: profile.username }, 'killer', 'multi')
      }
      upsertRoom(room)
      await upsertRoomRemote(room)
      navigate(`/room/${room.code}`)
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not create room.')
    } finally {
      setFriendBusy(false)
    }
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
    const opponentId = tagFriendId
    let winnerId: string | null = null
    if (tagFriendId && postWinnerSelf !== null) {
      winnerId = postWinnerSelf ? profileId : tagFriendId
    }
    setPostBusy(true)
    setPostErr('')
    try {
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
      setTagFriendId(null)
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
    setComposerOpen(true)
  }

  const h2hSummary = profileId ? summarizeHeadToHeadForViewer(h2hRows, profileId) : null

  const friendIdSet = useMemo(() => new Set(friends.map((f) => f.friendProfileId)), [friends])
  const outgoingRecipientIds = useMemo(() => new Set(pendingOut.map((p) => p.recipientProfileId)), [pendingOut])
  const incomingRequesterIds = useMemo(() => new Set(pendingIn.map((r) => r.requesterProfileId)), [pendingIn])
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

  const onRequestSuggestedFriend = async (username: string) => {
    if (!profileId) return
    setFriendBusy(true)
    setFriendErr('')
    setFriendOk('')
    try {
      await sendFriendRequestByUsername(profileId, username)
      setFriendOk(`Request sent to ${username}.`)
      await loadFriendsBlock()
      await refreshNotifications()
      await refreshFriendBadge()
    } catch (e) {
      setFriendErr(e instanceof Error ? e.message : 'Could not send request.')
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
            You’re using <strong>Continue as guest</strong> on Home (no saved account). Friends, feed, and cloud 1v1 records need the
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
      <p className="muted">Feed, friends, notifications, and head-to-head games.</p>

      <div className="socialTabs" role="tablist">
        {(['feed', 'friends', 'notifications', 'games'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
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
              New post (2 photos)
            </button>
            <button type="button" className="btn btn--soft" onClick={onRefreshFeed} disabled={feedRefreshing}>
              {feedRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {feedError ? <p className="error">{feedError}</p> : null}
          {feedLoading && !feedPosts.length ? <p className="muted">Loading…</p> : null}
          <div className="socialFeedList">
            {!feedLoading && !feedPosts.length ? <p className="muted">No posts yet.</p> : null}
            {feedPosts.map((post) => (
              <FeedCard key={post.id} post={post} names={nameById} />
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
          <div className="socialRowInput">
            <input
              className="fieldInput"
              placeholder="Username"
              value={friendInput}
              onChange={(e) => setFriendInput(e.target.value)}
              maxLength={15}
            />
            <button type="button" className="btn btn--primary" onClick={() => void onAddFriend()} disabled={friendBusy}>
              Request
            </button>
          </div>
          {friendErr ? <p className="error">{friendErr}</p> : null}
          {friendOk ? <p className="muted">{friendOk}</p> : null}

          {suggestFriendsFromH2h.length ? (
            <>
              <h2>Suggested — from your 1v1 games</h2>
              <p className="muted socialHint">Players you’ve recorded games with who aren’t friends yet.</p>
              {suggestFriendsFromH2h.map((s) => (
                <div key={s.profileId} className="socialCard">
                  <div className="socialCardRow socialCardRow--spread">
                    <div className="socialCardRow">
                      <Avatar userId={s.profileId} size={40} username={s.username} />
                      <strong>
                        <Link
                          className="socialProfileLink"
                          to={`/profile/${encodeURIComponent(s.profileId)}?username=${encodeURIComponent(s.username)}`}
                        >
                          {s.username}
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
                    <strong>
                      <Link
                        className="socialProfileLink"
                        to={`/profile/${encodeURIComponent(r.requesterProfileId)}?username=${encodeURIComponent(r.requesterUsername)}`}
                      >
                        {r.requesterUsername}
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
                    <strong>
                      <Link
                        className="socialProfileLink"
                        to={`/profile/${encodeURIComponent(r.recipientProfileId)}?username=${encodeURIComponent(r.recipientUsername)}`}
                      >
                        {r.recipientUsername}
                      </Link>
                    </strong>
                    <span className="socialPendingBadge">Pending</span>
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
              viewerId={profileId!}
              busy={friendBusy}
              onProfile={() =>
                navigate(`/profile/${encodeURIComponent(f.friendProfileId)}?username=${encodeURIComponent(f.friendUsername)}`)
              }
              onChallenge={() => void onChallengeFriend(f)}
              onRemove={() => void onUnfriend(f)}
            />
          ))}
        </section>
      ) : null}

      {tab === 'games' ? (
        <section className="socialSection card card--pool stack">
          <div className="pageHeadingRow">
            <h2 className="pageHeadingRow__title">Record 1v1</h2>
            <div className="pageHeadingRow__tools">
              <RulesHelpIconButton onPress={() => setShowRules(true)} label="Duel rules" />
            </div>
          </div>
          <div className="socialRowInput">
            <input className="fieldInput" placeholder="Opponent username" value={gameSearch} onChange={(e) => setGameSearch(e.target.value)} />
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
          {gameErr ? <p className="error">{gameErr}</p> : null}
          <button type="button" className="btn btn--go" onClick={() => void submitGame()} disabled={gameBusy || !opponentPick}>
            {gameBusy ? 'Saving…' : 'Save game'}
          </button>

          <h2>Your 1v1 history</h2>
          {h2hSummary && h2hSummary.games > 0 ? (
            <p className="muted">
              {h2hSummary.games} games · {h2hSummary.wins}W-{h2hSummary.losses}L · Avg {h2hSummary.avgBallsFor ?? '—'} /{' '}
              {h2hSummary.avgBallsAgainst ?? '—'}
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
            <button type="button" className="btn btn--soft btn--small" onClick={() => void refreshNotifications()}>
              Refresh
            </button>
          </div>
          {!notifications.length ? (
            <p className="muted">No social notifications yet.</p>
          ) : (
            <div className="socialNotificationsList">
              {notifications.map((item) => (
                <article key={item.id} className={`socialNotificationCard socialNotificationCard--${item.type}`}>
                  <div className="socialNotificationIcon" aria-hidden="true">
                    {item.type === 'friend_request' ? '+' : item.type === 'post' ? '#' : 'vs'}
                  </div>
                  <div className="socialNotificationBody">
                    <div className="socialNotificationHead">
                      <strong>{item.title}</strong>
                      <time className="muted" dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p>{item.body}</p>
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
            <p className="muted">Tag opponent (optional)</p>
            <div className="socialChips">
              <button type="button" className={`btn btn--soft${!tagFriendId ? ' btn--primary' : ''}`} onClick={() => setTagFriendId(null)}>
                None
              </button>
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
            {tagFriendId ? (
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
            <button type="button" className="btn btn--go" onClick={() => void submitPost()} disabled={postBusy}>
              {postBusy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      ) : null}
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
    </main>
  )
}

function FeedCard({ post, names }: { post: FeedPostRow; names: Record<string, string> }) {
  const posterName = names[post.poster_profile_id] ?? 'Player'
  const oppId = post.opponent_profile_id
  const oppName = oppId ? names[oppId] ?? 'Player' : null
  return (
    <article className="socialPostCard">
      <div className="socialPostHead">
        <Avatar userId={post.poster_profile_id} size={40} username={posterName} />
        <div>
          <div className="socialNameRow">
            <strong>
              <Link
                className="socialProfileLink"
                to={`/profile/${encodeURIComponent(post.poster_profile_id)}?username=${encodeURIComponent(posterName)}`}
              >
                {posterName}
              </Link>
            </strong>
            {post.winner_profile_id === post.poster_profile_id ? <span title="Winner">🏆</span> : null}
          </div>
          {oppName && oppId ? (
            <div className="socialNameRow">
              <Avatar userId={oppId} size={28} username={oppName} />
              <Link className="socialProfileLink" to={`/profile/${encodeURIComponent(oppId)}?username=${encodeURIComponent(oppName)}`}>
                {oppName}
              </Link>
              {post.winner_profile_id === oppId ? <span title="Winner">🏆</span> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="socialDualImg">
        <img src={post.image_url_left} alt="" className="socialDualImg__img" />
        <img src={post.image_url_right} alt="" className="socialDualImg__img" />
      </div>
      {post.caption ? <p>{post.caption}</p> : null}
      <time className="muted" dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleString()}
      </time>
    </article>
  )
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

function FriendRowWeb({
  friend,
  viewerId,
  busy,
  onProfile,
  onChallenge,
  onRemove,
}: {
  friend: FriendRecord
  viewerId: string
  busy: boolean
  onProfile: () => void
  onChallenge: () => void
  onRemove: () => void
}) {
  const rivalry = useMemo(() => {
    const s = getFriendChallengeStats(viewerId, friend.friendProfileId)
    if (s.games === 0) return 'W0-L0'
    return `W${s.wins}-L${s.losses}`
  }, [viewerId, friend.friendProfileId])

  return (
    <div className="socialCard">
      <div className="socialCardRow">
        <Avatar userId={friend.friendProfileId} size={44} username={friend.friendUsername} />
        <div>
          <strong>
            <Link
              className="socialProfileLink"
              to={`/profile/${encodeURIComponent(friend.friendProfileId)}?username=${encodeURIComponent(friend.friendUsername)}`}
            >
              {friend.friendUsername}
            </Link>
          </strong>
          <div className="muted">{rivalry}</div>
        </div>
      </div>
      <div className="socialRowInput">
        <button type="button" className="btn btn--soft" onClick={onProfile}>
          Profile
        </button>
        <button type="button" className="btn btn--soft" onClick={onChallenge} disabled={busy}>
          Challenge
        </button>
        <button type="button" className="btn btn--soft" onClick={onRemove} disabled={busy}>
          Unfriend
        </button>
      </div>
    </div>
  )
}

