# Musicathon 2026 — Concert Tour Archive (BYOC)

**Concept ("Archive Filler"):** a map-based wrapper that follows an artist's tour
across a 3D globe. Click a venue → see that night's setlist (JamBase) matched to
lyrics (Musixmatch), with crowd-sourced fan videos (YouTube) synced per song. For
songs nobody filmed, **Bring-Your-Own-Compute**: users paste their own AI keys to
synthesize the missing performance.

Hackathon runs **June 15–21, 2026**. Partners: Musixmatch, LALAL.AI, ElevenLabs,
Songstats, Cyanite, JamBase, N8N, Replit.

## This repo so far

Two tabs in the web app:

- **🌍 Tour Globe** — search an artist, see their tour plotted on a 3D globe
  (`react-globe.gl`). Points scale/color by venue capacity; arcs trace the
  chronological route. Sortable stop list (date, capacity/biggest, venue A–Z,
  city A–Z) with per-stop setlist. Runs on mock JamBase data until a valid key.
- **🎛️ API Control Room** — a central **gateway** proxies every partner API
  (keys stay server-side); a **monitor panel** shows live status, usage, and a
  per-service mock⇄live toggle. Mock-first: the UI never blocks on missing keys.

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
| **Musixmatch** | 🟢 live (Pro key, returns 200) | none — apikey query param; the Pro "password" is portal login only |
| **Songstats** | 🟢 live (returns 200) | none — auth via `apikey` header |
| **YouTube** | 🟢 live | API enabled. **Quota: 10k units/day, search = 100 → ~100 searches/day. Cache hard.** Plain API key — no OAuth redirect URI needed. |
| **JamBase** | 🟢 live | Base `https://api.data.jambase.com/v3`, **Bearer token auth** (not `?apikey=`). Route resolves artist name → exact id → events so searches skip tribute acts. Trial data is jam-band-heavy (Dave Matthews Band, Phish tour live; pop acts may show 0 shows). |
| Cyanite / LALAL.AI / ElevenLabs | ⚪ no key | Mock-only until keys added to `.env` |

> Notes: the key first given as "Musixmatch" was actually the **Songstats** key (that mislabel caused the early 401s). And JamBase Data uses a different host + Bearer auth than the legacy `jambase.com/jb-api` endpoint — that's why the trial key looked "invalid" at first.

Add a key to `api-gateway/.env`, restart, and the "Go live" toggle unlocks for
that service. Services with no key are locked to mock data.

> Keys were shared in chat during setup — rotate them after the hackathon.
