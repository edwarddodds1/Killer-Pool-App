import { supabase } from '../../lib/supabase'
import { ACCOUNTS_TABLE, FEED_POSTS_TABLE, SOCIAL_IMAGES_BUCKET } from './socialConstants'
import { assertValidSocialImage, SOCIAL_IMAGE_MAX_BYTES } from './socialImageValidation'

export type FeedPostRow = {
  id: string
  poster_profile_id: string
  opponent_profile_id: string | null
  winner_profile_id: string | null
  image_url_left: string
  image_url_right: string
  caption: string | null
  created_at: string
}

export async function fetchUsernamesForProfileIds(ids: string[]): Promise<Record<string, string>> {
  if (!supabase || !ids.length) return {}
  const unique = [...new Set(ids.filter(Boolean))]
  const { data, error } = await supabase
    .from(ACCOUNTS_TABLE)
    .select('profile_id, username')
    .in('profile_id', unique)
    .returns<{ profile_id: string; username: string }[]>()
  if (error || !data) return {}
  return Object.fromEntries(data.map((r) => [r.profile_id, r.username]))
}

export async function fetchFeedPage(params: {
  viewerProfileId: string
  allowedPosterIds: string[]
  offset: number
  pageSize: number
}): Promise<FeedPostRow[]> {
  if (!supabase || params.allowedPosterIds.length === 0) return []
  const { data, error } = await supabase
    .from(FEED_POSTS_TABLE)
    .select(
      'id, poster_profile_id, opponent_profile_id, winner_profile_id, image_url_left, image_url_right, caption, created_at',
    )
    .in('poster_profile_id', params.allowedPosterIds)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.pageSize - 1)
    .returns<FeedPostRow[]>()
  if (error || !data) return []
  return data
}

export async function createFeedPostFromFiles(params: {
  posterProfileId: string
  opponentProfileId: string | null
  winnerProfileId: string | null
  caption: string | null
  imageLeft: File
  imageRight: File
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const client = supabase

  assertValidSocialImage(params.imageLeft.type, params.imageLeft.size)
  assertValidSocialImage(params.imageRight.type, params.imageRight.size)
  if (params.imageLeft.size > SOCIAL_IMAGE_MAX_BYTES || params.imageRight.size > SOCIAL_IMAGE_MAX_BYTES) {
    throw new Error('Each image must be under 5MB.')
  }

  const ts = Date.now()
  const extLeft = params.imageLeft.type.toLowerCase() === 'image/png' ? 'png' : 'jpg'
  const extRight = params.imageRight.type.toLowerCase() === 'image/png' ? 'png' : 'jpg'
  const base = `feed/${params.posterProfileId}/${ts}`
  const pathLeft = `${base}_a.${extLeft}`
  const pathRight = `${base}_b.${extRight}`

  async function upload(path: string, file: File) {
    const { error: upErr } = await client.storage
      .from(SOCIAL_IMAGES_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw new Error(`Upload failed. (${upErr.message})`)
    const { data: pub } = client.storage.from(SOCIAL_IMAGES_BUCKET).getPublicUrl(path)
    return pub.publicUrl
  }

  const urlLeft = await upload(pathLeft, params.imageLeft)
  const urlRight = await upload(pathRight, params.imageRight)

  const { error: insErr } = await client.from(FEED_POSTS_TABLE).insert({
    poster_profile_id: params.posterProfileId,
    opponent_profile_id: params.opponentProfileId,
    winner_profile_id: params.winnerProfileId,
    image_url_left: urlLeft,
    image_url_right: urlRight,
    caption: params.caption?.trim() || null,
  })
  if (insErr) throw new Error(`Could not create post. (${insErr.message})`)
}

export async function updateFeedPostDetails(params: {
  postId: string
  caption: string | null
  winnerProfileId: string | null
}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase
    .from(FEED_POSTS_TABLE)
    .update({
      caption: params.caption?.trim() || null,
      winner_profile_id: params.winnerProfileId,
    })
    .eq('id', params.postId)
  if (error) throw new Error(`Could not update post. (${error.message})`)
}

export async function deleteFeedPost(params: { postId: string }) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from(FEED_POSTS_TABLE).delete().eq('id', params.postId)
  if (error) throw new Error(`Could not delete post. (${error.message})`)
}
