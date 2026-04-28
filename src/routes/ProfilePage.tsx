import { type ChangeEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppHeaderNavIcons } from '../components/AppHeaderNavIcons'
import { Avatar } from '../components/social/Avatar'
import { H2hRowWeb } from '../components/social/H2hRowWeb'
import { primeAvatarCache } from '../components/social/avatarCache'
import { fetchUsernamesForProfileIds } from '../services/social/socialFeedService'
import {
  acceptFriendRequest,
  fetchUsernameForProfileId,
  getSocialRelationship,
  sendFriendRequestByUsername,
  unfriend,
} from '../services/social/socialFriendshipService'
import {
  listHeadToHeadForPair,
  listHeadToHeadForProfile,
  summarizeHeadToHeadForViewer,
  type HeadToHeadRow,
} from '../services/social/socialHeadToHeadService'
import { uploadProfileAvatar } from '../services/social/socialProfilePictureService'
import type { TimerScore } from '../types'
import { formatTimerElapsedMs, timerScoreBelongsToProfile, timerScoreKey } from '../../shared/timerLeaderboard'
import {
  deleteCurrentAccount,
  findKnownUsernameForProfileId,
  flushPendingTimerScores,
  clearKillerPoolStatsForProfile,
  getKillerPoolStats,
  getProfile,
  getTimerScores,
  getTimerScoresLocal,
  updateTimerScoreElapsedMs,
} from '../utils/store'

const ADMIN_USERNAMES = new Set(['edwarddodds1'])
const MIN_VALID_TIMER_RUN_MS = 20_000

function formatRunDate(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function parseFormattedTimerInput(value: string): number | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const centiseconds = Number(match[3])
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(centiseconds)) return null
  return minutes * 60_000 + seconds * 1_000 + centiseconds * 10
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

