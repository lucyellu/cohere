// Unified concert browser data layer. One call to /api/concerts returns a
// normalized, deduped list spanning PAST (setlist.fm) + UPCOMING (JamBase)
// shows. The List / Map / Calendar views all render off this same array.

const CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const memoryCache = new Map();
const pending = new Map();

function cacheKey(artist, source, window) {
  return `cohear_concerts_v4:${artist || 'browse'}:${source || 'default'}:${window || 'default'}`;
}

function readCached(key) {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.value;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (parsed && Date.now() - parsed.ts < CACHE_TTL_MS) {
      memoryCache.set(key, parsed);
      return parsed.value;
    }
  } catch {
    /* ignore bad cache entries */
  }
  return null;
}

export function getCachedConcerts(artist, source = 'live', window = 'week') {
  return readCached(cacheKey(artist, source, window));
}

function writeCached(key, value) {
  const entry = { ts: Date.now(), value };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* storage can be full or unavailable */
  }
}

// No artist => DISCOVER everything in a date window ('tonight'|'week'|'upcoming'|'past').
// An artist => that artist's past (setlist.fm) + upcoming (JamBase).
export async function fetchConcerts(artist, source = 'live', window = 'week', { force = false } = {}) {
  const p = new URLSearchParams();
  if (artist) p.set('artist', artist);
  if (source) p.set('source', source);
  if (!artist && window) p.set('window', window);
  const key = cacheKey(artist, source, window);
  if (!force) {
    const cached = readCached(key);
    if (cached) return { ...cached, cached: true };
    if (pending.has(key)) return pending.get(key);
  }
  const request = fetch(`/api/concerts?${p.toString()}`)
    .then((x) => x.json())
    .then((r) => {
      const fallback = publicFallbackConcerts(artist, window);
      const concerts = r?.concerts?.length ? r.concerts : fallback;
      const value = {
        concerts,
        sources: concerts === fallback ? { jambase: 'demo', setlistfm: 'demo' } : (r?.sources || {}),
        browse: Boolean(r?.browse || !artist),
        window: r?.window || window,
        ok: Boolean(r?.ok || fallback.length),
        cached: false,
        fallback: concerts === fallback,
      };
      if (value.ok) writeCached(key, value);
      return value;
    })
    .catch(() => {
      const fallback = publicFallbackConcerts(artist, window);
      const value = { concerts: fallback, sources: { jambase: 'demo', setlistfm: 'demo' }, browse: !artist, window, ok: Boolean(fallback.length), cached: false, fallback: true };
      if (value.ok) writeCached(key, value);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// Each sort has a key getter and a sensible default direction (numbers high→low,
// text A→Z). The UI lets you flip direction; `dir` is just the starting point.
export const C_SORTS = {
  date: { label: 'Date', get: (c) => timeSortKey(c), dir: 'asc' },
  capacity: { label: 'Attendance (capacity)', get: (c) => c.capacity ?? -1, dir: 'desc' },
  popularity: { label: 'Popularity', get: (c) => c.popularity ?? -1, dir: 'desc' },
  songs: { label: 'Songs played', get: (c) => c.songCount ?? 0, dir: 'desc' },
  artist: { label: 'Artist (A–Z)', get: (c) => (c.artist || '').toLowerCase(), dir: 'asc' },
  venue: { label: 'Venue (A–Z)', get: (c) => (c.venue || '').toLowerCase(), dir: 'asc' },
  city: { label: 'City (A–Z)', get: (c) => (c.city || '').toLowerCase(), dir: 'asc' },
};

export function defaultDir(key) {
  return (C_SORTS[key] || C_SORTS.date).dir;
}

export function sortConcerts(list, key, dir) {
  const s = C_SORTS[key] || C_SORTS.date;
  const mult = (dir || s.dir) === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = s.get(a);
    const bv = s.get(b);
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    const tieA = `${timeSortKey(a)}|${a.artist || ''}|${a.venue || ''}`.toLowerCase();
    const tieB = `${timeSortKey(b)}|${b.artist || ''}|${b.venue || ''}`.toLowerCase();
    if (tieA < tieB) return -1 * mult;
    if (tieA > tieB) return 1 * mult;
    return 0;
  });
}

export function timeSortKey(c) {
  return c?.startDate || c?.date || '';
}

// Spotify artist popularity/followers/art. Credentials live in the gateway.
export async function spotifyArtist(name) {
  if (!name) return null;
  const r = await fetch(`/api/spotify/artist?name=${encodeURIComponent(name)}`).then((x) => x.json()).catch(() => null);
  return r?.ok ? { ...r.artist, mode: r.mode } : null;
}

export function filterWhen(list, when) {
  if (when === 'past') return list.filter((c) => c.when === 'past');
  if (when === 'upcoming') return list.filter((c) => c.when === 'upcoming');
  return list;
}

function publicFallbackConcerts(artist, windowKey = 'week') {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const isoAt = (offsetDays, hour, minute = 0) => {
    const d = new Date(now.getTime() + offsetDays * dayMs);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}:00`;
  };
  const dateAt = (offsetDays) => {
    const d = new Date(now.getTime() + offsetDays * dayMs);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const rows = [
    show('fallback-harry-wembley', 'Harry Styles', 'Wembley Stadium connected by EE', 'London', '', 'United Kingdom', 51.556, -0.279, 'Europe/London', 90000, 94, 1, 19, 0, 185),
    show('fallback-bruno-paris', 'Bruno Mars', 'Stade de France', 'Saint-Denis', '', 'France', 48.924, 2.36, 'Europe/Paris', 80698, 92, 0, 20, 0, 210),
    show('fallback-beyonce-la', 'Beyonce', 'SoFi Stadium', 'Inglewood', 'CA', 'United States', 33.953, -118.339, 'America/Los_Angeles', 70240, 96, 2, 20, 30, 240),
    show('fallback-olivia-nyc', 'Olivia Rodrigo', 'Madison Square Garden', 'New York', 'NY', 'United States', 40.75, -73.993, 'America/New_York', 20789, 91, 3, 19, 30, 145),
    show('fallback-karol-miami', 'Karol G', 'Kaseya Center', 'Miami', 'FL', 'United States', 25.781, -80.188, 'America/New_York', 19600, 93, 4, 20, 0, 155),
    show('fallback-bad-bunny-vegas', 'Bad Bunny', 'Allegiant Stadium', 'Las Vegas', 'NV', 'United States', 36.09, -115.183, 'America/Los_Angeles', 65000, 97, 5, 21, 0, 230),
    show('fallback-sabrina-toronto', 'Sabrina Carpenter', 'Scotiabank Arena', 'Toronto', 'ON', 'Canada', 43.643, -79.379, 'America/Toronto', 19800, 89, 6, 19, 0, 135),
    show('fallback-past-posty', 'Post Malone', 'Rogers Stadium', 'Toronto', 'ON', 'Canada', 43.746, -79.477, 'America/Toronto', 50000, 88, -1, 21, 0, 160, 'past'),
  ];
  const filtered = windowKey === 'past'
    ? rows.filter((c) => c.when === 'past')
    : rows.filter((c) => c.when !== 'past');
  const q = String(artist || '').trim().toLowerCase();
  return (q ? rows.filter((c) => [c.artist, c.venue, c.city].join(' ').toLowerCase().includes(q)) : filtered).map((c) => ({
    ...c,
    date: c.when === 'past' ? dateAt(-1) : dateAt(c.offsetDays),
    startDate: c.when === 'past' ? isoAt(-1, c.hour, c.minute) : isoAt(c.offsetDays, c.hour, c.minute),
  }));

  function show(id, artistName, venue, city, region, country, lat, lng, timeZone, capacity, popularity, offsetDays, hour, minute, avgTicketUsd, when = 'upcoming') {
    return {
      id,
      artist: artistName,
      venue,
      city,
      region,
      country,
      lat,
      lng,
      timeZone,
      capacity,
      popularity,
      offsetDays,
      hour,
      minute,
      avgTicketUsd,
      when,
      songCount: 18,
      setlist: ['Opening song', 'Fan favorite', 'Deep cut', 'Acoustic moment', 'Encore'],
      source: 'public-demo',
    };
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}
