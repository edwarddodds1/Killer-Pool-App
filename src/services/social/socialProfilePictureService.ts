import { supabase } from '../../lib/supabase'
import { PROFILE_PICTURES_TABLE, SOCIAL_IMAGES_BUCKET } from './socialConstants'
import { assertValidSocialImage, SOCIAL_IMAGE_MAX_BYTES } from './socialImageValidation'

export async function fetchProfilePictureStorageUrl(profileId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(PROFILE_PICTURES_TABLE)
    .select('storage_url')
    .eq('profile_id', profileId)
    .maybeSingle<{ storage_url: string }>()
  if (error) return null
  return data?.storage_url ?? null
}

export async function uploadProfileAvatar(params: { profileId: string; file: File }) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  assertValidSocialImage(params.file.type, params.file.size)
  if (params.file.size > SOCIAL_IMAGE_MAX_BYTES) {
    throw new Error('Image must be under 5MB.')
  }

  const ext = params.file.type.toLowerCase() === 'image/png' ? 'png' : 'jpg'
  const path = `avatars/${params.profileId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(SOCIAL_IMAGES_BUCKET)
    .upload(path, params.file, { upsert: true, contentType: params.file.type })

  if (uploadError) {
    throw new Error(`Upload failed. (${uploadError.message})`)
  }

  const { data: pub } = supabase.storage.from(SOCIAL_IMAGES_BUCKET).getPublicUrl(path)
  const storageUrl = pub.publicUrl

  const { error: delError } = await supabase.from(PROFILE_PICTURES_TABLE).delete().eq('profile_id', params.profileId)
  if (delError) {
    throw new Error(`Could not refresh avatar row. (${delError.message})`)
  }

  const { error: insError } = await supabase
    .from(PROFILE_PICTURES_TABLE)
    .insert({ profile_id: params.profileId, storage_url: storageUrl })

  if (insError) {
    throw new Error(`Could not save avatar. (${insError.message})`)
  }

  return storageUrl
}
