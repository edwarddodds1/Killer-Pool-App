const ADMIN_USERNAMES = new Set(['edwarddodds1'])

export function isAdminUsername(username: string | null | undefined) {
  const normalized = username?.trim().toLowerCase()
  if (!normalized) return false
  return ADMIN_USERNAMES.has(normalized)
}
