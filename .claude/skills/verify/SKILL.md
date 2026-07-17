---
name: verify
description: Build, launch, and drive the Cohere web app headlessly to verify UI changes at runtime.
---

# Verifying the Cohere web app (web/)

## Build / launch

```bash
cd L:/Projects/musicathon/web
npx vite build                      # compile check
mv .env .env.verify-bak             # IMPORTANT: sidelines Supabase creds → guest mode, no login wall
npx vite --port 5199 --strictPort   # run in background; restore .env when done!
```

With `.env` present, the Passport tab shows a magic-link sign-in wall (Supabase enabled).
Blanking env vars via shell prefix does NOT reliably override `.env` — rename the file instead.

## Driving it

- `npm i --no-save playwright-core`, then launch with `chromium.launch({ channel: 'msedge', headless: true })` — uses system Edge, no browser download. Any later `npm install <pkg>` prunes it (it's not in package.json) — just reinstall.
- To observe cuelume sound effects firing, wrap AudioContext in `addInitScript` and count `createOscillator` AND `createBufferSource` calls — several sounds (toggle, press) are pure filtered noise with zero oscillators. Launch with `--autoplay-policy=no-user-gesture-required`.
- Scripts outside `web/` need `NODE_PATH="L:/Projects/musicathon/web/node_modules"`.
- No URL routing: navigate tabs by clicking the header buttons (`getByRole('button', { name: 'Passport' })`).
- An onboarding modal (`.fixed.inset-0.z-[60]`) may block clicks on first load — dismiss via a skip/close button before anything else.
- Seed passport data by writing history to localStorage in `addInitScript`; the app's own `autoStampHistory()` mints visas/entries/stubs from it on the Passport tab:
  key `cohear_concert_history_v1`, items `{ id, artist, venue, city, country, date (past), status: 'attended', source: 'manual', actions: { joinedLive: true }, firstViewedAt, attendedAt }`.
  Profile: `cohear_passport_profile_v1`. `source: 'auto'` items get pruned — use `'manual'`.
- The PNG/PDF export sheet renders off-screen in `.cohear-export-offscreen` (portalled to body); to inspect it, set `left: 0; z-index: 9999` via `evaluate` and screenshot `[data-export-page]` nodes. Export pages are fixed-size — check `scrollHeight - clientHeight` for overflow.

## Gotchas

- Google Maps logs `RefererNotAllowedMapError` on localhost:5199 — pre-existing env noise, not a failure.
- A floating chat FAB sits bottom-right and can overlap narrow-viewport elements.
