// Unified concert browser data layer. One call to /api/concerts returns a
// normalized, deduped list spanning PAST (setlist.fm) + UPCOMING (JamBase)
// shows. The List / Map / Calendar views all render off this same array.

// No artist => DISCOVER everything in a date window ('tonight'|'week'|'upcoming').
// An artist => that artist's past (setlist.fm) + upcoming (JamBase).
export async function fetchConcerts(artist, source = 'live', window = 'week') {
  const p = new URLSearchParams();
  if (artist) p.set('artist', artist);
  if (source) p.set('source', source);
  if (!artist && window) p.set('window', window);
  const r = await fetch(`/api/concerts?${p.toString()}`).then((x) => x.json()).catch(() => null);
  return { concerts: r?.concerts || [], sources: r?.sources || {}, browse: Boolean(r?.browse), window: r?.window, ok: Boolean(r?.ok) };
}

// Each sort has a key getter and a sensible default direction (numbers high→low,
// text A→Z). The UI lets you flip direction; `dir` is just the starting point.
export const C_SORTS = {
  date: { label: 'Date', get: (c) => c.date || '', dir: 'desc' },
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
    // Stable tiebreak by date so equal keys don't jump around.
    return (b.date || '').localeCompare(a.date || '');
  });
}

// Spotify artist popularity/followers/art (mock until SPOTIFY_CLIENT_SECRET set).
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
