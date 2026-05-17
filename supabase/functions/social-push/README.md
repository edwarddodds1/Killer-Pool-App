## social-push Edge Function

Sends Expo push notifications for:

- `friendships` (new request / accepted)
- `feed_posts` (new post by friend)
- `head_to_head_games` (challenge result recorded)
- `timer_pool_scores` (new PB; friends-only unless actor is top-5)

### Deploy

```bash
supabase functions deploy social-push
```

Function requires default project env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Database Webhooks

Create database webhooks in Supabase Dashboard that call:

`https://<project-ref>.functions.supabase.co/social-push`

for `INSERT`/`UPDATE` events on:

- `public.friendships` (`INSERT` + `UPDATE`)
- `public.feed_posts` (`INSERT`)
- `public.head_to_head_games` (`INSERT`)
- `public.timer_pool_scores` (`INSERT`)

### Notes

- Client stores device Expo push tokens in `public.push_device_tokens`.
- Logging out disables the local device token for that account.
- This function intentionally computes recipient routing server-side.