function formatMinutesSeconds(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clamp05To5(value: number) {
  return Math.max(0.5, Math.min(5, value))
}

function mean(values: number[]) {
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  const avg = mean(values)
  if (avg === null) return null
  const variance = values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

function describeFormComponent(component: number) {
  if (component >= 0.8) return 'Excellent'
  if (component >= 0.6) return 'Strong'
  if (component >= 0.4) return 'Average'
  return 'Needs work'
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { profileId } = useParams<{ profileId?: string }>()
  const [searchParams] = useSearchParams()
  const profile = getProfile()
  const [scores, setScores] = useState<TimerScore[]>([])
  const [error, setError] = useState('')
  const [editingRunKey, setEditingRunKey] = useState<string | null>(null)
  const [editingRun, setEditingRun] = useState<TimerScore | null>(null)
  const [editingSeconds, setEditingSeconds] = useState('')
  const [selectedAttemptKey, setSelectedAttemptKey] = useState<string | null>(null)
  const [showFormInfo, setShowFormInfo] = useState(false)
  const [h2hRows, setH2hRows] = useState<HeadToHeadRow[]>([])
  const [h2hNames, setH2hNames] = useState<Record<string, string>>({})
  const [socialRel, setSocialRel] = useState<
    'loading' | 'none' | 'pending_out' | 'pending_in' | 'friends' | 'declined'
  >('loading')
  const [friendshipRowId, setFriendshipRowId] = useState<string | null>(null)
  const [friendBusy, setFriendBusy] = useState(false)
  const [friendMsg, setFriendMsg] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [killerStatsEpoch, setKillerStatsEpoch] = useState(0)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const deferredScores = useDeferredValue(scores)
  const requestedUsername = (searchParams.get('username') ?? '').trim()
  const isAdmin = useMemo(() => {
    if (!profile) return false
    return ADMIN_USERNAMES.has(profile.username.trim().toLowerCase())
  }, [profile])

  const reloadScores = async () => {
    setError('')
    try {
      // Hydrate instantly from local cache for fast back/forward navigation.
      const local = getTimerScoresLocal()
      if (local.length) {
        setScores(local)
      }
      await flushPendingTimerScores()
      setScores(await getTimerScores())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load profile stats.')
    }
  }

  // `getProfile()` returns a fresh object every render; putting `profile` in the
  // dependency array retriggers this effect forever (setScores → re-render → new profile ref).
  const sessionProfileId = profile?.id ?? ''

  useEffect(() => {
    if (!sessionProfileId) {
      navigate('/', { replace: true })
      return
    }

    void reloadScores()
  }, [navigate, sessionProfileId, profileId, requestedUsername])

  const viewingOwnProfile = !profileId
  // Defensive fallback: if a profile is opened by id with no ?username= query
  // (e.g. an old link or a leaderboard click that lost the suffix), try the
  // local accounts cache so we can still match score rows by username when
  // their profile_id has drifted from the canonical user_accounts row.
  const cachedUsernameForProfileId = useMemo(() => {
    if (viewingOwnProfile || !profileId) return ''
    return findKnownUsernameForProfileId(profileId) ?? ''
  }, [profileId, viewingOwnProfile])
  const profileRuns = useMemo(() => {
    if (!profile && viewingOwnProfile) return []
    const normalizedRequestedName = requestedUsername.toLowerCase()
    const normalizedCachedName = cachedUsernameForProfileId.trim().toLowerCase()
    return deferredScores
      .filter((score) => {
        if (viewingOwnProfile) {
          if (!profile) return false
          return timerScoreBelongsToProfile(score, profile)
        }
        if (profileId && score.profileId === profileId) return true
        const normalizedScoreName = score.username.trim().toLowerCase()
        if (!normalizedScoreName) return false
        if (normalizedRequestedName && normalizedScoreName === normalizedRequestedName) return true
        if (normalizedCachedName && normalizedScoreName === normalizedCachedName) return true
        return false
      })
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [cachedUsernameForProfileId, deferredScores, profile, profileId, requestedUsername, viewingOwnProfile])

  const profileDisplayName = useMemo(() => {
    if (viewingOwnProfile) return profile?.username ?? 'Player'
    return profileRuns[0]?.username ?? (requestedUsername || cachedUsernameForProfileId || 'Player')
  }, [cachedUsernameForProfileId, profile?.username, profileRuns, requestedUsername, viewingOwnProfile])

  const bestRun = useMemo(() => {
    if (!profileRuns.length) return null
    return profileRuns.reduce((best, run) => (run.elapsedMs < best.elapsedMs ? run : best))
  }, [profileRuns])

  const averageMs = useMemo(() => {
    if (!profileRuns.length) return null
    return Math.round(profileRuns.reduce((total, run) => total + run.elapsedMs, 0) / profileRuns.length)
  }, [profileRuns])

  const latestRun = profileRuns[0] ?? null
  // When viewing by username query (without /profile/:profileId), recover the profile id from runs.
  const inferredViewedProfileId = useMemo(() => {
    if (viewingOwnProfile) return null
    if (profileId) return profileId
    return profileRuns.find((run) => Boolean(run.profileId))?.profileId ?? null
  }, [profileId, profileRuns, viewingOwnProfile])
  const killerPoolProfileId = viewingOwnProfile ? profile?.id : inferredViewedProfileId
  const killerPoolStats = useMemo(() => {
    if (!killerPoolProfileId) return { wins: 0, games: 0 }
    return getKillerPoolStats(killerPoolProfileId)
  }, [killerPoolProfileId, killerStatsEpoch])
  const killerWinRatioLabel = `${killerPoolStats.wins}/${killerPoolStats.games}`
  const killerWinPct = killerPoolStats.games > 0 ? Math.round((killerPoolStats.wins / killerPoolStats.games) * 100) : null

  const h2hSummary = useMemo(() => {
    if (!h2hRows.length) return null
    const viewerId = viewingOwnProfile ? killerPoolProfileId : profile?.id
    if (!viewerId) return null
    return summarizeHeadToHeadForViewer(h2hRows, viewerId)
  }, [h2hRows, killerPoolProfileId, profile?.id, viewingOwnProfile])

  useEffect(() => {
    if (!killerPoolProfileId || !profile?.id) {
      setH2hRows([])
      return
    }
    let cancelled = false
    void (async () => {
      const rows = viewingOwnProfile
        ? await listHeadToHeadForProfile(killerPoolProfileId, 20)
        : await listHeadToHeadForPair(profile.id, killerPoolProfileId, 15)
      if (cancelled) return
      setH2hRows(rows)
      const ids = new Set<string>()
      for (const row of rows) {
        ids.add(row.player_one_profile_id)
        ids.add(row.player_two_profile_id)
      }
      const names = await fetchUsernamesForProfileIds([...ids])
      if (!cancelled) setH2hNames((prev) => ({ ...prev, ...names }))
    })()
    return () => {
      cancelled = true
    }
  }, [killerPoolProfileId, profile?.id, viewingOwnProfile])

  useEffect(() => {
    if (!profile?.sessionId || !profile.id || !killerPoolProfileId || viewingOwnProfile) {
      setSocialRel('none')
      setFriendshipRowId(null)
      return
    }
    let cancelled = false
    setSocialRel('loading')
    void getSocialRelationship(profile.id, killerPoolProfileId).then((r) => {
      if (cancelled) return
      if (r.relationship === 'none') setSocialRel('none')
      else if (r.relationship === 'friends') setSocialRel('friends')
      else if (r.relationship === 'pending_outgoing') setSocialRel('pending_out')
      else if (r.relationship === 'pending_incoming') setSocialRel('pending_in')
      else setSocialRel('declined')
      setFriendshipRowId(r.rowId)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.sessionId, killerPoolProfileId, viewingOwnProfile])

  const timerRank = useMemo(() => {
    if (!bestRun) return null
    return deferredScores.filter((run) => run.elapsedMs < bestRun.elapsedMs).length + 1
  }, [bestRun, deferredScores])
  const fiveGameAverageMs = useMemo(() => {
    if (!profileRuns.length) return null
    const recentRuns = profileRuns.slice(0, 5)
    return Math.round(recentRuns.reduce((total, run) => total + run.elapsedMs, 0) / recentRuns.length)
  }, [profileRuns])

  const progressRuns = useMemo(() => profileRuns.slice().reverse(), [profileRuns])

  const lineChart = useMemo(() => {
    const width = 620
    const height = 190
    const TICK_MS = 30_000
    if (!progressRuns.length) {
      return {
        width,
        height,
        max: TICK_MS,
        path: '',
        points: [] as Array<{ x: number; y: number; run: TimerScore }>,
        ticks: [
          { y: 0, value: TICK_MS, label: formatTimerElapsedMs(TICK_MS) },
          { y: height, value: 0, label: formatTimerElapsedMs(0) },
        ] as Array<{ y: number; value: number; label: string }>,
        averageValue: 0,
        averageY: height,
      }
    }
    const worstRun = Math.max(...progressRuns.map((run) => run.elapsedMs))
    const axisMaxRaw = worstRun + 15_000
    const axisMax = Math.max(TICK_MS, Math.ceil(axisMaxRaw / TICK_MS) * TICK_MS)
    const points = progressRuns.map((run, index) => {
      const x = progressRuns.length === 1 ? width / 2 : (index / (progressRuns.length - 1)) * width
      const y = height - (run.elapsedMs / axisMax) * height
      return { x, y, run }
    })
    const averageValue = Math.round(progressRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / progressRuns.length)
    const averageY = height - (averageValue / axisMax) * height
    const ticks = Array.from({ length: Math.floor(axisMax / TICK_MS) + 1 }, (_, index) => {
      const value = axisMax - index * TICK_MS
      const y = height - (value / axisMax) * height
      return { y, value, label: formatTimerElapsedMs(value) }
    })
    return {
      width,
      height,
      max: axisMax,
      path: buildLinePath(points.map((p) => ({ x: p.x, y: p.y }))),
      points,
      ticks,
      averageValue,
      averageY,
    }
  }, [progressRuns])

  const weekdayAverages = useMemo(() => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setHours(0, 0, 0, 0)
    // Monday-start week (Mon-Sun)
    const daysSinceMonday = (startOfWeek.getDay() + 6) % 7
    startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 7)

    const byDay = new Map<number, { total: number; runs: number }>()
    for (const run of profileRuns) {
      const runDate = new Date(run.createdAt)
      if (runDate < startOfWeek || runDate >= endOfWeek) continue
      const day = runDate.getDay()
      const current = byDay.get(day)
      if (current) {
        current.total += run.elapsedMs
        current.runs += 1
      } else {
        byDay.set(day, { total: run.elapsedMs, runs: 1 })
      }
    }
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return labels.map((label, day) => {
      const stat = byDay.get(day)
      const avg = stat ? Math.round(stat.total / stat.runs) : null
      return {
        label,
        runs: stat?.runs ?? 0,
        averageMs: avg,
      }
    })
  }, [profileRuns])

  const maxWeekdayAverage = Math.max(
    1,
    ...weekdayAverages.map((entry) => (entry.averageMs === null ? 0 : entry.averageMs)),
  )

  const personalRank = useMemo(() => {
    if (!bestRun) return null
    const allBestByPlayer = new Map<string, number>()
    for (const run of deferredScores) {
      const key = run.profileId || run.username.trim().toLowerCase()
      const current = allBestByPlayer.get(key)
      if (current === undefined || run.elapsedMs < current) {
        allBestByPlayer.set(key, run.elapsedMs)
      }
    }
    const fasterPlayers = [...allBestByPlayer.values()].filter((elapsed) => elapsed < bestRun.elapsedMs).length
    return fasterPlayers + 1
  }, [bestRun, deferredScores])
  const activePlayerCount = useMemo(() => {
    const allBestByPlayer = new Map<string, number>()
    for (const run of deferredScores) {
      const key = run.profileId || run.username.trim().toLowerCase()
      const current = allBestByPlayer.get(key)
      if (current === undefined || run.elapsedMs < current) {
        allBestByPlayer.set(key, run.elapsedMs)
      }
    }
    return allBestByPlayer.size
  }, [deferredScores])

  const formBreakdown = useMemo(() => {
    if (!bestRun || !profileRuns.length) {
      return {
        rating: 0,
        slices: [] as Array<{ key: string; label: string; weight: number; score: number; color: string }>,
      }
    }
    if (profileRuns.length < 3) {
      return {
        rating: 2.5,
        slices: [] as Array<{ key: string; label: string; weight: number; score: number; color: string }>,
      }
    }
    const pbMs = bestRun.elapsedMs
    const recent5 = profileRuns.slice(0, 5).map((run) => run.elapsedMs)
    const recent10 = profileRuns.slice(0, 10).map((run) => run.elapsedMs)
    const recent20 = profileRuns.slice(0, 20).map((run) => run.elapsedMs)
    const avg5 = mean(recent5) ?? pbMs
    const avg20 = mean(recent20) ?? avg5
    const std10 = standardDeviation(recent10) ?? 0

    const trendComponent = clamp01(0.6 + ((avg20 - avg5) / Math.max(1, avg20)) * 2.4)
    const pbClosenessComponent = clamp01(1 - (avg5 - pbMs) / Math.max(1, pbMs * 0.5))
    const consistencyComponent = clamp01(1 - std10 / Math.max(1, pbMs * 0.28))

    const competitivenessComponent =
      personalRank && activePlayerCount > 1
        ? clamp01(1 - (personalRank - 1) / (activePlayerCount - 1))
        : 0.5

    const score01 =
      trendComponent * 0.3 +
      pbClosenessComponent * 0.3 +
      consistencyComponent * 0.15 +
      competitivenessComponent * 0.25
    const stars = clamp05To5(1 + score01 * 4)
    return {
      rating: Math.round(stars * 2) / 2,
      slices: [
        { key: 'trend', label: 'Trend', weight: 0.3, score: trendComponent, color: '#3b82f6' },
        { key: 'pb', label: 'PB Closeness', weight: 0.3, score: pbClosenessComponent, color: '#8b5cf6' },
        { key: 'consistency', label: 'Consistency', weight: 0.15, score: consistencyComponent, color: '#10b981' },
        {
          key: 'competitiveness',
          label: 'Competitiveness',
          weight: 0.25,
          score: competitivenessComponent,
          color: '#f59e0b',
        },
      ],
    }
  }, [activePlayerCount, bestRun, personalRank, profileRuns])
  const formRating = formBreakdown.rating
  const pieRadius = 58
  const pieSize = pieRadius * 2 + 8
  let pieStart = 0
  const pieSlices = formBreakdown.slices.map((slice) => {
    const angle = slice.weight * 360
    const startAngle = pieStart
    const endAngle = pieStart + angle
    pieStart = endAngle
    const start = polarToCartesian(pieSize / 2, pieSize / 2, pieRadius, startAngle)
    const end = polarToCartesian(pieSize / 2, pieSize / 2, pieRadius, endAngle)
    const largeArcFlag = angle > 180 ? 1 : 0
    const d = `M ${pieSize / 2} ${pieSize / 2} L ${start.x} ${start.y} A ${pieRadius} ${pieRadius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`
    return { ...slice, d }
  })

  const onResetKillerPoolStats = () => {
    if (!killerPoolProfileId || !viewingOwnProfile) return
    const confirmed = window.confirm(
      'Reset Killer mode wins and games to 0 on this browser? This only affects local stats and cannot be undone.',
    )
    if (!confirmed) return
    clearKillerPoolStatsForProfile(killerPoolProfileId)
    setKillerStatsEpoch((n) => n + 1)
  }

  const onDeleteAccount = async () => {
    const confirmed = window.confirm('Delete your account? This removes your account credentials from this app.')
    if (!confirmed) return
    setError('')
    try {
      await deleteCurrentAccount()
      navigate('/', { replace: true })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete account.')
    }
  }

  const refreshSocialRel = async () => {
    if (!profile?.id || !killerPoolProfileId || viewingOwnProfile) return
    const r = await getSocialRelationship(profile.id, killerPoolProfileId)
    if (r.relationship === 'none') setSocialRel('none')
    else if (r.relationship === 'friends') setSocialRel('friends')
    else if (r.relationship === 'pending_outgoing') setSocialRel('pending_out')
    else if (r.relationship === 'pending_incoming') setSocialRel('pending_in')
    else setSocialRel('declined')
    setFriendshipRowId(r.rowId)
  }

  const onAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !profile?.id || !profile.sessionId) return
    setAvatarBusy(true)
    setError('')
    try {
      const url = await uploadProfileAvatar({ profileId: profile.id, file })
      primeAvatarCache(profile.id, url)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Photo upload failed.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const onAddFriendProfile = async () => {
    if (!profile?.id || !killerPoolProfileId) return
    setFriendBusy(true)
    setFriendMsg('')
    try {
      const uname = await fetchUsernameForProfileId(killerPoolProfileId)
      if (!uname) throw new Error('Could not resolve username for this profile.')
      await sendFriendRequestByUsername(profile.id, uname)
      await refreshSocialRel()
      setFriendMsg('Friend request sent.')
    } catch (e) {
      setFriendMsg(e instanceof Error ? e.message : 'Could not send request.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onAcceptFriendProfile = async () => {
    if (!profile?.id || !friendshipRowId) return
    setFriendBusy(true)
    try {
      await acceptFriendRequest(profile.id, friendshipRowId)
      await refreshSocialRel()
      setFriendMsg('You are now friends.')
    } catch (e) {
      setFriendMsg(e instanceof Error ? e.message : 'Could not accept.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onUnfriendProfile = async () => {
    if (!profile?.id || !killerPoolProfileId) return
    setFriendBusy(true)
    try {
      await unfriend(profile.id, killerPoolProfileId)
      await refreshSocialRel()
      setFriendMsg('Unfriended.')
    } catch (e) {
      setFriendMsg(e instanceof Error ? e.message : 'Could not unfriend.')
    } finally {
      setFriendBusy(false)
    }
  }

  const onStartEditRun = async (run: TimerScore) => {
    if (!isAdmin) return
    let runToEdit = run
    if (runToEdit.id === undefined) {
      try {
        await flushPendingTimerScores()
        const latestScores = await getTimerScores()
        setScores(latestScores)
        const refreshed = latestScores.find((entry) => timerScoreKey(entry) === timerScoreKey(run))
        if (refreshed?.id !== undefined) {
          runToEdit = refreshed
        } else {
          setError('This attempt is not cloud-identified yet. Refresh and retry.')
          return
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not refresh attempts for editing.')
        return
      }
    }
    setError('')
    setEditingRun(runToEdit)
    setEditingSeconds(formatTimerElapsedMs(runToEdit.elapsedMs))
  }

  const onCancelEditRun = () => {
    setEditingRun(null)
    setEditingSeconds('')
  }

  const onSaveEditRun = async () => {
    if (!isAdmin) return
    if (!editingRun) return
    if (editingRun.id === undefined) {
      setError('This attempt is not cloud-identified yet. Refresh and retry.')
      return
    }

    const nextElapsedMs = parseFormattedTimerInput(editingSeconds)
    if (nextElapsedMs === null) {
      setError('Please enter a valid time in format MM:SS.CS (for example 01:23.45).')
      return
    }
    if (nextElapsedMs < MIN_VALID_TIMER_RUN_MS) {
      setError('Edited time must be at least 20.00 seconds.')
      return
    }

    const runKey = timerScoreKey(editingRun)
    const previousRunSnapshot = editingRun
    setError('')
    setEditingRunKey(runKey)
    setScores((current) =>
      current.map((entry) =>
        (entry.id === editingRun.id) ||
        (entry.profileId === editingRun.profileId && entry.createdAt === editingRun.createdAt)
          ? { ...entry, elapsedMs: nextElapsedMs }
          : entry,
      ),
    )
    // Close modal immediately while save call completes in background.
    setEditingRun(null)
    setEditingSeconds('')

    try {
      const updated = await updateTimerScoreElapsedMs({
        id: editingRun.id,
        profileId: editingRun.profileId,
        username: editingRun.username,
        elapsedMs: editingRun.elapsedMs,
        createdAt: editingRun.createdAt,
        nextElapsedMs,
      })
      setScores((current) =>
        current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)),
      )
    } catch (updateError) {
      setScores((current) =>
        current.map((entry) =>
          (entry.id !== undefined && entry.id === previousRunSnapshot.id) ||
          (entry.profileId === previousRunSnapshot.profileId &&
            entry.createdAt === previousRunSnapshot.createdAt)
            ? { ...entry, elapsedMs: previousRunSnapshot.elapsedMs }
            : entry,
        ),
      )
      setError(
        updateError instanceof Error
          ? `${updateError.message} The previous time has been restored.`
          : 'Could not update timer attempt in the cloud. The previous time has been restored.',
      )
    } finally {
      setEditingRunKey(null)
    }
  }

  return (
    <main className="page profilePage">
      <div className="profileTitleRow pageHeadingRow">
        <h1 className="profileTitle pageHeadingRow__title">
          {viewingOwnProfile ? 'Your Profile' : 'Player Profile'}
        </h1>
        <AppHeaderNavIcons />
      </div>

      <section className="card card--pool profileCard">
        <header className="profileCardHeader">
          {killerPoolProfileId ? (
            <div className="profileAvatarWrap">
              <div className="profileAvatarSlot">
                <Avatar userId={killerPoolProfileId} size={72} username={profileDisplayName} />
                {viewingOwnProfile && profile?.sessionId ? (
                  <>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="visuallyHidden"
                      onChange={onAvatarFile}
                    />
                    <button
                      type="button"
                      className="profileAvatarEditBtn"
                      aria-label={avatarBusy ? 'Uploading profile photo' : 'Change profile picture'}
                      title={avatarBusy ? 'Uploading…' : 'Change profile picture'}
                      disabled={avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <svg className="profileAvatarEditBtn__icon" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.41l-2.34-2.34a1.003 1.003 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                        />
                      </svg>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="profileIdentityBlock">
            <div className="profileNameRow">
              <h2>{profileDisplayName}</h2>
            </div>
            <div className="profileMetaRow">
              {timerRank !== null ? (
                <div
                  className="homeTimerRankBubble homeTimerRankBubble--profileCompact"
                  aria-label={`Timer : number ${timerRank} ranked player`}
                  title={`Timer : #${timerRank} ranked player`}
                >
                  <span className="homeTimerRankBubble__label">Timer :</span>
                  <span className="homeTimerRankBubble__value">#{timerRank} ranked player</span>
                </div>
              ) : null}
              <button
                type="button"
                className="profileFormRating profileFormRatingBtn profileFormRating--inline"
                aria-label={`Form rating ${formRating} out of 5. Open form breakdown.`}
                onClick={() => setShowFormInfo(true)}
              >
                <span className="profileFormLabel">Form</span>
                {Array.from({ length: 5 }, (_, index) => (
                  <svg
                    key={index}
                    viewBox="0 0 24 24"
                    className="profileFormStar"
                    aria-hidden="true"
                  >
                  <defs>
                    <clipPath id={`profile-form-star-fill-${index}`}>
                      <rect
                        x="0"
                        y="0"
                        width={`${Math.max(0, Math.min(1, formRating - index)) * 24}`}
                        height="24"
                      />
                    </clipPath>
                  </defs>
                  <path
                    className="profileFormStarBase"
                    d="M12 2.6 14.9 8.5l6.5 1-4.7 4.6 1.1 6.4L12 17.4 6.2 20.5l1.1-6.4-4.7-4.6 6.5-1L12 2.6Z"
                    fill="currentColor"
                  />
                  <path
                    className="profileFormStarFill"
                    d="M12 2.6 14.9 8.5l6.5 1-4.7 4.6 1.1 6.4L12 17.4 6.2 20.5l1.1-6.4-4.7-4.6 6.5-1L12 2.6Z"
                    fill="currentColor"
                    clipPath={`url(#profile-form-star-fill-${index})`}
                  />
                </svg>
                ))}
              </button>
            </div>
          </div>
        </header>

        {error ? <p className="error">{error}</p> : null}

        {!viewingOwnProfile && profile?.sessionId && killerPoolProfileId ? (
          <div className="profileFriendBand">
            {socialRel === 'loading' ? (
              <p className="muted">Loading friendship…</p>
            ) : (
              <>
                {socialRel === 'none' || socialRel === 'declined' ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={friendBusy}
                    onClick={() => void onAddFriendProfile()}
                  >
                    Add friend
                  </button>
                ) : null}
                {socialRel === 'pending_out' ? <span className="muted">Friend request pending</span> : null}
                {socialRel === 'pending_in' ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={friendBusy}
                    onClick={() => void onAcceptFriendProfile()}
                  >
                    Accept request
                  </button>
                ) : null}
                {socialRel === 'friends' ? (
                  <div className="profileFriendRow">
                    <span className="muted">Friends</span>
                    <button type="button" className="btn btn--soft" disabled={friendBusy} onClick={() => void onUnfriendProfile()}>
                      Unfriend
                    </button>
                  </div>
                ) : null}
                {friendMsg ? <p className="muted profileFriendMsg">{friendMsg}</p> : null}
                <p className="muted profileFriendHint">
                  Open <Link to="/social">Social</Link> for feed, requests, and 1v1 games.
                </p>
              </>
            )}
          </div>
        ) : null}

        <section className="profileStatsGrid" aria-label="Profile highlights">
          <article className="profileStatCard">
            <span>Best run</span>
            <strong>{bestRun ? formatTimerElapsedMs(bestRun.elapsedMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Average run</span>
            <strong>{averageMs !== null ? formatTimerElapsedMs(averageMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Total runs</span>
            <strong>{profileRuns.length}</strong>
          </article>
          <article className="profileStatCard">
            <span>Global best rank</span>
            <strong>{personalRank ?? '--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Latest run</span>
            <strong>{latestRun ? formatTimerElapsedMs(latestRun.elapsedMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>5 game average</span>
            <strong>{fiveGameAverageMs !== null ? formatTimerElapsedMs(fiveGameAverageMs) : '--:--.--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Killer win ratio</span>
            <strong>{killerPoolStats.games > 0 ? killerWinRatioLabel : '--'}</strong>
          </article>
          <article className="profileStatCard">
            <span>Killer win %</span>
            <strong>{killerWinPct !== null ? `${killerWinPct}%` : '--'}</strong>
          </article>
        </section>

        {viewingOwnProfile && killerPoolProfileId && (killerPoolStats.games > 0 || killerPoolStats.wins > 0) ? (
          <section className="profileKillerStatsReset" aria-label="Killer mode local stats">
            <button type="button" className="btn btn--soft" onClick={onResetKillerPoolStats}>
              Reset killer stats on this device
            </button>
          </section>
        ) : null}

        <section className="profileChartSection">
          <h3>Run Progress</h3>
          {lineChart.points.length ? (
            <div className="profileChartSurface profileChartSurface--progress">
              <div className="profileChartAxis" aria-hidden>
                {lineChart.ticks.map((tick) => (
                  <span
                    key={`${tick.value}-${tick.y}`}
                    style={{ top: `${(tick.y / lineChart.height) * 100}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
              <div className="profileChartPlot">
                <svg viewBox={`0 0 ${lineChart.width} ${lineChart.height}`} preserveAspectRatio="none" className="profileLineChart">
                  {lineChart.ticks.map((tick) => (
                    <line
                      key={`grid-${tick.value}-${tick.y}`}
                      x1={-4}
                      x2={lineChart.width + 4}
                      y1={tick.y}
                      y2={tick.y}
                      className="profileLineGrid"
                    />
                  ))}
                  <line
                    x1={0}
                    x2={lineChart.width}
                    y1={lineChart.averageY}
                    y2={lineChart.averageY}
                    className="profileLineAverage"
                  />
                  <path
                    d={lineChart.path}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <small className="profileLineAverageLabel">
                  Average: {formatTimerElapsedMs(lineChart.averageValue)}
                </small>
              </div>
            </div>
          ) : (
            <p className="muted">Complete timer runs to unlock your progress graph.</p>
          )}
        </section>

        <section className="profileChartSection">
          <h3>Daily Average</h3>
          {weekdayAverages.some((entry) => entry.averageMs !== null) ? (
            <div className="profileBars">
              {weekdayAverages.map((entry) => {
                const heightPct = entry.averageMs ? Math.max(12, (entry.averageMs / maxWeekdayAverage) * 100) : 0
                return (
                  <div key={entry.label} className="profileBarCol">
                    <div className="profileBarTrack">
                      {entry.averageMs ? <div className="profileBarFill" style={{ height: `${heightPct}%` }} /> : null}
                    </div>
                    <span className="profileBarLabel">{entry.label}</span>
                    <small>{entry.averageMs ? formatMinutesSeconds(entry.averageMs) : '--:--'}</small>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted">Play runs across different days to compare pace patterns.</p>
          )}
        </section>

        <section className="profileTableSection profileH2hSection" aria-label="Head to head">
          <h3>Head to head</h3>
          {!h2hRows.length ? (
            <p className="muted">No recorded 1v1 games yet.</p>
          ) : (
            <>
              {h2hSummary && h2hSummary.games > 0 ? (
                <p className="muted">
                  {h2hSummary.games} games · {h2hSummary.wins}W-{h2hSummary.losses}L · Avg {h2hSummary.avgBallsFor ?? '—'} /{' '}
                  {h2hSummary.avgBallsAgainst ?? '—'}
                </p>
              ) : null}
              <ul className="socialH2hList">
                {h2hRows.map((row) => {
                  const vid = viewingOwnProfile ? killerPoolProfileId : profile?.id
                  if (!vid) return null
                  return <H2hRowWeb key={row.id} row={row} viewerId={vid} names={h2hNames} />
                })}
              </ul>
            </>
          )}
        </section>

        <section className="profileTableSection">
          <h3>Recent Attempts</h3>
          {profileRuns.length ? (
            <p className="profileTableSectionHint">Tap for date</p>
          ) : null}
          {profileRuns.length ? (
            <div className="profileTableWrap">
              <table className="profileTable">
                <thead>
                  <tr>
                    <th className="profileTableColTime">Time</th>
                    <th className="profileTableColPb">PB</th>
                    <th className="profileTableColAvgDiff">Average difference</th>
                    {isAdmin ? <th className="profileActionsColHead" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {profileRuns.slice(0, 12).map((run) => {
                    const deltaMs = bestRun ? run.elapsedMs - bestRun.elapsedMs : 0
                    const isBest = bestRun ? timerScoreKey(run) === timerScoreKey(bestRun) : false
                    const averageDiffMs = averageMs === null ? null : run.elapsedMs - averageMs
                    const averageDiffClassName =
                      averageDiffMs === null
                        ? ''
                        : averageDiffMs > 0
                          ? 'profileAvgDiff profileAvgDiff--slower'
                          : averageDiffMs < 0
                            ? 'profileAvgDiff profileAvgDiff--faster'
                            : 'profileAvgDiff'
                    const runKey = timerScoreKey(run)
                    const editing = editingRunKey === runKey
                    const showDate = selectedAttemptKey === runKey
                    return (
                      <tr
                        key={runKey}
                        className={`profileTableRowSelectable ${showDate ? 'profileTableRowSelectable--selected' : ''}`}
                        onClick={() => {
                          if (editingRunKey) return
                          setSelectedAttemptKey((current) => (current === runKey ? null : runKey))
                        }}
                      >
                        <td className={`profileTableColTime ${showDate ? 'profileTableColTime--date' : ''}`}>
                          {showDate ? formatRunDate(run.createdAt) : formatTimerElapsedMs(run.elapsedMs)}
                        </td>
                        <td className="profileTableColPb">{isBest ? 'PB' : `+${formatTimerElapsedMs(deltaMs)}`}</td>
                        <td className={`profileTableColAvgDiff ${averageDiffClassName}`.trim()}>
                          {averageDiffMs === null
                            ? '--'
                            : averageDiffMs === 0
                              ? 'Even'
                              : `${averageDiffMs > 0 ? '+' : '-'}${formatTimerElapsedMs(Math.abs(averageDiffMs))}`}
                        </td>
                        {isAdmin ? (
                          <td>
                            <button
                              type="button"
                              className="profileTableEditBtn profileTableEditBtn--icon"
                              onClick={(event) => {
                                event.stopPropagation()
                                void onStartEditRun(run)
                              }}
                              disabled={editing || run.id === undefined}
                              aria-label="Edit attempt"
                              title={run.id === undefined ? 'Cannot edit until cloud id is available' : 'Edit'}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M4 20h4l10-10a2 2 0 1 0-4-4L4 16v4Z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path d="m12 6 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{viewingOwnProfile ? 'No timer attempts recorded yet.' : 'No runs found for this player yet.'}</p>
          )}
        </section>
        {viewingOwnProfile ? (
          <div className="profileBottomActions">
            <button className="btn btn--danger" type="button" onClick={() => void onDeleteAccount()}>
              Delete account
            </button>
          </div>
        ) : null}
      </section>
      {editingRun ? (
        <div className="profileEditModalOverlay" role="dialog" aria-modal="true" aria-label="Edit attempt time">
          <div className="profileEditModal">
            <h3>Edit attempt time</h3>
            <input
              type="text"
              className="profileTableEditInput profileTableEditInput--modal"
              value={editingSeconds}
              placeholder="00:00.00"
              onChange={(event) => setEditingSeconds(event.target.value)}
              disabled={editingRunKey !== null}
              aria-label="Edit attempt time in format MM:SS.CS"
            />
            <div className="profileEditModalActions">
              <button
                type="button"
                className="profileTableEditBtn"
                onClick={() => void onSaveEditRun()}
                disabled={editingRunKey !== null}
              >
                {editingRunKey !== null ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="profileTableEditBtn profileTableEditBtn--secondary"
                onClick={onCancelEditRun}
                disabled={editingRunKey !== null}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showFormInfo ? (
        <div className="profileEditModalOverlay" role="presentation" onClick={() => setShowFormInfo(false)}>
          <div
            className="profileEditModal profileFormInfoModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-form-info-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="profile-form-info-title">How Form is calculated</h3>
            <p className="muted">
              Your current Form is <strong>{formRating.toFixed(1)} / 5</strong>, based on weighted components.
            </p>
            {pieSlices.length ? (
              <div className="profileFormInfoChartWrap">
                <svg
                  viewBox={`0 0 ${pieSize} ${pieSize}`}
                  width={pieSize}
                  height={pieSize}
                  className="profileFormInfoChart"
                  aria-label="Form weighting breakdown pie chart"
                >
                  {pieSlices.map((slice) => (
                    <path key={slice.key} d={slice.d} fill={slice.color} stroke="#111" strokeWidth="1.3" />
                  ))}
                </svg>
                <div className="profileFormInfoLegend">
                  {pieSlices.map((slice) => (
                    <div key={slice.key} className="profileFormInfoLegendRow">
                      <span className="profileFormInfoSwatch" style={{ backgroundColor: slice.color }} aria-hidden="true" />
                      <span>
                        {slice.label}: {Math.round(slice.weight * 100)}% ({describeFormComponent(slice.score)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">Play at least 3 runs to unlock full Form breakdown.</p>
            )}
            <div className="profileEditModalActions">
              <button type="button" className="btn btn--primary" onClick={() => setShowFormInfo(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

