# Cohere (formerly Reverb) — Status & Handoff

> Living doc for cross-session continuity. Update it as things change.
> Last updated: 2026-06-16. Hackathon: **Musicathon 2026, June 15–21**.
> ("Cohere" is the product as of the 2026-06-16 pivot; the repo/folder is still
> "musicathon". Desktop shortcut renamed **Reverb → Cohere**. We kept "Cohear"
> (co + *hear*) as a possible later rename.)

## 🔴 Cohere — live sync pivot (added 2026-06-16)

**The pivot:** from an *asynchronous* tour archive ("relive a past show") to a
*synchronous* "**be in the crowd, from anywhere**" experience — one shared UTC
clock per show so everyone is on the same song at the same second. Coordination
is the product. **Live is now the home tab; the old globe/show/library moved
under 📼 Archive.**

**What's built & verified (free, working):**
- **Live engine** (`api-gateway/src/live.js`, `/api/live/*`): predicted UTC
  timeline from setlist.fm song order + a duration model (≈3:55/song + 35s gaps);
  Intl-based venue timezone (no API); featured **Post Malone @ Rogers Stadium,
  Toronto** (real recent setlist via setlist.fm, baked fallback); resolve **any
  artist** as a live or **replay** room; **crowd beacons** → median drift
  correction (clamped to ±3h vs trolls); crowd **clip wall** + votes; clock-sync
  endpoint. Verified end-to-end via curl (beacon shifts the clock, Coldplay
  replay pulled a real setlist, fresh YouTube returned 3 uploads + 1 livestream).
- **Live Room UI** (`web/src/live/`): Google Maps **satellite venue view +
  pulsing LIVE dot + Street View peek** (`VenueMap`, key in gitignored `web/.env`);
  **NowPlaying** (pre-show countdown / live progress bar / between-songs); synced
  **SetlistTimeline** (auto-scrolls to "now"); **tap-to-sync** beacon for
  attendees; **FanWall** (Fresh / Live / Crowd wall / Social deep-links);
  **Lyrics** (Musixmatch) for the current song; dual venue+you clocks; a **🎬
  Demo time-warp** to jump into the show at any real time. `clock.js` does the
  latency-compensated server-time handshake + `nowPlaying()` math.
- **Anonymous identity** (`liveApi.js`): zero-friction guest id + optional name —
  judges open the URL and are instantly "in the crowd", no signup.

**Supabase Realtime presence — LIVE (2026-06-16).** The two old projects were
paused >90 days and un-restorable, but a **new free ($0/mo) project "cohere"**
(ref `bzbxtnivfzeqgoajsyhc`, ca-central-1) was created and wired into the
gitignored `web/.env` (`VITE_SUPABASE_URL` + publishable `VITE_SUPABASE_ANON_KEY`).
`supabase.js` self-registers a Realtime **presence** channel per room (no tables/
migration needed) → "N here now"; honest beacon fallback remains if env is blank.
**For Netlify, set these two vars in the site env** (they're not committed).

**Added 2026-06-16 (second batch):**
- **Accurate map** — `VenueMap` now **geocodes the venue by name** (`Geocoder`)
  instead of trusting hardcoded coords. (NB: "Rogers Stadium" is the 2025
  open-air venue at **Downsview Park**, ~20km from the CN Tower — that downtown
  domed stadium is **Rogers Centre**. The map was right; the names differ.)
- **Madison Beer @ Vancouver** — a 2nd featured show in **replay** mode (real
  setlist.fm Vancouver setlist) alongside Post Malone live. `/live/featured`
  now returns `{events:[…]}`; landing shows both cards.
- **Dual song times** — each setlist row shows venue-local **and** your-local
  start time, with a Venue/You/Both toggle.
- **Aggregated crowd feed** — `FanWall` is one grid embedding **all four
  platforms** inline with **source badges**: YouTube (free API) + **TikTok /
  Instagram / X via RapidAPI** (`rapid.js`, `/live/social`). TikTok + X are real
  keyword search; Instagram is a handle's recent posts (provider has no hashtag
  search). Plus crowd-pasted clips, platform filter, sort (recent/views/A–Z),
  and **setlist-song mapping**. Key in `.env` as `RAPIDAPI_KEY` (**rotate after
  the hackathon** — passed through chat). Verified: "Post Malone Toronto" returns
  real fans posting from tonight's Rogers Stadium show across all three.
