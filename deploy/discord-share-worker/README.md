# Discord share relay

This Worker is the trust boundary for Aaalice Discord sharing. ComfyUI never
receives the Discord client secret or webhook URL.

## Required resources

- A Discord application with this redirect URI:
  `https://<worker-host>/v1/oauth/callback`
- An incoming webhook for the destination channel
- A Cloudflare Worker and KV namespace bound as `SESSIONS`

Copy `wrangler.toml.example` to `wrangler.toml`, fill in the public values and
create the three secrets:

```text
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_WEBHOOK_URL
wrangler secret put STATE_SECRET
```

`STATE_SECRET` should be a newly generated high-entropy value. Do not reuse the
webhook URL or Discord client secret.

After deployment, the plugin maintainer sets `DEFAULT_RELAY_URL` and
`DEFAULT_COMMUNITY_URL` once in
`nodes/tools/discord_share_routes.py` before publishing. Ordinary users do not
configure Cloudflare or Discord.

The environment variables below are optional overrides for local testing or a
private fork:

```text
AAALICE_DISCORD_SHARE_RELAY_URL=https://<worker-host>
AAALICE_DISCORD_SHARE_COMMUNITY_URL=https://discord.gg/<invite>
```

Restart ComfyUI after changing either environment variable.

## Security behavior

- OAuth requests only `identify` and `guilds.members.read`.
- OAuth results use a signed ComfyUI origin plus a one-time verifier handoff;
  the bearer session never enters a URL or ComfyUI server logs.
- Every session check and send re-reads guild membership from Discord.
- Optional `ALLOWED_ROLE_IDS` further limits sending to selected roles.
- Bearer sessions are random, hashed before KV lookup and expire automatically.
- The Worker rate-limits each Discord user and validates image type and size.
- Long prompts are split into multiple fenced Discord messages; the image is
  attached only to the first message.
