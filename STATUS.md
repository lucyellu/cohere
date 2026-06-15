# Reverb — Status & Handoff

> Living doc for cross-session continuity. Update it as things change.
> Last updated: 2026-06-15 (afternoon). Hackathon: **Musicathon 2026, June 15–21**.

## What Reverb is

A concert-tour archive. Browse an artist's tour on a **3D globe** → enter a **show** →
per setlist song, watch **real crowd-sourced fan footage** (multi-angle, from YouTube)
with **real lyrics** (Musixmatch). Songs nobody filmed get **BYOC** ("bring your own
compute"): synthesize the missing performance as an AI image from the song's lyrics/mood,
optionally **style-seeded from a Pinterest** mood board. The pitch: the crowd's memories +
AI compute reconstruct a complete show; "the more compute the crowd brings, the richer
the archive."

Concept lineage: "Archive Filler" — chosen over a crowd-phone light show and a literal 3D
walkaround concert (avoided the "metaverse trap": shared *data* experience, not a game world).

## How to run / test

- **Desktop shortcut "Musicathon"** → runs `npm run dev` (always current code) and opens the app.
  If a server is already running it just opens the browser. First time on a fresh clone needs
  `npm run install:all`.
- Manual: `npm run dev` from repo root → gateway on **:5001**, web on **:5173**.
- Test on phones/iPad: the Vite server is LAN-exposed → `http://<your-LAN-IP>:5173`.
- App tabs: **🌍 Globe** / **🎤 Show** / **🎛️ Dev** (the API Control Room). Top-right **✨** = BYOC vault.

## Architecture

```
musicathon/
├── api-gateway/  Express proxy (:5001) — all partner keys server-side, never in the browser
│   ├── .env            real keys (GITIGNORED — never commit)
│   └── src/
│       ├── services.js   service registry; mock/live logic (preferMock, keyless)
│       ├── routes.js     /health, /config/mock, per-service routes, /gemini/generate, /pinterest/extract
│       ├── proxy.js      callLive (records usage) + serveMock
│       ├── usage.js      in-memory per-service stats
│       └── mocks/*.json  realistic payloads per service
└── web/          Vite + React + Tailwind v4 (:5173); Vite proxies /api -> :5001
    └── src/
        ├── App.jsx              shell + tabs + BYOC modal state
        ├── api.js               gateway client
        ├── tour.js              JamBase normalize + sort helpers
        └── components/
            ├── TourGlobe.jsx    react-globe.gl: capacity-scaled points + route arcs
            ├── TourView.jsx     globe + sortable stop list + setlist + "Enter show"
            ├── ShowView.jsx     the Show: fan-video player + lyrics + AI scene
            ├── BYOCModal.jsx    Gemini key + Pinterest style-seed (localStorage)
            ├── ControlRoom.jsx  API monitor panel (Dev tab)
            └── ServiceCard.jsx
```

### Mock-vs-live model
Every partner call routes through the gateway, which serves a **mock** or makes a **live** call
per service. Effective mode: no key → forced mock; else a runtime toggle (Dev panel) wins; else
`preferMock` on the service; else global `USE_MOCK_DATA` (currently `false` = live-by-default).
`keyless: true` services (Pinterest) need no key but still run live. Usage is tracked + shown in the Dev tab.

## Partner API status

| Service | Status | Notes |
|---|---|---|
| **Musixmatch Pro** | 🟢 live | apikey query param. The "password" is portal login only. `track.search`, `matcher.lyrics.get`. |
| **Songstats** | 🟢 live | auth via `apikey` **header**. |
| **YouTube** | 🟢 live | plain API key (no OAuth redirect needed). **Quota ~100 searches/day** — results cached client-side. |
| **JamBase** | 🟢 live | Base `api.data.jambase.com/v3`, **Bearer** auth. Route resolves artist name→exact id→events (skips tribute acts). **The globe searches live by default** (`?source=live`); the **"Demo tour" button** loads the curated Coldplay mock (`?source=mock`, has setlists). Live shows have no setlist → Show page falls back to the artist's top tracks. Lots of real artists work (Madison Beer, Olivia Rodrigo, Dave Matthews Band, Phish…); some pop acts return 0. |
| **Pinterest** | 🟢 live (keyless) | Style-seed via public Open Graph tags. No API/OAuth/scraper. |
| **Gemini (BYOC)** | 🟠 **needs enabling** | Key valid but **"Generative Language API" is disabled** on GCP project `356818595469`. Until enabled, synth returns a placeholder (or the Pinterest seed image). |
| Cyanite / LALAL.AI / ElevenLabs | ⚪ no key | mock-only; not yet integrated. |

### Open action items (user-side)
- **Enable Gemini:** [Generative Language API for project 356818595469](https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=356818595469), then Dev tab → toggle Gemini live. (Or paste any working Gemini key in the ✨ vault — goes live immediately.)
- Keys live in `api-gateway/.env`. **Rotate them after the hackathon** (they passed through chat).

## Features built so far
- API gateway + monitor (mock/live toggle, usage, health) — the "Dev" tab.
- Tour Globe: react-globe.gl, capacity-scaled venue points, chronological route arcs, click-to-focus, artist search, sortable stops (date / capacity / venue / city), per-stop setlist.
- Show page: per-song multi-angle YouTube fan footage + Musixmatch lyrics; "✨ AI scene" available on every song.
- BYOC: gateway-proxied Gemini image synthesis; key vault in localStorage; Standard vs Crowd-Powered badge.
- Pinterest style-seed: extract image+description from a public URL → image-to-image seed for Gemini; shows the seed image as the scene until Gemini is live.

## Gotchas / lessons (don't relearn these)
- **Windows stale node processes:** background `node`/`vite` from tests linger and cause `EADDRINUSE`, so a "new" server silently fails and an OLD one (old code/keys) answers — symptoms look like wrong data. Before starting a test server, kill listeners:
  `powershell -Command "Get-NetTCPConnection -LocalPort 5001,5173 -State Listen -EA SilentlyContinue | Select -Expand OwningProcess -Unique | %{ Stop-Process -Id $_ -Force -EA SilentlyContinue }"`
  (The real `npm run dev` is fine — this only bit manual test servers.)
- **Google APIs are per-API enablement**, not per-key — YouTube and Gemini each needed enabling on the same project. An API key never needs an OAuth redirect URI.
- **JamBase has two products:** legacy `jambase.com/jb-api` (query key) vs **JamBase Data** `api.data.jambase.com/v3` (Bearer). The `jbd_` key is the latter.
- **JamBase live has no setlists** — the globe uses a per-request `?source=` param (live search vs curated mock demo), and the Show page falls back to Musixmatch top tracks when a live show has no setlist. Real setlists would need setlist.fm (not yet integrated).
- **Mock mode ignores query params** — early confusion: searching any artist returned the same canned Coldplay fixture because JamBase was in mock mode. Mock serves a fixed file; only live respects the artist.
- **gemini route:** avoid duplicate `const` names (hit a "parts already declared" crash once).
- The `node --watch` gateway auto-restarts on save; a syntax error keeps it down until fixed.

## Next steps / backlog
- Enable Gemini → verify real image-to-image with a Pinterest seed.
- Wire **Cyanite** mood/energy tags into the synth prompt (needs a Cyanite key; GraphQL + audio/Spotify id).
- "More compute = more fidelity" framing: multiple frames / higher res when a BYOC key is present (and pitch the collective-compute vision; true cross-viewer pooling = realtime backend, a stretch).
- Polish: loading/empty states, mobile layout pass on the Show page, a demo "tour of the night" autoplay.
- Stretch from the brainstorm: ElevenLabs "lore pack" narration; AI cover/guest-vocal synthesis (legal/ethical caveats).

## Links
- Repo: https://github.com/lucyellu/musicathon
- Cross-session memory also lives in Claude's project memory (`musicathon-project`).
