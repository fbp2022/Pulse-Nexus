# Pulse Nexus Connector

> Built by **Faith Based Innovations**

A tiny Cloudflare Worker that exposes your **Pulse Nexus** data
(WHOOP + Fitbit + Garmin) over HTTPS so the **ChatGPT iOS app** —
via a **Custom GPT** — can pull it on demand.

> Apple Health data is **on-device only** and cannot be exposed by this
> connector. ChatGPT will see WHOOP / Fitbit / Garmin data (whichever you've
> configured). If you want Apple Health in the pipeline too, you'd need to
> add a push-from-iPhone step from the Pulse Nexus app to this worker —
> which is a separate, optional feature.

## Architecture

```
ChatGPT (iOS / web)
     │
     │  Custom GPT  ──>  HTTPS calls (OpenAPI Actions, Bearer auth)
     ▼
Pulse Nexus Connector  ──>  WHOOP / Fitbit / Garmin APIs (OAuth refresh)
(Cloudflare Worker)
```

The Worker is **single-tenant** by design: each deployment serves exactly
one user, whose refresh tokens are stored as Wrangler secrets. This keeps
the threat model small (no shared database) and the cost at $0 on
Cloudflare's free tier.

## Endpoints

| Method | Path | What it returns |
|---|---|---|
| `GET` | `/v1/health` | Liveness check, no auth |
| `GET` | `/v1/snapshot` | Unified current metrics (recovery, HRV, RHR, sleep h, strain, steps, kcal, SpO₂, Body Battery, stress) plus per-provider breakdown |
| `GET` | `/v1/sleep` | Last night with full Deep/REM/Light/Awake stage breakdown, efficiency, score, in-bed time |
| `GET` | `/v1/workouts?days=N` | Workouts in the last `N` days (default 14, max 90), merged newest-first |

All endpoints except `/v1/health` require `Authorization: Bearer <API_KEY>`.
The full OpenAPI 3.1 spec is in [`openapi.yaml`](./openapi.yaml).

## Deploy (from any OS, no Mac needed)

You only need a Cloudflare account (free) and Node.js.

```bash
cd pulse-nexus-connector
npm install
npx wrangler login         # opens Cloudflare auth in your browser
```

Set the secrets (`wrangler secret put <NAME>` prompts you for the value):

```bash
npx wrangler secret put API_KEY                     # long random string

npx wrangler secret put WHOOP_CLIENT_ID
npx wrangler secret put WHOOP_CLIENT_SECRET
npx wrangler secret put WHOOP_REFRESH_TOKEN

npx wrangler secret put FITBIT_CLIENT_ID
npx wrangler secret put FITBIT_CLIENT_SECRET
npx wrangler secret put FITBIT_REFRESH_TOKEN

# Optional — only if you have Garmin Health API approval:
npx wrangler secret put GARMIN_CLIENT_ID
npx wrangler secret put GARMIN_CLIENT_SECRET
npx wrangler secret put GARMIN_REFRESH_TOKEN
```

Deploy:

```bash
npm run deploy
```

Wrangler prints a URL like `https://pulse-nexus-connector.<yourname>.workers.dev`.

Smoke test:

```bash
curl https://pulse-nexus-connector.<yourname>.workers.dev/v1/health
# → {"ok":true,"service":"pulse-nexus-connector"}

curl -H "Authorization: Bearer <API_KEY>" \
  https://pulse-nexus-connector.<yourname>.workers.dev/v1/snapshot
```

### Where do I get the refresh tokens?

The simplest way is to log in once inside the Pulse Nexus iOS app to each
provider (which persists tokens in the iOS Keychain), then *temporarily*
print the refresh token in a debug build and paste it into Wrangler. A
cleaner long-term option is to add a one-time "Export connector secrets"
button to Pulse Nexus that copies the refresh tokens to the clipboard —
that's a small UI addition for a future round.

## Create the ChatGPT Custom GPT

(Requires a ChatGPT Plus / Team subscription; free ChatGPT users can call
the same endpoints via Share-Sheet / paste flows from the Pulse Nexus app.)

1. Go to https://chat.openai.com/gpts/editor — **Create a GPT**.
2. **Name:** "My Pulse Nexus". **Description:** "Reads my live WHOOP /
   Fitbit / Garmin data from Pulse Nexus and answers questions about my
   training, recovery, and sleep."
3. **Instructions** (paste):

   ```
   You are my Pulse Nexus coach. When I ask about my recovery, HRV,
   sleep, strain, workouts, or steps, call the Pulse Nexus Connector
   action (getSnapshot, getLastNightSleep, getRecentWorkouts) to pull
   the live numbers, then answer concisely. Cite the source per metric
   (WHOOP / Fitbit / Garmin). Do not give medical advice; if I describe
   symptoms that concern you, suggest I see a clinician.
   ```

4. **Add Action** → **Import from URL**, paste
   `https://pulse-nexus-connector.<yourname>.workers.dev/openapi.yaml` (or
   just paste the raw contents of `openapi.yaml` from this folder — the
   server URL in the spec must match your deployed worker).
5. **Authentication** → **API Key** → **Custom** header name, **Bearer
   format**. Paste the value of `API_KEY` you set with Wrangler.
6. **Privacy policy URL** — set this before publishing publicly; for
   personal use you can keep the GPT private.
7. **Save** → **Only me** (or share with whoever).

Open the new GPT in the ChatGPT iOS app. Ask: *"What does my sleep look
like last night?"* — it should call `getLastNightSleep` and answer with
your actual WHOOP / Fitbit / Garmin numbers.

## Cost

- Cloudflare Workers: **free** up to 100k requests/day.
- ChatGPT Plus (for Custom GPTs): **$20/month** (only if you want the
  ChatGPT app to do the pulling — share-sheet path doesn't need this).
- Domain on top of `*.workers.dev`: optional.

## Roadmap

- Push-from-iPhone endpoint so Apple Health metrics are available too.
- KV-backed multi-tenant mode (replace static secrets with a per-user
  table; add OAuth so other people can install their own GPT).
- Rate limiting + per-call audit log.
- A matching Claude tool definition + xAI Grok tool definition (the
  OpenAPI spec is provider-agnostic; only the install flow differs).
