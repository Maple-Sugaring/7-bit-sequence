# Discord push notifications

The `Notify Discord on main push` workflow posts one message for each push to
`main`. It does not run for pull requests or pushes to other branches.

1. In Discord, open the destination channel's settings and create a webhook
   under **Integrations → Webhooks**. Copy its URL.
2. In this GitHub repository, open **Settings → Secrets and variables → Actions**
   and create a repository secret named `DISCORD_WEBHOOK_URL` with that URL.
3. Merge the workflow PR. The next push to `main` will post a message containing
   the repository, actor, commit link, and compare link. Check the Actions run
   if a message does not appear.

Treat the webhook URL as a secret. Anyone with it can post to the channel.
