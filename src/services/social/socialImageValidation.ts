const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png'])

export const SOCIAL_IMAGE_MAX_BYTES = MAX_BYTES

export function assertValidSocialImage(mimeType: string | undefined | null, byteSize: number | undefined | null) {
  const mime = (mimeType ?? '').toLowerCase()
  if (!ALLOWED.has(mime)) {
    throw new Error('Images must be JPEG or PNG.')
  }
  if (byteSize != null && byteSize > MAX_BYTES) {
    throw new Error('Image must be under 5MB.')
  }
}
