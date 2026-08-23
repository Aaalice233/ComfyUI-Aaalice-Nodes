# Discord share relay

This Worker is the trust boundary for Aaalice Discord sharing. ComfyUI never
receives the Discord client secret or webhook URL.

The module boundary is intentionally narrow: `worker.js` validates the
environment and routes requests, `auth.js` owns OAuth and sessions, `share.js`
owns target selection and transactional Webhook delivery, and `http.js` owns
JSON, CORS and configuration-error responses.

## Required resources

- A Discord application with this redirect URI:
  `https://<worker-host>/v1/oauth/callback`
- One incoming webhook for each selectable destination channel
- A Cloudflare Worker and KV namespace bound as `SESSIONS`
- Wrangler 4.36.0 or newer and a native Rate Limiting binding named
  `SHARE_RATE_LIMITER`

Copy `wrangler.toml.example` to `wrangler.toml`, fill in the public values and
create the three secrets:

```text
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put DISCORD_WEBHOOK_TARGETS
wrangler secret put STATE_SECRET
```

`DISCORD_WEBHOOK_TARGETS` is a JSON array. Target IDs are stable public
identifiers; URLs remain secret. Additional arrays can be stored in separately
named secrets such as `DISCORD_WEBHOOK_TARGETS_CHAT_SFW`; every binding whose
name is `DISCORD_WEBHOOK_TARGETS` or starts with `DISCORD_WEBHOOK_TARGETS_` is
merged in stable name order. This lets maintainers add one channel without
reading or replacing existing webhook secrets. For example:

```json
[
  { "id": "sfw-collection", "label": "SFW collection", "url": "https://discord.com/api/webhooks/...", "default": true },
  { "id": "generation-chat", "label": "Generation chat", "url": "https://discord.com/api/webhooks/...", "default": false, "prefer_prompt_file": true }
]
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

## `POST /v1/share` contract

The authenticated endpoint accepts `multipart/form-data` with these content
fields:

- `image` is required and must be an `image/*` file.
- `prompt` is optional. It is trimmed before planning; an empty or omitted value
  sends the image without a prompt. A non-empty value keeps the existing inline
  splitting and optional UTF-8 TXT attachment behavior.
- `caption` is optional and must be a text field. It is trimmed and may contain
  at most 256 characters. A non-empty caption becomes the title of the final
  Embed that contains the image; it is never placed on an earlier prompt
  segment.
- `filename`, `width`, `height`, repeated `target` fields and
  `long_prompt_as_file` retain their existing behavior.

The first Embed retains the verified Discord author. For a split prompt, the
caption and image are both on the final Embed while the author remains only on
the first Embed. Image-only and image-plus-caption requests still produce one
Embed and therefore keep both the author and image there. Discord's 6,000
character per-message Embed validation includes `title` characters.

Validation failures are machine-readable: `invalid_image` for a missing or
non-image upload, `invalid_caption` when the caption is uploaded as a file, and
`caption_too_long` with `caption_length` and `max_caption_length` details after
trimming. If an otherwise valid caption makes the combined Embed exceed Discord's
6,000-character limit, the response is `embed_too_large`; existing prompt-only
size errors remain unchanged for non-empty prompts.

## Security behavior

- OAuth requests only `identify` and `guilds.members.read`.
- OAuth results use a signed ComfyUI origin plus a one-time verifier handoff;
  the bearer session never enters a URL or ComfyUI server logs.
- Every session check and send re-reads guild membership from Discord.
- Optional `ALLOWED_ROLE_IDS` further limits sending to selected roles.
- Bearer sessions are random, hashed before KV lookup and expire automatically.
- KV only stores OAuth handoffs and bearer sessions. Per-share abuse protection
  uses Cloudflare's native Rate Limiting binding, so a successful share does not
  consume a KV write.
- The Worker rate-limits each Discord user and validates the image MIME type.
  It does not impose an application-level image-size limit. The browser offers
  optional upload-copy compression above 20 MiB; choosing the original remains
  valid, while Cloudflare and Discord retain their own platform request limits.
- Authenticated clients receive only target IDs, labels, defaults and the
  non-sensitive `prefer_prompt_file` interaction hint. Webhook URLs never leave
  the Worker.
- Rate-limit responses use HTTP 429, include `Retry-After: 60` and
  `retry_after_seconds: 60`; missing or unavailable relay bindings return a
  distinct HTTP 503 error instead of a generic failure.
- Each selected channel receives one message for image-only, regular or file-mode
  shares. With file mode disabled, an oversized non-empty prompt is split into
  consecutive messages; the author appears on the first Embed and the image plus
  optional caption appear only on the final Embed. When enabled, prompts longer
  than 1,500 characters are attached as a UTF-8 TXT; shorter prompts remain inline.
  Inline mode allows up to ten segments; larger prompts are rejected with an
  explicit recommendation to enable file mode.
