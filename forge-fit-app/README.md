# Forge Fit — iPhone app

An iPhone app that combines **Apple Health** + **WHOOP** data, summarizes it with a
**rule-based (non-AI)** in-app assistant, and provides a separate **"Ask the web"**
tab powered by **Google Gemini** with Google Search grounding (and a permanent
"may contain inaccuracies" disclaimer).

This project is set up so you can build, sign, and ship to the App Store **without
owning a Mac** — everything runs in the cloud via Expo Application Services (EAS).

---

## What you'll need (one-time)

| Item | Where | Cost |
|---|---|---|
| Apple Developer Program account | https://developer.apple.com/programs/ | **$99 / year** (required for App Store) |
| Expo account | https://expo.dev/ | Free; paid plans for higher build volume |
| WHOOP developer app | https://developer.whoop.com/ | Free |
| Google AI Studio API key | https://aistudio.google.com/app/apikey | Free tier |
| Node.js ≥ 20 on your computer | https://nodejs.org/ | Free |
| The iPhone you want to test on | — | You already have one |

You do **not** need: a Mac, Xcode, an Apple Silicon machine, or any local iOS build tools.

---

## First-time setup

```bash
cd forge-fit-app
npm install
cp .env.example .env
# Fill .env with your Gemini key + WHOOP client id/secret.
```

Install the Expo CLI globally if you don't have it:

```bash
npm install -g eas-cli
eas login
```

### Register the iOS bundle id

1. Sign in to https://developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Register an **App ID** with bundle id `com.faithbasedpilot.forgefit` (or change the id in `app.json`).
3. Enable the **HealthKit** capability on that App ID.
4. In https://appstoreconnect.apple.com create a matching app record (you'll fill in the App Store Connect app id in `eas.json`).

### Configure WHOOP

1. Create a developer app at https://developer.whoop.com/.
2. Set the OAuth redirect URI to `forgefit://whoop-callback`.
3. Copy the client id + secret into `.env`.

---

## Build a TestFlight build — from any OS

EAS does the macOS/Xcode work for you on Expo's build farm.

```bash
# First time only: link this folder to an EAS project
eas init

# Build for internal testing (installable on your iPhone via TestFlight)
eas build --platform ios --profile preview
```

You'll be prompted to upload signing credentials. **Pick "Let EAS handle it"** —
EAS will generate the distribution certificate and provisioning profile for you,
all in the cloud. (No Keychain or Xcode required.)

When the build finishes (~15–20 min), EAS gives you a direct download link plus
a button to submit to TestFlight.

---

## Submit to App Store — from any OS

```bash
# Production build with auto-incrementing build number
eas build --platform ios --profile production

# Submit the latest production build to App Store Connect
eas submit --platform ios --latest
```

`eas submit` uploads the `.ipa` to App Store Connect directly from the cloud, no
Transporter / no Mac needed. Once it appears in App Store Connect, fill in
screenshots and the privacy questionnaire **in your browser**, then click
**Submit for Review**.

---

## Day-to-day development

You don't need a Mac for this either. Two options:

### Option A — Real iPhone via Expo Dev Client (recommended)

```bash
eas build --platform ios --profile development
# Install the resulting build on your iPhone via TestFlight or the install link
npx expo start --dev-client
```

Then scan the QR code with your iPhone's camera. The dev client connects to your
laptop and hot-reloads on every save.

### Option B — Linux/Windows-only iteration on non-HealthKit screens

```bash
npx expo start
```

Open in Expo Go on your iPhone. **HealthKit and the WHOOP OAuth flow will not
work in Expo Go** because they require the dev client (option A). The Ask tab
and Dashboard layout work fine in Expo Go.

---

## Project layout

```
forge-fit-app/
├── app/                        Expo Router screens
│   ├── _layout.tsx             Root navigator
│   ├── index.tsx               Dashboard (combined data + rule-based insights)
│   ├── ask.tsx                 Web Q&A (Gemini + Google Search grounding)
│   ├── connect.tsx             WHOOP OAuth
│   └── settings.tsx            About / privacy
├── components/                 Presentational components
├── lib/
│   ├── healthkit.ts            Apple Health reads
│   ├── whoop.ts                WHOOP OAuth + API
│   ├── assistant.ts            Rule-based (no-AI) insight engine
│   ├── gemini.ts               Gemini "Ask the web" client
│   └── storage.ts              Keychain-backed secret storage
├── app.json                    Expo config + HealthKit entitlement + Info.plist strings
├── eas.json                    EAS Build & Submit profiles
└── .env.example                API keys to fill in
```

## Two assistants, two behaviors

| Surface | How it works | Disclaimer? |
|---|---|---|
| **Dashboard insights** | Deterministic rules in `lib/assistant.ts`. No model. | No — the logic is auditable in source. |
| **Ask the web** | Gemini 2.0 Flash + Google Search grounding via `lib/gemini.ts`. | Yes — persistent banner via `components/DisclaimerBanner.tsx`. |

If you want the dashboard to be AI-powered too, swap `generateInsights()` in
`app/index.tsx` for a call to `askWeb()` and ensure the disclaimer banner shows.

---

## Ongoing cost

- Apple Developer Program: **$99/year**
- Gemini API: free tier covers normal personal use; pay-as-you-go beyond that
- WHOOP developer access: free
- EAS Build: free tier ~30 builds/month; ~$19/month if you outgrow it