- **Persistent bottom player** — Spotify/YouTube-style fixed bar
  (`player.jsx` context + `BottomPlayer.jsx`) that survives tab changes; clicking
  a song plays its **YouTube top result** with a **Live/Music** toggle (cached in
  localStorage to spare the ~100/day quota).

**How to run / try Cohere:** `npm run dev` from repo root (or the **Cohere**
desktop shortcut) → gateway **:5001**, web **:5173**. Then in the app:
1. **🔴 Live** tab (the home) → two featured cards: **Post Malone** (live tonight,
   Rogers Stadium) + **Madison Beer** (replay of a real past Vancouver show).
2. Open a show → the real show is anchored to 9pm venue-local, so you'll see a
   pre-show countdown. Use **🎬 Demo: jump into the show** to warp the shared
   clock to any song and see the live now-playing / progress / synced timeline.
3. **At the show? → I'm here** → tap to send a crowd beacon (drift correction).
4. **Crowd-sourced live feed** = YouTube + TikTok + IG + X embedded with badges;
   filter by platform, sort, or pick a song to map footage onto it.
5. Click any song → it plays in the **persistent bottom player** (Live/Music).
6. **📼 Archive** tab = the original Reverb (globe / show / library / dev).

**Repo:** `https://github.com/lucyellu/cohere.git` (origin, push to `main`).

**Deploy for judges:** see **[DEPLOY.md](DEPLOY.md)** — web → Netlify
(`netlify.toml` present), gateway → Render/Railway/Fly/tunnel, then point the
`/api/*` redirect at it. **Set in the relevant host's env** (not committed):
`VITE_GOOGLE_MAPS_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (web/Netlify)
and all `api-gateway/.env` keys incl. `RAPIDAPI_KEY` (gateway host). Local run
always works (Cohere desktop shortcut).

**Open follow-ups / ideas (none blocking):**
- **Rotate keys** after the hackathon — `RAPIDAPI_KEY` + the Google/partner keys
  all passed through chat.
- **Instagram** footage is the artist's official-handle posts (the `instagram120`
  provider has no hashtag/keyword search) — swap to a provider with a hashtag
  endpoint if fan-IG matters. TikTok + X are true keyword search.
- Restrict the Google Maps key by HTTP referrer before any public deploy.
- Optionally fetch real per-song durations (Musixmatch track length) + real
  door/stage times to tighten the predicted timeline before crowd correction.
- Mind RapidAPI + YouTube request caps (each feed load = 3 RapidAPI calls + a
  YouTube search; cached per query client-side).

---

## Archive (Reverb) — prior status below

> **Current state in one line:** Globe + Show + BYOC working. NEW: a **🎵 Library** tab
> shows a **unified 6-account Suno library** (gateway aggregates all accounts live), plus a
> **BYOC generation pool** (per-show pooled quota) and a **Synthesize pipeline** — all of which
> currently produce **real images only via Pollinations (free FLUX)**.
>
> **⚠️ What is NOT built (read before assuming):** Meta AI image/video gen does **not** work —
> the pool can *route* to a Meta browser-worker but that worker (the meta.ai extension automation)
> was never built, so nothing Meta actually generates. **Video gen of any kind: not built.**
> **Suno music generation: dropped** — no free clean API exists (only paid third-party REST APIs
> ~$0.02/song); the library/pool/pipeline are READ + image-gen only. See the "Suno / Meta / Video
> honest status" section below.

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

- **Desktop shortcut "Reverb"** → runs `npm run dev` (always current code) and opens the app.
  If a server is already running it just opens the browser. First time on a fresh clone needs
  `npm run install:all`.
- Manual: `npm run dev` from repo root → gateway on **:5001**, web on **:5173**.
- Test on phones/iPad: the Vite server is LAN-exposed → `http://<your-LAN-IP>:5173`.
- App tabs: **🌍 Globe** / **🎤 Show** / **🎵 Library** / **🎛️ Dev** (the API Control Room). Top-right **✨** = BYOC vault.
- The **🎵 Library** tab needs `suno-dl/accounts.json` present (default path
  `C:\Users\lucyl\Desktop\hold\projects\suno-dl\accounts.json`; override via `SUNO_ACCOUNTS_FILE` in `api-gateway/.env`).

