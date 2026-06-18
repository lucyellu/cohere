# Deploying Cohear (so judges can open a URL)

Cohear is two pieces:

1. **web/** — the Vite SPA (Live room, map, fan wall). Static → **Netlify**.
2. **api-gateway/** — Express server holding the **secret partner keys**
   (setlist.fm, YouTube, Musixmatch…). Must run somewhere with those keys in
   its environment. It can **never** be a static file, so it needs a host that
   runs Node.

## 1. Host the gateway (pick one free option)

[Render](https://render.com) / [Railway](https://railway.app) / [Fly.io](https://fly.io):

- **Root / start:** `node api-gateway/server.js` (or root dir `api-gateway`, start `npm start`).
- **Env vars:** copy every key from `api-gateway/.env`
  (`SETLISTFM_API_KEY`, `YOUTUBE_API_KEY`, `MUSIXMATCH_API_KEY`, `JAMBASE_API_KEY`,
  `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `USE_MOCK_DATA=false`,
  `PORT` -> the host sets this).
- Note the public URL, e.g. `https://cohear-gateway.onrender.com`.

> Quick demo alternative: run the gateway locally and expose it with a tunnel
> (`npx localtunnel --port 5001` or `cloudflared tunnel --url http://localhost:5001`).
> Use the tunnel URL as the gateway host below.

## 2. Point Netlify at the gateway

In **`netlify.toml`**, replace `REPLACE-WITH-YOUR-GATEWAY-HOST` in the `/api/*`
redirect with your gateway host (no trailing slash, keep `/api/:splat`).

## 3. Netlify env vars (Site settings → Environment variables)

| Var | Value |
|---|---|
| `VITE_GOOGLE_MAPS_KEY` | the Google key (Maps JS + Street View enabled) |
| `VITE_SUPABASE_URL` | *(optional)* Supabase project URL for live presence |
| `VITE_SUPABASE_ANON_KEY` | *(optional)* Supabase anon/publishable key |

> Vite inlines `VITE_`-prefixed vars **at build time**, so set them before the
> Netlify build, then trigger a deploy.

## 4. Lock down the Google key

In the GCP console, restrict the Maps key by **HTTP referrer** to your Netlify
domain (it's exposed in the browser bundle, as all Maps JS keys are).

## 5. (Optional) Live presence via Supabase

Both old Supabase projects are paused >90 days and can't be restored. Create a
**new** project, then set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. No
tables or migrations needed — presence is pure Realtime, keyed by the anonymous
guest id. Without it, the room shows the honest "N syncing the crowd" count from
crowd beacons instead of a live viewer tally.

---

### Local run (always works, no deploy)
Double-click the **Cohear** desktop shortcut, or `npm run dev` from the repo root
→ gateway on :5001, web on :5173 (LAN-exposed for phones/iPad).
