# Cohere — be in the crowd, from anywhere

> **New session? Read [STATUS.md](STATUS.md)** — the living handoff doc: current state, API key status, what's next, and gotchas. Deploy steps: [DEPLOY.md](DEPLOY.md).

**Concept (the pivot, 2026-06-16):** Cohere turns a concert into a **shared
synchronized clock**. Everyone locks to the same absolute (UTC) instant, so the
50,000 people in the stadium and you on your couch are on the **same song at the
same second**. Pick the featured live show (Post Malone @ Rogers Stadium, Toronto)
or summon any artist → a synced Live Room with a satellite venue map, a live
now-playing + setlist timeline, crowd **tap-to-sync** drift correction, and a fan
footage wall (fresh YouTube uploads + livestreams + crowd-curated clips).

**How the live timecode works** (no API streams "now playing", so 3 layers):
1. **Predict** — start time + real setlist order (setlist.fm) + a duration model.
2. **Correct** — attendees tap "they just started ___"; the median drift shifts
   the whole timeline for everyone (late starts, banter, long outros).
3. **Confirm** — fresh fan uploads + active livestreams of the actual event.

The original **tour archive** (3D globe, per-song fan footage, lyrics, BYOC AI
scenes) lives on under the **📼 Archive** tab.

<details>
<summary>Original concept — "Archive Filler" (Reverb)</summary>

A map-based wrapper that follows an artist's tour across a 3D globe. Click a venue
→ see that night's setlist (JamBase) matched to lyrics (Musixmatch), with
crowd-sourced fan videos (YouTube) synced per song. For songs nobody filmed,
**Bring-Your-Own-Compute**: users paste their own AI keys to synthesize the
missing performance.
</details>

Hackathon runs **June 15–21, 2026**. Partners: Musixmatch, LALAL.AI, ElevenLabs,
Songstats, Cyanite, JamBase, N8N, Replit.

## This repo so far

Three top-level tabs: **🔴 Live** (the home — Cohere), **🧭 Discover** (browse &
search every concert), and **📼 Archive** (the original Reverb).