## Architecture

```
musicathon/
├── api-gateway/  Express proxy (:5001) — all partner keys server-side, never in the browser
│   ├── .env            real keys (GITIGNORED — never commit)
│   └── src/
│       ├── services.js   service registry; mock/live logic (preferMock, keyless). +suno (keyless)
│       ├── routes.js     /health, /config/mock, /pinterest/extract,
│       │                 image gen: /{gemini,pollinations,huggingface}/generate,
│       │                 text gen: /{cerebras,groq}/generate, + /{svc}/probe
│       │                 SUNO: /suno/accounts, /suno/feed (merged 6-account library)
│       │                 BYOC POOL: /byoc/{join,contribute,pool}, /byoc/worker/{heartbeat,poll,result}
│       │                 PIPELINE: /scene/generate, /pipeline/synthesize
│       ├── suno.js       NEW: loads suno-dl/accounts.json, refreshes per-account JWT from
│       │                 __client cookie (Clerk), fans the feed across all 6 accounts in parallel
│       ├── genpool.js    NEW: in-memory BYOC pool (providers, shows, users, meta relay jobs,
│       │                 daily quota). Pollinations = always-on free floor.
│       ├── pipeline.js   NEW: synthesize() chain — source-audio(STUB) -> suno-seed(STUB) ->
│       │                 visuals(LIVE via /scene/generate) -> assemble(slideshow spec)
│       ├── proxy.js      callLive (JSON, records usage) + serveMock
│       │                 NB: image routes use a binary-safe fetch in routes.js,
│       │                 not callLive (which parses text/JSON).
│       ├── usage.js      in-memory per-service stats
│       └── mocks/*.json  payloads per data service (+suno.json)
└── web/          Vite + React + Tailwind v4 (:5173); Vite proxies /api -> :5001
    └── src/
        ├── App.jsx              shell + tabs (+🎵 Library) + BYOC modal state
        ├── api.js               gateway client (synthesizeScene cascade, generateImage,
        │                        generateText, enrichPrompt; +sunoAccounts, sunoFeed,
        │                        byocPool, synthesizePerformance)
        ├── tour.js              JamBase normalize + sort helpers
        └── components/
            ├── TourGlobe.jsx    react-globe.gl: capacity-scaled points + route arcs
            ├── TourView.jsx     globe + sortable stop list + setlist + "Enter show"
            ├── ShowView.jsx     the Show: fan-video player + lyrics + AI scene
            │                    (Enrich+synthesize button, YouTube quota notice)
            ├── LibraryView.jsx  NEW: 🎵 Library tab — pool strip + ✨ Synthesize tool +
            │                    account filter chips + merged song grid (cover/badge/audio player)
            ├── BYOCModal.jsx    image-model picker + Gemini key + Pinterest seed
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
| **setlist.fm** | 🟢 live | Real setlists via `x-api-key` header, base `api.setlist.fm/rest/1.0`. Show page tries: curated setlist → setlist.fm (exact date, else most recent past show = "what they've been playing") → top tracks. JamBase dates are *upcoming* so exact matches are rare; the recent-setlist path is the useful one (verified: DMB upcoming show → returns their June 13 setlist, 21 songs). |
| **Cerebras** (free) | 🟢 live | Free-tier, **text only** (no image gen). OpenAI-compatible `POST /v1/chat/completions`, Bearer auth. Key + defaults copied from `L:\Projects\ai-free`. Default model `gpt-oss-120b` — a **reasoning** model: it spends tokens thinking before emitting `content`, so the route defaults `max_tokens` to 1024 and falls back to the `reasoning` field if `content` is empty. Route: `POST /cerebras/generate {prompt}`. |
| **Groq** (free) | 🟢 live | Free-tier, **text only** here (the key also has vision/OCR + whisper STT/TTS, not yet wired). OpenAI-compatible, Bearer auth. Default model `llama-3.3-70b-versatile`. Route: `POST /groq/generate {prompt}`. |
| **Pollinations** (free) | 🟢 live (keyless) | Free FLUX **image generation**, no key. `GET image.pollinations.ai/prompt/{prompt}` → image bytes; the gateway returns a base64 data URL. **This is the live fallback for "✨ AI scene"** when Gemini is off, so the Show page now makes *real* images out of the box. Route: `POST /pollinations/generate {prompt}`. Ported from `L:\Projects\myspot`. Also the **free floor** of the BYOC pool. |
| **Suno (6 accounts)** | 🟢 live (keyless) | Reads `suno-dl/accounts.json`, refreshes each account's JWT from its `__client` cookie (Clerk), merges all 6 libraries. `GET /suno/accounts` (auth status), `GET /suno/feed?page=&pages=` (merged, newest-first). **READ-ONLY** — no generation (see honest-status section). Verified: 6/6 authed, 120 clips merged. |
| **Meta AI** | 🔴 **not built** | No official API. Pool *can* route to a Meta browser-worker, but the meta.ai extension automation was never written → **nothing Meta generates**. Image cap is ~25/day/user anyway. |
| **HuggingFace (FLUX)** | 🟠 no key | FLUX.1-schnell **image gen** via HF Inference (`router.huggingface.co/hf-inference/...`, Bearer `HF_TOKEN`). Wired + mockable but **needs a key** (myspot didn't have one either): free ~$0.10/mo credit at huggingface.co/settings/tokens. Route: `POST /huggingface/generate {prompt}`. |
| Cyanite / LALAL.AI / ElevenLabs | ⚪ no key | mock-only; not yet integrated. |

### Open action items (user-side)
- **Enable Gemini:** [Generative Language API for project 356818595469](https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=356818595469), then Dev tab → toggle Gemini live. (Or paste any working Gemini key in the ✨ vault — goes live immediately.)
- Keys live in `api-gateway/.env`. **Rotate them after the hackathon** (they passed through chat).

## Features built so far
- API gateway + monitor (mock/live toggle, usage, health) — the "Dev" tab.
- Tour Globe: react-globe.gl, capacity-scaled venue points, chronological route arcs, click-to-focus, artist search, sortable stops (date / capacity / venue / city), per-stop setlist.
- Show page: per-song multi-angle YouTube fan footage + Musixmatch lyrics; "✨ AI scene" available on every song. Footage search is `artist + song + live` (no venue — upcoming shows have none, and crowd footage of the song from anywhere is the point). On YouTube quota/API failure the UI shows an amber notice instead of a silent "no footage".
- Real setlists via setlist.fm (exact date → most recent past show → top tracks fallback), with honest labeling.
- BYOC: image synthesis with a **model picker** (Auto / Pollinations FLUX / HF FLUX) in the ✨ vault, an **"Enrich + synthesize"** button (a free LLM rewrites the prompt into a richer art-directed one before generation), Gemini key vault in localStorage, and a mode badge (your compute / gateway / FLUX free / FLUX HF / seed / placeholder).
- Pinterest style-seed: extract image+description from a public URL → image-to-image seed for Gemini; shows the seed image as the scene until Gemini is live.
- **🎵 Library tab** (NEW): unified 6-account Suno library (merged feed), account filter chips, song grid with inline audio, a BYOC pool status strip, and a ✨ Synthesize tool (prompt → FLUX images via the pool). Read-only + image gen only.
- **BYOC generation pool** (NEW, backend): per-show pooled quota with Pollinations free floor + Meta relay (worker not built); `/byoc/*` + `/scene/generate`.
- **Synthesize pipeline** (NEW, backend): `/pipeline/synthesize` chains source-audio → suno-seed → visuals → slideshow (only visuals are live).

## Suno / BYOC pool / Synthesize — added 2026-06-15 (late)

This session added three layers to the gateway + a Library tab. **What actually works vs. what's stubbed:**

**✅ Works now (free, tested):**
- **Unified 6-account Suno library** — `/api/suno/feed` merges all 6 accounts live (JWT refreshed from each `__client` cookie in `suno-dl/accounts.json`). Visible in the **🎵 Library** tab: filter chips per account + song grid (cover, badge, inline audio player). Verified 6/6 authed, 120 clips.
- **BYOC generation pool** — `genpool.js`: fans `/byoc/join` a show and `/byoc/contribute` capacity; `/byoc/pool?showId=` reports pooled quota; `/scene/generate` picks the best provider and **always falls back to free Pollinations FLUX**. Tested via curl incl. a simulated Meta worker + quota decrement.
- **Synthesize pipeline** — `/pipeline/synthesize` chains the stages and currently returns **real FLUX images + a slideshow spec**. The ✨ Synthesize tool in the Library tab drives it.

**🔴 NOT built / stubbed (the honest gaps — this is what "I don't see Meta/video" means):**
- **Meta AI image gen** — only a *relay* exists. The browser-extension content script that drives meta.ai (types prompt, scrapes result, posts back) was **never written**. No Meta worker is ever online, so `/scene/generate` always falls to Pollinations. Meta = concept only.
- **Video generation (any kind)** — not built. FLUX/Pollinations are **images only**. "Slideshow" is just a *spec* (image list + timings) — nothing renders it yet (myspot has ffmpeg `render.py` that could). True AI video (Meta Movie Gen / LTX / Kling) was only ever discussed.
- **Suno music generation** — **dropped.** No free clean API (captcha-blocked); only paid third-party REST APIs (~$0.014–0.11/song, sunoapi.org/AIML/Evolink) — that's the only real "custom API" if ever wanted. The library is READ-only.
- **YouTube-audio → Suno-seed** pipeline stage — stubbed (needs yt-dlp + a paid audio-capable Suno API; also copyright/ToS gray).
- **Gemini/HF key pooling** in the BYOC pool — designed, only `meta` type wired in `/byoc/contribute` v1.

**To make Meta real (if revisited):** write the meta.ai worker as a content script in a browser extension (point it at `GET /api/byoc/worker/poll?userId=` → drive meta.ai in the fan's logged-in tab → `POST /api/byoc/worker/result`). Same fragility class as the Suno captcha work — expect live DOM tuning. **To make video real:** wire the slideshow spec into ffmpeg (reuse myspot `render.py`) for v1; true AI video is a separate provider.

## Gotchas / lessons (don't relearn these)
- **Windows stale node processes:** background `node`/`vite` from tests linger and cause `EADDRINUSE`, so a "new" server silently fails and an OLD one (old code/keys) answers — symptoms look like wrong data. Before starting a test server, kill listeners:
  `powershell -Command "Get-NetTCPConnection -LocalPort 5001,5173 -State Listen -EA SilentlyContinue | Select -Expand OwningProcess -Unique | %{ Stop-Process -Id $_ -Force -EA SilentlyContinue }"`
  (The real `npm run dev` is fine — this only bit manual test servers.)
- **Google APIs are per-API enablement**, not per-key — YouTube and Gemini each needed enabling on the same project. An API key never needs an OAuth redirect URI.
- **JamBase has two products:** legacy `jambase.com/jb-api` (query key) vs **JamBase Data** `api.data.jambase.com/v3` (Bearer). The `jbd_` key is the latter.
- **JamBase live has no setlists** — the globe uses a per-request `?source=` param (live search vs curated mock demo), and the Show page falls back to Musixmatch top tracks when a live show has no setlist. Real setlists would need setlist.fm (not yet integrated).
- **Mock mode ignores query params** — early confusion: searching any artist returned the same canned Coldplay fixture because JamBase was in mock mode. Mock serves a fixed file; only live respects the artist.
- **gemini route:** avoid duplicate `const` names (hit a "parts already declared" crash once).
- The `node --watch` gateway auto-restarts on save; a syntax error keeps it down until fixed. It re-reads `.env` on a JS-triggered restart, but **does not watch `.env` itself** — after editing only `.env`, touch a JS file (or restart) to load new keys.
- **Image APIs return raw bytes, not JSON** — Pollinations/HF can't go through `callLive` (it parses text/JSON). `routes.js` has `generateImageLive()` that fetches binary, validates `content-type: image/*`, and returns a base64 data URL (same shape as `/gemini/generate`).
- **Reasoning LLMs (gpt-oss-120b) put output in `message.reasoning`, not `content`, until they finish thinking** — a low `max_tokens` returns empty `content` (finish_reason: length). The text routes default `max_tokens` high and `extractText` falls back to the `reasoning` field.
- **YouTube quota is the real demo ceiling** — ~100 searches/day, one per song click. When exhausted it 403s and footage silently looked "missing"; the Show page now shows an amber notice. Footage search dropped the venue term (upcoming shows have no venue footage; crowd footage of the song from anywhere is the point).
- **Pollinations is keyless** (no env key, `keyless:true`) and is the live fallback for AI scenes when Gemini is off — so real images work with zero setup.

## Next steps / backlog
- **AI scenes already work for free** via Pollinations (keyless FLUX) — enabling Gemini is now a *quality upgrade*, not a blocker. Enable the Generative Language API on GCP project `356818595469` to verify real image-to-image with a Pinterest seed; Gemini wins the cascade when live.
- **YouTube quota cache (recommended before a live demo):** persist search results to localStorage so re-viewing a song doesn't re-spend the ~100/day quota. Or raise the quota in the GCP console.
- Optionally set `HF_TOKEN` in `api-gateway/.env` to light up FLUX.1-schnell (higher quality than Pollinations); free ~$0.10/mo credit.
- Wire the free LLMs (Cerebras/Groq) into an ElevenLabs **"lore pack"** narration, or auto-enrich every synth prompt (the Enrich button does this on demand today).
- Wire **Cyanite** mood/energy tags into the synth prompt (needs a Cyanite key; GraphQL + audio/Spotify id).
- "More compute = more fidelity" framing: multiple frames / higher res when a BYOC key is present (pitch the collective-compute vision; true cross-viewer pooling = realtime backend, a stretch).
- Polish: mobile layout pass on the Show page, a demo "tour of the night" autoplay.

### Suno / pool / video backlog (added 2026-06-15 late — see honest-status section)
- **Render the slideshow** — wire the `/pipeline/synthesize` slideshow spec into ffmpeg (reuse myspot `render.py`) to produce an actual MP4 from FLUX images + audio. Highest-value next step for "video".
- **Meta worker** (optional, fragile) — build the meta.ai content script in a browser extension feeding `/byoc/worker/*`. Same DOM-tuning pain as the Suno captcha work; ~25 img/day/user.
- **Per-song Synthesize in Show tab** — add a "✨ Synthesize performance" button on each unfilmed setlist song that calls `/pipeline/synthesize`.
- **Gemini/HF key pooling** — extend `/byoc/contribute` beyond `meta` so fans can add free API keys (cleaner than Meta).
- **Suno generation** (only if wanted) — integrate a paid third-party Suno REST API (~$0.02/song) for real programmatic gen + the audio-seed pipeline stage. No free clean path exists.

## Links
- Repo: https://github.com/lucyellu/musicathon
- Cross-session memory also lives in Claude's project memory (`musicathon-project`).
