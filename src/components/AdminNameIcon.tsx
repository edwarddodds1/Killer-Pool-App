import { isAdminUsername } from '../utils/admin'

export function AdminNameIcon({ username }: { username: string | null | undefined }) {
  if (!isAdminUsername(username)) return null

  return (
    <span className="adminNameIcon" aria-label="Admin account" title="Admin account">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.4 19 6v5.5c0 4.2-2.8 7.8-7 9.1-4.2-1.3-7-4.9-7-9.1V6l7-2.6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m9.6 12.2 1.7 1.7 3.2-3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
