const urlCache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

export function primeAvatarCache(profileId: string, url: string | null) {
  urlCache.set(profileId, url)
}

export function readAvatarCache(profileId: string): string | null | undefined {
  if (!urlCache.has(profileId)) return undefined
  return urlCache.get(profileId) ?? null
}

export async function loadAvatarUrl(
  profileId: string,
  fetcher: (id: string) => Promise<string | null>,
): Promise<string | null> {
  if (urlCache.has(profileId)) {
    return urlCache.get(profileId) ?? null
  }
  const pending = inflight.get(profileId)
  if (pending) return pending

  const promise = fetcher(profileId)
    .then((url) => {
      urlCache.set(profileId, url)
      inflight.delete(profileId)
      return url
    })
    .catch(() => {
      inflight.delete(profileId)
      urlCache.set(profileId, null)
      return null
    })

  inflight.set(profileId, promise)
  return promise
}
