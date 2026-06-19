// Cohear gateway client (same-origin via the Vite proxy) + anonymous identity.

// --- Anonymous guest identity -------------------------------------------
// Zero-friction: a judge opens the URL and is instantly "in the crowd". We mint
// a stable guest id (localStorage) and let them optionally set a display name.
// (Supabase anonymous auth layers on top of this in the presence module.)
const ID_KEY = 'cohear_uid';
const NAME_KEY = 'cohear_name';

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
  return r?.ok ? r.event : fallbackEvent(body);
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
// Returns { items: [{videoId,title,channel,publishedAt,views,live}], error }.
export async function liveYoutube(q, { live = false, since, hours } = {}) {
  const p = new URLSearchParams({ q });
  if (live) p.set('live', '1');
  if (since) p.set('since', since);
  if (hours) p.set('hours', String(hours));
  const r = await fetch(`/api/live/youtube?${p.toString()}`).then((x) => x.json()).catch(() => null);
  return r || { items: [], error: 'api' };
}

// --- Multi-platform social search (TikTok / Instagram / X via RapidAPI) ---
// Returns normalized items [{source, url, title, author, views, ts}] the feed
// merges with YouTube and embeds with a source badge.
export async function socialSearch({ q, artist, platform = 'all' }) {
  const p = new URLSearchParams({ q, artist, platform });
  const r = await fetch(`/api/live/social?${p.toString()}`).then((x) => x.json()).catch(() => null);
  return r?.items || [];
}

// --- Venue weather (Open-Meteo, keyless) ---------------------------------
// Current conditions for a live show; historical (that date @ ~9pm) for a replay.
export async function getWeather({ lat, lng, date } = {}) {
  if (lat == null || lng == null) return null;
  const p = new URLSearchParams({ lat, lng });
  if (date) p.set('date', date);
  const r = await fetch(`/api/weather?${p.toString()}`).then((x) => x.json()).catch(() => null);
  return r?.ok ? r : null;
}

// --- Cyanite mood/energy/BPM for the current song ------------------------
// Async on the server (enqueue a YouTube source -> poll). Returns
// { status: 'pending'|'finished'|'error', result?, mode }. Call repeatedly for
// the same song until status === 'finished'; the server caches so it's cheap.
export async function analyzeMood({ song, artist, videoId } = {}) {
  const r = await fetch('/api/cyanite/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song, artist, videoId }),
  }).then((x) => x.json()).catch(() => null);
  return r || { status: 'error' };
}

// --- YouTube top result for a song (drives the persistent player) --------
// Cached in localStorage by query so re-plays don't re-spend the ~100/day quota.
export async function youtubeTop(query) {
  const key = `cohear_yt_${query}`;
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

function fallbackEvent(body = {}) {
  if (!body.artist) return null;
  const songs = fallbackSongs(body.artist);
  const startUTC = startMs(body.startDate, body.date, body.tz || 'America/Vancouver');
  const timeline = songs.map((song, i) => ({
    i,
    song,
    startMs: startUTC + i * 270_000,
    durSec: 225,
  }));
  return {
    id: `fallback-${slug(body.artist)}-${String(body.date || '').slice(0, 10) || 'show'}`,
    artist: body.artist,
    venue: body.venue || 'Venue TBA',
    city: body.city || '',
    country: body.country || '',
    lat: body.lat,
    lng: body.lng,
    tz: body.tz || 'America/Vancouver',
    startUTC,
    mode: body.mode || 'live',
    songsSource: 'fallback',
    setlistDate: body.date,
    exact: false,
    timeline,
    showLengthMs: timeline.length ? (timeline[timeline.length - 1].startMs + timeline[timeline.length - 1].durSec * 1000) - startUTC : 0,
    correctionMs: 0,
    clips: [],
    serverNow: Date.now(),
  };
}

function fallbackSongs(artist) {
  const key = String(artist || '').toLowerCase();
  if (key.includes('bruno')) return ['24K Magic', 'Treasure', 'That’s What I Like', 'Leave the Door Open', 'Locked Out of Heaven', 'Just the Way You Are', 'Uptown Funk'];
  if (key.includes('harry')) return ['Music for a Sushi Restaurant', 'Golden', 'Adore You', 'Watermelon Sugar', 'Sign of the Times', 'As It Was', 'Kiwi'];
  if (key.includes('olivia')) return ['bad idea right?', 'vampire', 'drivers license', 'deja vu', 'traitor', 'good 4 u', 'all-american bitch'];
  if (key.includes('beyonce')) return ['Crazy in Love', 'Formation', 'Cuff It', 'Break My Soul', 'Love on Top', 'Texas Hold ’Em', 'Halo'];
  return ['Opening song', 'Fan favorite', 'The big single', 'Acoustic moment', 'Deep cut', 'Crowd singalong', 'Encore'];
}

function startMs(startDate, date, zone) {
  const raw = String(startDate || '');
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return d.getTime();
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
    if (m) return zonedToUtc(zone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (m) return zonedToUtc(zone, Number(m[1]), Number(m[2]), Number(m[3]), 20, 0);
  return Date.now() + 10 * 60_000;
}

function zonedToUtc(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - tzOffsetMs(tz, guess);
}

function tzOffsetMs(tz, utcMs) {
  const parts = {};
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour % 24), +parts.minute, +parts.second) - utcMs;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
