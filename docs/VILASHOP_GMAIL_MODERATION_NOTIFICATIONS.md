# VilaShop — Gmail alerts for flagged messages

## What is implemented

- The `flagMessageForModeration` frontend helper and authenticated `flag-message` Edge Function are available for a future chat/reporting interface to call. The current frontend does not yet have an internal chat screen wired to this action.
- The `flag-message` Edge Function validates the caller's Supabase session, applies a per-user rate limit, stores the moderation event and invokes the protected `send-admin-notification` function.
- Email delivery follows a `pending → sending → sent/failed` state transition with an atomic claim, preventing concurrent requests from claiming the same alert. Failed deliveries can be retried. If a worker is interrupted while sending, a `sending` claim older than five minutes can be reclaimed atomically; recent claims remain protected. This is not an exactly-once guarantee: if Gmail accepts a message but the database confirmation fails, a later recovery may send a duplicate.
- Administrators can read the moderation queue, but database column grants restrict their updates to review status and reviewer metadata; message content and email-delivery records remain service-managed.
- The email is sent from `info.parrotdesign@gmail.com` to both `info.parrotdesign@gmail.com` and `adminvilashop@gmail.com`.
- The notification includes category, message/conversation references, the reporting account ID and a short excerpt. The full flagged text remains in the admin-only moderation table.
- Both Edge Functions reject non-object JSON payloads. External OAuth/Gmail requests have explicit time limits, and delivery status changes are checked before a successful result is returned.
- Categories: personal contacts, offensive language, threats, discrimination and other.

## Important current limitation

The current VilaShop frontend does not yet contain an internal chat/messages table or chat route. This PR creates the moderation queue and callable integration helper, but an actual chat screen must call `flagMessageForModeration` when the user/moderation system flags a message. No automatic keyword classifier is claimed.

## Google Cloud OAuth setup

Gmail API is already enabled in the Google Cloud project `VilaShop Notifications`. The OAuth credentials and refresh token were not yet confirmed at the last setup check.

1. In Google Cloud Console, configure the OAuth consent screen and add `info.parrotdesign@gmail.com` as a test user if the app remains in Testing.
2. Create an OAuth Client ID of type Web application and add `https://developers.google.com/oauthplayground` como Authorized redirect URI.
3. Authorize only the scope `https://www.googleapis.com/auth/gmail.send` for `info.parrotdesign@gmail.com` and troque o código por tokens e guarde o refresh token. Use a mesma conta Google do remetente.
4. In the GitHub repository Settings → Secrets and variables → Actions, add these repository/environment secrets under the `production` environment:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
5. Also ensure `SUPABASE_ACCESS_TOKEN` exists in the `production` GitHub environment.
6. Run Actions → `VilaShop - Test direct PostgreSQL and deploy migrations` → Run workflow, select `deploy_admin_notifications=true`. This job configures the Gmail/Supabase Edge Function secrets and deploys the protected mailer. The separate `deploy_flag_message_endpoint=true` option publishes the authenticated flag endpoint only after it verifies that migration `20261125130000` is already recorded remotely. Neither option applies database migrations.

Never put OAuth values in source files, chat messages, or the frontend.

## Database migration

`20261125130000_message_moderation_notifications.sql` creates the admin-only queue. It is versioned in GitHub but is not applied automatically. Apply it only after the existing pending migrations have been reviewed and the owner explicitly authorizes the migration workflow.
