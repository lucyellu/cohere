// Cohere gateway client (same-origin via the Vite proxy) + anonymous identity.

// --- Anonymous guest identity -------------------------------------------
// Zero-friction: a judge opens the URL and is instantly "in the crowd". We mint
// a stable guest id (localStorage) and let them optionally set a display name.
// (Supabase anonymous auth layers on top of this in the presence module.)
const ID_KEY = 'cohere_uid';
const NAME_KEY = 'cohere_name';

function randomId() {
  const a = new Uint8Array(8);
  (crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function guestId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = `g_${randomId()}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function guestName() {
  return localStorage.getItem(NAME_KEY) || '';
}
export function setGuestName(name) {
  localStorage.setItem(NAME_KEY, String(name || '').slice(0, 24));
}

// --- Events / rooms ------------------------------------------------------
export async function getFeatured() {
  const r = await fetch('/api/live/featured').then((x) => x.json()).catch(() => null);
  return r?.event || null;
}

// All featured shows (Post Malone live + Madison Beer replay).
export async function getFeaturedList() {
  const r = await fetch('/api/live/featured').then((x) => x.json()).catch(() => null);
  return r?.events || (r?.event ? [r.event] : []);
}

export async function getEvent(id) {
  const r = await fetch(`/api/live/event/${encodeURIComponent(id)}`).then((x) => x.json()).catch(() => null);
  return r?.ok ? r.event : null;
}

export async function resolveEvent(body) {
  const r = await fetch('/api/live/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((x) => x.json()).catch(() => null);
  return r?.ok ? r.event : null;
}

// --- Crowd beacon (tap-to-sync) -----------------------------------------
export async function sendBeacon(eventId, songIndex) {
  return fetch('/api/live/beacon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, songIndex, userId: guestId() }),
  }).then((x) => x.json()).catch(() => null);
}

// --- Crowd fan-clip wall -------------------------------------------------
export async function submitClip(eventId, url, { title, songIndex } = {}) {
  return fetch('/api/live/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, url, title, songIndex, userId: guestId() }),
  }).then((x) => x.json()).catch(() => null);
}

export async function voteClip(eventId, clipId) {
  return fetch('/api/live/clip/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, clipId }),
  }).then((x) => x.json()).catch(() => null);
}

// --- Fan footage of the actual event ------------------------------------
// Fresh uploads (last 24h) + active livestreams. Returns { fresh, live, error }.
export async function liveYoutube(q, { live = false, since } = {}) {
  const p = new URLSearchParams({ q });
  if (live) p.set('live', '1');
  if (since) p.set('since', since);
  const r = await fetch(`/api/live/youtube?${p.toString()}`).then((x) => x.json()).catch(() => null);
  return r || { fresh: [], live: [], error: 'api' };
}

// --- YouTube top result for a song (drives the persistent player) --------
// Cached in localStorage by query so re-plays don't re-spend the ~100/day quota.
export async function youtubeTop(query) {
  const key = `cohere_yt_${query}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      /* fall through */
    }
  }
  const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`).then((x) => x.json()).catch(() => null);
  const item = (r?.data?.items || []).find((i) => i?.id?.videoId);
  if (!item) return null;
  const out = { videoId: item.id.videoId, title: item.snippet?.title || query, channel: item.snippet?.channelTitle || '' };
  localStorage.setItem(key, JSON.stringify(out));
  return out;
}