### 🔴 Live (Cohere)
- **Landing** — a featured **live** show (Post Malone @ Rogers Stadium, Toronto)
  and a featured **replay** (Madison Beer's real past Vancouver show), plus a box
  to summon any artist as a live or replay room from their real setlist.
- **Live Room** — one shared synchronized clock drives everything:
  - **Venue map** (Google Maps satellite, geocoded by name, pulsing LIVE dot,
    Street View) + live presence count (**Supabase Realtime**).
  - **Now-playing** — pre-show countdown that distinguishes **opener vs
    headliner** (e.g. Jelly Roll → Post Malone), live progress bar, between-songs.
  - **Synced setlist** — each song shows venue-local **and** your-local time
    (toggle); auto-scrolls to "now".
  - **Tap-to-sync** — people at the show tap when a song starts; the median drift
    corrects the clock for everyone (the coordination core).
  - **Room mood** (Cyanite) — real per-song mood/energy/BPM for the current song,
    tinting the room. Cyanite ingests the song's YouTube source, so it reaches the
    actual setlist track (disk-cached so credits aren't re-spent).
  - **Venue weather** (Open-Meteo, keyless) — current conditions for a live show,
    or that night's archive for a replay (great for the open-air Rogers Stadium).
  - **Crowd-sourced live feed** — YouTube + **TikTok + Instagram + X** footage of
    the actual event (via the free YouTube API + RapidAPI), embedded inline with
    source badges, platform filter, sort, and per-song mapping. (X renders as a
    text card — X blocks third-party tweet iframes.)
  - **Persistent bottom player** — click any song to play its YouTube top result
    (Live/Music toggle); keeps playing across tabs.
  - **🎬 Demo time-warp** — jump the shared clock into the show at any real time.

### 🧭 Discover

Browse **every concert, past + upcoming, with no search needed**. Opens on what's
on this week, sorted **biggest-first** by venue capacity ("the biggest concert
tonight"), pulled live from JamBase. Three lenses over one list — **List / Map /
Calendar** — with sort by date, attendance (capacity), popularity, songs, artist,
venue, or city. Type an artist to switch to *their* past (setlist.fm) + upcoming
(JamBase) shows; each show can **Relive** (Archive) or **Sync in the Live room**.
A Spotify popularity/followers chip shows for a searched artist (once
`SPOTIFY_CLIENT_SECRET` is set).

### 📼 Archive (Reverb)

- **🌍 Tour Globe** — search an artist, see their tour plotted on a 3D globe
  (`react-globe.gl`). Points scale/color by venue capacity; arcs trace the
  chronological route. Sortable stop list (date, capacity/biggest, venue A–Z,
  city A–Z) with per-stop setlist. Runs on mock JamBase data until a valid key.
- **🎤 Show** — relive one concert: per setlist song, real multi-angle fan
  footage (YouTube) + real lyrics (Musixmatch). Songs nobody filmed get an
  **✨ AI scene** — synthesized from the lyrics/mood. Real images work out of the
  box via free FLUX (Pollinations); pick the image model and optionally enrich the
  prompt with a free LLM in the ✨ vault.
- **🎵 Library** — a unified **6-account Suno library** (the gateway merges all
  accounts' feeds live), with per-account filter chips, an inline audio player, a
  **BYOC pool** status strip, and a **✨ Synthesize** tool (prompt → AI images via the
  pool). Read-only + image gen only — see STATUS.md for what's stubbed (Meta gen,
  video, Suno music generation all NOT built).
- **🎛️ API Control Room** (Dev tab) — a central **gateway** proxies every partner
  and AI API (keys stay server-side); a **monitor panel** shows live status, usage,
  and a per-service mock⇄live toggle. Mock-first: the UI never blocks on missing keys.

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
| **YouTube** | 🟢 live | API enabled. **Quota: 10k units/day, search = 100 → ~100 searches/day.** When exhausted it 403s; the Show page now shows an amber "quota reached" notice instead of a silent empty player. Cache hard before a live demo. Plain API key — no OAuth redirect URI needed. |
| **JamBase** | 🟢 live | Base `https://api.data.jambase.com/v3`, **Bearer token auth** (not `?apikey=`). Route resolves artist name → exact id → events so searches skip tribute acts. Trial data is jam-band-heavy (Dave Matthews Band, Phish tour live; pop acts may show 0 shows). |
| **Pinterest** | 🟢 live (keyless) | Style-seed extraction via public Open Graph tags (no API key/OAuth — the official API can't do open search anyway). Paste a Pin/board/image URL in the ✨ BYOC vault → its image seeds Gemini image-to-image. |
| **Gemini (BYOC)** | 🟠 key valid, API disabled | Enable "Generative Language API" for GCP project `356818595469`. No longer a blocker — scene synthesis falls back to free FLUX (below). Gemini wins the cascade once enabled+toggled, or when a viewer pastes a working Gemini key in the ✨ vault. |
| **Pollinations** | 🟢 live (keyless) | Free FLUX **image gen**, no key. The live fallback for "✨ AI scene" — real images with zero setup. |
| **HuggingFace (FLUX)** | 🟠 no key | FLUX.1-schnell image gen via HF Inference. Optional quality upgrade — set `HF_TOKEN` in `.env` (free ~$0.10/mo credit). |
| **Cerebras** / **Groq** | 🟢 live (free tier) | OpenAI-compatible **text gen** (lore, prompt enrichment). Keys from `L:\Projects\ai-free`. Powers the "Enrich + synthesize" button. |
| **Cyanite** | 🟢 live | GraphQL mood/energy/BPM. `youTubeTrackEnqueue` → poll → `audioAnalysisV6`; results disk-cached (`.cyanite-cache.json`). Drives the Live-room **Room mood**. (Spotify-catalog analysis is `NotAuthorized` on this tier — YouTube enqueue is the path.) |
| **LALAL.AI** | 🟢 live | Stem separation. `Authorization: license <key>`; upload → split → poll. **Scoped to Suno tracks** (rights-clear audio) → Library **🎤 Karaoke**. Disk-cached (`.lalalai-cache.json`); ~287 processing min on the key. |
| **Open-Meteo** | 🟢 live (keyless) | Venue weather — current (live shows) + archive (replays). No key, no cost. |
| **Spotify** | 🟠 id set, **needs secret** | Client-Credentials (id + **secret**). Paste `SPOTIFY_CLIENT_SECRET` in `.env` for real popularity/followers/art (Discover chip). Audio-features are deprecated for new apps — Cyanite covers mood, so Spotify is popularity + art only. |
| ElevenLabs | ⚪ no key | Mock-only until a key is added to `.env` (planned: AI hype-host TTS) |

> JamBase note: artist *search* is jam-band-heavy on the trial, but **browse
> (no artist) returns everything** incl. stadium pop acts — that's what powers Discover.

> Notes: the key first given as "Musixmatch" was actually the **Songstats** key (that mislabel caused the early 401s). And JamBase Data uses a different host + Bearer auth than the legacy `jambase.com/jb-api` endpoint — that's why the trial key looked "invalid" at first.

Add a key to `api-gateway/.env`, restart, and the "Go live" toggle unlocks for
that service. Services with no key are locked to mock data.

> Keys were shared in chat during setup — rotate them after the hackathon.
