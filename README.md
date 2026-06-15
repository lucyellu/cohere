# Musicathon 2026 — Concert Tour Archive (BYOC)

**Concept ("Archive Filler"):** a map-based wrapper that follows an artist's tour
across a 3D globe. Click a venue → see that night's setlist (JamBase) matched to
lyrics (Musixmatch), with crowd-sourced fan videos (YouTube) synced per song. For
songs nobody filmed, **Bring-Your-Own-Compute**: users paste their own AI keys to
synthesize the missing performance.

Hackathon runs **June 15–21, 2026**. Partners: Musixmatch, LALAL.AI, ElevenLabs,
Songstats, Cyanite, JamBase, N8N, Replit.

## This repo so far: the API Control Room

A central **gateway** proxies every partner API (keys stay server-side) and a
**monitor panel** shows live status, usage, and a per-service mock⇄live toggle.
Mock-first: the UI never blocks on missing keys or quota.

```
musicathon/
├── api-gateway/        Express proxy (port 5001) — keys, mocks, usage, routing
│   ├── .env            ← real keys (gitignored)
│   └── src/
│       ├── services.js   service registry + mock/live logic
│       ├── routes.js     /health, /config/mock, per-service proxy routes
│       ├── proxy.js      live fetch + mock loader (records usage)
│       ├── usage.js      in-memory stats
│       └── mocks/*.json  realistic payloads per service
└── web/                Vite + React + Tailwind monitor (port 5173)
    └── src/components/   ServiceCard, App (API Control Room)
```

## Run

```bash
npm run install:all   # first time only
npm run dev           # gateway :5001 + web :5173 together
```

Open `http://localhost:5173`. The Vite dev server is exposed on the LAN
(`host: true`), so to test on the iPhones/iPad, open `http://<your-LAN-IP>:5173`.

## API key status (as of setup)

| Service | Status | Action needed |
|---|---|---|
| **Musixmatch** | 🔴 `401` on all endpoints | Key not authorized — check Musicathon Discord/docs for the Pro base URL or activate the key |
| **JamBase** | 🔴 `api_key_invalid` | Trial key rejected — re-grab from the JamBase Data dashboard |
| **YouTube** | 🟠 key valid, API disabled | Enable "YouTube Data API v3" for GCP project `356818595469`, then toggle live in the panel. **Quota: 10k units/day, search = 100 → ~100 searches/day. Cache hard.** |
| Songstats / Cyanite / LALAL.AI / ElevenLabs | ⚪ no key | Mock-only until keys added to `.env` |

Add a key to `api-gateway/.env`, restart, and the "Go live" toggle unlocks for
that service. Services with no key are locked to mock data.

> Keys were shared in chat during setup — rotate them after the hackathon.
