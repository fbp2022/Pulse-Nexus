# Pulse Nexus

> Built by **Faith Based Innovations**

An iPhone app that combines **Apple Health**, **WHOOP**, **Fitbit** (including
the new Google-era Fitbits and Pixel Watch), and **Garmin** data into one view,
summarizes it with a **rule-based (non-AI)** dashboard, lists every workout from
every source in one place, and offers a **Coach chat** tab — a multi-turn
conversation backed by **Google Gemini** with Google Search grounding, fed the
user's live metrics so it can answer questions like "why is my recovery low?"
in context. The Coach tab carries a permanent "may contain inaccuracies"
disclaimer.

This project is set up so you can build, sign, and ship to the App Store
**without owning a Mac** — everything runs in the cloud via Expo Application
Services (EAS).

---

## What you'll need (one-time)

| Item | Where | Cost | Approval |
|---|---|---|---|
| Apple Developer Program (organization or individual) | https://developer.apple.com/programs/ | **$99/year** | Instant |
| Expo account | https://expo.dev/ | Free tier | Instant |
| Google AI Studio key | https://aistudio.google.com/app/apikey | Free tier | Instant |
| WHOOP developer app | https://developer.whoop.com/ | Free | Self-serve |
| Fitbit developer app | https://dev.fitbit.com/apps/new | Free | Self-serve |
| Garmin Health API | https://developerportal.garmin.com/ | Free | **Partner review required** |
| Node.js ≥ 20 on your computer | https://nodejs.org/ | Free | — |
| Your iPhone | — | — | — |

You do **not** need: a Mac, Xcode, an Apple Silicon machine, or any local iOS
build tools. Everything below works from Windows, Linux, ChromeOS, or an iPad.

> Tip — when you enroll in the Apple Developer Program, enroll as the
> organization **Faith Based Innovations** if you have (or are setting up) a
> D-U-N-S number for it. That makes the App Store listing's "Seller" line read
> "Faith Based Innovations" rather than your personal name.

### About the Garmin gate

Garmin's Health API is not self-serve. The app code is fully written, but the
**Connect Garmin** button will return an "approval required" error until you:

1. Apply at https://developerportal.garmin.com/ (be specific about the app and
   that it's read-only consumer health). Indie / personal apps frequently get
   approved, but it's a real review and Garmin can decline.
2. Once approved, paste the Consumer Key/Secret into `.env` as
   `EXPO_PUBLIC_GARMIN_CLIENT_ID` and `EXPO_PUBLIC_GARMIN_CLIENT_SECRET`.

Everything else works without paperwork.

---

## First-time setup

```bash
cd pulse-nexus-app
npm install
cp .env.example .env
# Fill .env with your Gemini key + WHOOP / Fitbit / Garmin credentials.
# Leave Garmin lines blank if not yet approved — the app handles that.
```

```bash
npm install -g eas-cli
eas login
```

### Register the iOS bundle id

1. Sign in to https://developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Register an App ID with bundle id `com.faithbasedinnovations.pulsenexus` (or change it in `app.json`).
3. Enable the **HealthKit** capability on that App ID.
4. In https://appstoreconnect.apple.com create a matching app record (fill the App Store Connect app id into `eas.json`).

### Register OAuth redirect URIs

When you register each provider's developer app, set the redirect URI to the
matching scheme below. They all use the `pulsenexus://` scheme.

| Provider | Redirect URI |
|---|---|
| WHOOP | `pulsenexus://whoop-callback` |
| Fitbit | `pulsenexus://fitbit-callback` |
| Garmin | `pulsenexus://garmin-callback` |

---

## Build a TestFlight build — from any OS

EAS does the macOS/Xcode work for you on Expo's build farm.

```bash
eas init                                          # first time only
eas build --platform ios --profile preview
```

When prompted for signing credentials, pick **"Let EAS handle it"** — EAS will
generate the distribution certificate and provisioning profile for you in the
cloud. No Keychain or Xcode required.

After ~15–20 min, EAS gives you a download link plus a one-click "Submit to
TestFlight" button.

---

## Submit to App Store — from any OS

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

`eas submit` uploads the `.ipa` to App Store Connect from the cloud — no
Transporter, no Mac. Fill in screenshots and the privacy questionnaire **in your
browser**, then click **Submit for Review**.

---

## Day-to-day development

Two options for iterating without a Mac:

### Option A — Real iPhone via Expo Dev Client (recommended)

