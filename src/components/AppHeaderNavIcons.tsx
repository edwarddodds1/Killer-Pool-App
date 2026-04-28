import { NavLink } from 'react-router-dom'
import { SocialNavIcon } from './social/SocialNavIcon'
import { USER_PERSON_PATH } from './social/userPersonPath'
import { useSocialNotifications } from './social/useSocialNotifications'

function ProfileGlyph() {
  return (
    <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden>
      <path d={USER_PERSON_PATH} fill="currentColor" />
    </svg>
  )
}

function HomeGlyph() {
  return (
    <svg className="timerHomeIcon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3Z" fill="currentColor" />
    </svg>
  )
}

/**
 * Right-aligned app shortcuts: Profile → Social → Home (matches main heading row layout).
 */
export function AppHeaderNavIcons() {
  const { pendingFriendRequests } = useSocialNotifications()

  const btnClass = (isActive: boolean) =>
    `timerHomeBtn timerHomeBtn--small appHeaderNavIcons__btn${isActive ? ' appHeaderNavIcons__btn--active' : ''}`

  return (
    <div className="appHeaderNavIcons" role="navigation" aria-label="App shortcuts">
      <NavLink to="/profile" end className={({ isActive }) => btnClass(isActive)} aria-label="Profile" title="Profile">
        <ProfileGlyph />
      </NavLink>
      <NavLink
        to="/social"
        className={({ isActive }) => `${btnClass(isActive)} appHeaderNavIcons__socialWrap`}
        aria-label="Social"
        title="Social"
      >
        <SocialNavIcon className="timerHomeIcon" size={38} />
        {pendingFriendRequests > 0 ? (
          <span className="appHeaderNavIcons__badge" aria-label={`${pendingFriendRequests} pending friend requests`}>
            {pendingFriendRequests > 9 ? '9+' : pendingFriendRequests}
          </span>
        ) : null}
      </NavLink>
      <NavLink to="/" end className={({ isActive }) => btnClass(isActive)} aria-label="Home" title="Home">
        <HomeGlyph />
      </NavLink>
    </div>
  )
}