```bash
eas build --platform ios --profile development
# Install the resulting build on your iPhone via TestFlight or the install link
npx expo start --dev-client
```

Scan the QR code with your iPhone's camera. The dev client connects to your
laptop and hot-reloads on every save. **HealthKit, WHOOP, Fitbit, and Garmin
OAuth all work in this mode.**

### Option B — Expo Go (UI iteration only)

```bash
npx expo start
```

Open in Expo Go on your iPhone. HealthKit and the OAuth flows will **not** work
in Expo Go — they require a custom dev client (option A). The Ask tab and the
visual layout of the dashboard render fine.

---

## Project layout

```
pulse-nexus-app/
├── app/                        Expo Router screens
│   ├── _layout.tsx             Root navigator
│   ├── index.tsx               Dashboard (unified data + rule-based insights)
│   ├── chat.tsx                Coach chat (Gemini + Google Search grounding, data-aware)
│   ├── workouts.tsx            Unified workout history across all four sources
│   ├── connect.tsx             WHOOP / Fitbit / Garmin OAuth
│   └── settings.tsx            About / privacy / sources
├── components/
│   ├── DisclaimerBanner.tsx
│   ├── InsightCard.tsx
│   ├── MetricCard.tsx
│   └── WorkoutCard.tsx
├── lib/
│   ├── healthkit.ts            Apple Health reads (HealthKit)
│   ├── whoop.ts                WHOOP OAuth + API
│   ├── fitbit.ts               Fitbit Web API OAuth + reads
│   ├── garmin.ts               Garmin Health API OAuth + reads
│   ├── workouts.ts             Cross-source workout fetcher + unified Workout type
│   ├── assistant.ts            Rule-based (no-AI) insight engine + cross-source unifier
│   ├── gemini.ts               Gemini client: askWeb() + chatTurn() with health context
│   └── storage.ts              Keychain-backed secret storage
├── app.json                    Expo config + HealthKit entitlement + Info.plist strings
├── eas.json                    EAS Build & Submit profiles
└── .env.example                API keys to fill in
```

## Cross-source unification

The dashboard doesn't favor one device blindly. For each metric, `lib/assistant.ts`
picks a primary source by priority and reports a separate insight when two
devices disagree by more than a threshold.

| Metric | Priority order |
|---|---|
| Recovery | WHOOP → (else fall back to Garmin Body Battery) |
| Resting HR | WHOOP → Garmin → Fitbit → Apple Health |
| HRV | WHOOP → Garmin → Fitbit → Apple Health |
| Sleep hours | WHOOP → Garmin → Fitbit → Apple Health |
| Steps | Garmin → Fitbit → Apple Health |
| Active kcal | Garmin → Fitbit → Apple Health |
| SpO₂ | Fitbit → Apple Health |
| Strain (0–21) | WHOOP only |
| Body Battery | Garmin only |
| Stress | Garmin only |

Disagreement thresholds are visible in source (`disagreement()` in `lib/assistant.ts`).

## The four tabs

| Tab | What it does | Engine | Disclaimer? |
|---|---|---|---|
| **Dashboard** | Unified metric cards + plain-English insights | Deterministic rules in `lib/assistant.ts` (no model) | No — logic is auditable |
| **Coach (chat)** | Multi-turn chat that knows your current data and can search the web | Gemini 2.0 Flash + Google Search grounding, with a deterministic health-context system prompt built by `summarizeContext()` | Yes — persistent banner |
| **Workouts** | Newest-first list of workouts merged from Apple Health, WHOOP, Fitbit, Garmin; filter by source and time window | `lib/workouts.ts` (no model) | No |
| **Connect** | Sign in / out of WHOOP, Fitbit, Garmin | OAuth 2.0 + PKCE | No |

### How the Coach chat is grounded

Each turn sent to Gemini includes:

1. A system instruction framing the model as the Pulse Nexus coach and
   forbidding medical advice.
2. A compact, deterministic plain-text summary of the user's current
   metrics, produced by `summarizeContext()` in `lib/gemini.ts`. This is
   *not* an LLM summary — the strings come from the same rules as the
   Dashboard.
3. The prior conversation as alternating user/model turns.
4. The Google Search grounding tool, so the model can cite live web
   results.

---

## Ongoing cost

- Apple Developer Program: **$99/year**
- Gemini API: free tier covers normal personal use
- WHOOP, Fitbit, Garmin developer access: free
- EAS Build: free tier ~30 builds/month; ~$19/month if you outgrow it

---

© Faith Based Innovations. All rights reserved.
