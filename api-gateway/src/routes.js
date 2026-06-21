// All gateway routes. Each data route checks the service's effective mode
// (mock vs live) and either serves a local mock payload or proxies the real API.

import express from 'express';
import { readFileSync, writeFileSync } from 'node:fs';
import { SERVICES, SERVICE_IDS, hasKey, isMock, getOverride, setOverride } from './services.js';
import { snapshot, record } from './usage.js';
import { callLive, serveMock } from './proxy.js';
import { listAccounts, feedAll } from './suno.js';
import * as pool from './genpool.js';
import { synthesize } from './pipeline.js';
import * as live from './live.js';
import * as rapid from './rapid.js';
import * as passport from './passport.js';

const router = express.Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN_TOKEN = process.env.COHER_ADMIN_TOKEN || process.env.COHEAR_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';

function isAdminRequest(req) {
  if (!ADMIN_TOKEN) return false;
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return bearer === ADMIN_TOKEN || req.get('x-admin-token') === ADMIN_TOKEN;
}

// --- Passport tokens: Ed25519 signed credentials + Supabase registry ----
// Mint stays local-first/instant in the browser; the client calls /issue
// lazily to obtain a signature + global mint number, then flips to "verified".
router.get('/passport/pubkey', (_req, res) => {
  res.json({ ok: true, alg: 'ed25519', publicKey: passport.PUBLIC_KEY_B64, registry: passport.registryEnabled });
});

router.post('/passport/issue', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    res.json(await passport.issue(req.body || {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/passport/verify', async (req, res) => {
  try {
    res.json(await passport.verify(String(req.query.serial || '')));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Health: config + live usage snapshot for the monitor panel ---------
router.get('/health', (_req, res) => {
  const usage = snapshot();
  const services = SERVICE_IDS.map((id) => {
    const mock = isMock(id);
    const key = hasKey(id);
    let status; // green | mock | nokey | offline
    if (!key) status = 'nokey';
    else if (mock) status = 'mock';
    else status = (usage[id].lastStatus && usage[id].lastStatus >= 400) ? 'offline' : 'green';
    return {
      id,
      ...SERVICES[id],
      hasKey: key,
      mock,
      override: getOverride(id),
      status,
      usage: usage[id],
    };
  });
  res.json({ ok: true, uptime: process.uptime(), services });
});

// Public, non-secret client config. The Google Maps JS key is a client-side key
// (it ships in the browser bundle anyway and is protected by HTTP-referrer
// restrictions), so the deployed frontend can fetch it from here at runtime
// instead of needing it baked in at build time. Keeps the key out of the repo.
router.get('/config/public', (_req, res) => {
  res.json({ ok: true, googleMapsKey: process.env.GOOGLE_MAPS_KEY || '' });
});

// --- Toggle a service between mock and live at runtime -------------------
router.post('/config/mock', express.json(), (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'admin token required' });
  const { id, useMock } = req.body || {};
  if (!SERVICE_IDS.includes(id)) return res.status(400).json({ error: 'unknown service id' });
  if (typeof useMock !== 'boolean' && useMock !== null) {
    return res.status(400).json({ error: 'useMock must be true, false, or null' });
  }
  if (useMock === false && !hasKey(id)) {
    return res.status(409).json({ error: `cannot go live: no API key for ${id}` });
  }
  setOverride(id, useMock);
  res.json({ id, override: getOverride(id), mock: isMock(id) });
});

// Helper: serve mock or proxy live based on effective mode.
async function resolve(id, buildLiveUrl, options) {
  if (isMock(id)) return serveMock(id);
  return callLive(id, buildLiveUrl(), options);
}

// --- Musixmatch: lyrics & track search -----------------------------------
router.get('/musixmatch/search', async (req, res) => {
  const q = req.query.q || 'coldplay';
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    return `https://api.musixmatch.com/ws/1.1/track.search?q_track=${encodeURIComponent(q)}&page_size=5&s_track_rating=desc&apikey=${key}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Musixmatch: an artist's top tracks (setlist fallback for live shows) -
router.get('/musixmatch/top', async (req, res) => {
  const artist = req.query.artist || '';
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    const p = new URLSearchParams({ apikey: key, s_track_rating: 'desc', page_size: '15' });
    if (artist) p.set('q_artist', artist);
    return `https://api.musixmatch.com/ws/1.1/track.search?${p.toString()}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Musixmatch: lyrics for a specific track -----------------------------
router.get('/musixmatch/lyrics', async (req, res) => {
  const { track, artist } = req.query;
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    const p = new URLSearchParams({ apikey: key });
    if (track) p.set('q_track', track);
    if (artist) p.set('q_artist', artist);
    return `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?${p.toString()}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- JamBase Data v3: tour events by artist or region --------------------
// Base host is api.data.jambase.com; auth is a Bearer token (NOT a query key).
// A bare `artistName` filter matches tribute acts too, so when an artist is
// given we first resolve the exact artist -> its identifier, then query events
// by id for clean single-artist results.
const JB_BASE = 'https://api.data.jambase.com/v3';
const jbAuth = () => ({
  headers: { Authorization: `Bearer ${process.env.JAMBASE_API_KEY}`, Accept: 'application/json' },
});

router.get('/jambase/events', async (req, res) => {
  const { artist, geoStateIso, source } = req.query;

  // `source` lets the client pick per request: 'mock' = curated demo tour,
  // 'live' = real JamBase. Otherwise fall back to the service's toggle state.
  const useMock = source === 'mock' || (source !== 'live' && isMock('jambase'));
  if (useMock) return res.json(await serveMock('jambase'));

  // Step 1: resolve artist name -> identifier (prefer an exact, case-insensitive match).
  let artistId = null;
  if (artist) {
    const lookup = await callLive('jambase', `${JB_BASE}/artists?artistName=${encodeURIComponent(artist)}&perPage=10`, jbAuth());
    const arts = lookup.data?.artists || [];
    const exact = arts.find((a) => a.name?.toLowerCase() === artist.toLowerCase());
    artistId = (exact || arts[0])?.identifier || null;
  }

  // Step 2: events, by resolved id when possible, else fall back to loose name search.
  const params = new URLSearchParams({ perPage: '30' });
  if (artistId) params.set('artistId', artistId);
  else if (artist) params.set('artistName', artist);
  if (geoStateIso) params.set('geoStateIso', geoStateIso);

  const result = await callLive('jambase', `${JB_BASE}/events?${params.toString()}`, jbAuth());
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Unified concert browser: past + upcoming, one normalized list -------
// Merges two complementary free sources so a single list/map/calendar can show
// a whole career arc:
//   • JamBase  -> UPCOMING dates (real venue capacity + lat/lng)
//   • setlist.fm -> PAST shows (the real setlist + city coordinates; no capacity)
// We dedupe by date+venue, keeping capacity/geo from whichever source has it and
// the richer setlist, then tag each show past/upcoming and derive a popularity
// proxy. Degrades gracefully: if a key is missing that source is just skipped.
async function fetchJambaseEvents({ artist, source, dateFrom, dateTo, perPage = 40 }) {
  const useMock = source === 'mock' || (source !== 'live' && isMock('jambase'));
  if (useMock) {
    const m = await serveMock('jambase');
    return { events: m.data?.events || [], mode: 'mock' };
  }
  let artistId = null;
  if (artist) {
    const lookup = await callLive('jambase', `${JB_BASE}/artists?artistName=${encodeURIComponent(artist)}&perPage=10`, jbAuth());
    const arts = lookup.data?.artists || [];
    const exact = arts.find((a) => a.name?.toLowerCase() === artist.toLowerCase());
    artistId = (exact || arts[0])?.identifier || null;
  }
  const params = new URLSearchParams({ perPage: String(perPage) });
  if (artistId) params.set('artistId', artistId);
  else if (artist) params.set('artistName', artist);
  // Date window — drives query-less BROWSE (e.g. "everything tonight").
  if (dateFrom) params.set('eventDateFrom', dateFrom);
  if (dateTo) params.set('eventDateTo', dateTo);
  const result = await callLive('jambase', `${JB_BASE}/events?${params.toString()}`, jbAuth());
  return { events: result.data?.events || [], mode: result.ok ? 'live' : 'error' };
}

function addDaysIso(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const schemaTxt = (v) => (!v ? '' : typeof v === 'string' ? v : v.name || v.identifier || '');
const dmyToIso = (dmy) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const PAST_DISCOVERY_ARTISTS = ['Bruno Mars', 'Coldplay', 'Olivia Rodrigo', 'Sabrina Carpenter', 'Post Malone', 'Taylor Swift', 'Billie Eilish', 'Bad Bunny'];
const FEATURED_DISCOVERY_ARTISTS = ['Harry Styles'];

function normJambase(events) {
  return (events || []).map((e) => {
    const loc = e.location || {};
    const addr = loc.address || {};
    const geo = loc.geo || {};
    const lat = numOrNull(geo.latitude);
    const lng = numOrNull(geo.longitude);
    const setlist = Array.isArray(e.setlist) ? e.setlist : [];
    return {
      id: e.identifier || `${loc.name}-${(e.startDate || '').slice(0, 10)}`,
      artist: e.performer?.[0]?.name || '',
      venue: loc.name || 'Unknown venue',
      city: addr.addressLocality || '',
      region: schemaTxt(addr.addressRegion),
      country: schemaTxt(addr.addressCountry),
      timeZone: schemaTxt(addr['x-timezone'] || loc['x-timezone']),
      lat, lng,
      date: (e.startDate || '').slice(0, 10),
      startDate: e.startDate || '',
      capacity: numOrNull(loc.maximumAttendeeCapacity ?? loc.capacity),
      setlist,
      songCount: setlist.length,
      tour: e.name || '',
      source: 'jambase',
    };
  });
}

function normSetlistfm(setlists) {
  return (setlists || []).map((s) => {
    const songs = extractSetlistSongs(s);
    const city = s.venue?.city || {};
    const coords = city.coords || {};
    return {
      id: `setlistfm:${s.id || `${s.eventDate}-${s.venue?.name || ''}`}`,
      artist: s.artist?.name || '',
      venue: s.venue?.name || 'Unknown venue',
      city: city.name || '',
      region: schemaTxt(city.stateCode || city.state),
      country: city.country?.name || '',
      lat: numOrNull(coords.lat),
      lng: numOrNull(coords.long),
      date: dmyToIso(s.eventDate),
      startDate: '',
      capacity: null, // setlist.fm has no capacity
      setlist: songs,
      songCount: songs.length,
      tour: s.tour?.name || '',
      source: 'setlistfm',
    };
  });
}

function mergeConcerts(list) {
  const byKey = new Map();
  for (const c of list) {
    if (!c.date) continue;
    const key = `${c.date}|${(c.venue || '').toLowerCase().trim()}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, c); continue; }
    byKey.set(key, {
      ...prev,
      capacity: prev.capacity ?? c.capacity,
      lat: prev.lat ?? c.lat,
      lng: prev.lng ?? c.lng,
      region: prev.region || c.region,
      country: prev.country || c.country,
      timeZone: prev.timeZone || c.timeZone,
      tour: prev.tour || c.tour,
      setlist: (c.setlist?.length || 0) > (prev.setlist?.length || 0) ? c.setlist : prev.setlist,
      songCount: Math.max(prev.songCount || 0, c.songCount || 0),
      source: prev.source === c.source ? prev.source : 'merged',
    });
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  return [...byKey.values()].map((c) => ({
    ...c,
    when: c.date >= todayIso ? 'upcoming' : 'past',
    // Popularity proxy: real venue capacity when known (bigger room = more
    // demand), else setlist richness. True per-show popularity isn't exposed by
    // any free API, so the UI labels this a heuristic.
    popularity: c.capacity != null ? c.capacity : (c.songCount ? c.songCount * 2500 : 0),
  }));
}

async function fetchRecentSetlistsByArtist(artist) {
  if (isMock('setlistfm')) return { setlists: [], mode: 'nokey' };
  const r = await callLive(
    'setlistfm',
    `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist)}&p=1`,
    { headers: { 'x-api-key': process.env.SETLISTFM_API_KEY, Accept: 'application/json' } }
  );
  return { setlists: r.data?.setlist || [], mode: r.ok ? 'live' : 'error' };
}

router.get('/concerts', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const source = String(req.query.source || '');
  const windowKey = String(req.query.window || 'week').trim(); // browse window when no artist
  const browse = !artist; // no artist -> DISCOVER everything happening
  const sources = { jambase: null, setlistfm: null };
  const collected = [];

  // Browse mode: date-filter JamBase to "what's on" (tonight / this week / upcoming).
  let dateFrom, dateTo;
  if (browse) {
    const today = new Date().toISOString().slice(0, 10);
    if (windowKey === 'past') {
      dateFrom = addDaysIso(today, -60);
      dateTo = addDaysIso(today, -1);
    } else {
      dateFrom = today;
      if (windowKey === 'tonight') dateTo = today;
      else if (windowKey === 'week') dateTo = addDaysIso(today, 7);
      else dateTo = addDaysIso(today, 60); // 'upcoming'
    }
  }

  // Upcoming (JamBase) — artist-filtered, or the whole window when browsing.
  try {
    const jb = await fetchJambaseEvents({ artist, source, dateFrom, dateTo, perPage: browse ? 80 : 40 });
    collected.push(...normJambase(jb.events));
    sources.jambase = jb.mode;
  } catch (e) {
    sources.jambase = 'error';
  }

  // Some major residencies do not surface reliably in JamBase's broad browse
  // page even though artist-specific lookup finds them. Fill those into browse.
  if (browse && windowKey !== 'past' && source !== 'mock') {
    const fills = await Promise.allSettled(
      FEATURED_DISCOVERY_ARTISTS.map((name) => fetchJambaseEvents({ artist: name, source, dateFrom, dateTo, perPage: 20 }))
    );
    for (const f of fills) {
      if (f.status === 'fulfilled' && f.value.mode === 'live') collected.push(...normJambase(f.value.events));
    }
  }

  // Past (setlist.fm) — only when an artist is named (it's artist-centric).
  if (artist && source !== 'mock' && !isMock('setlistfm')) {
    const sf = await fetchRecentSetlistsByArtist(artist);
    if (sf.mode === 'live') {
      collected.push(...normSetlistfm(sf.setlists));
      sources.setlistfm = sf.mode;
    } else {
      sources.setlistfm = sf.mode;
    }
  } else if (browse && windowKey === 'past' && source !== 'mock' && !isMock('setlistfm')) {
    const results = await Promise.allSettled(PAST_DISCOVERY_ARTISTS.map((name) => fetchRecentSetlistsByArtist(name)));
    let anyLive = false;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      if (r.value.mode === 'live') anyLive = true;
      collected.push(...normSetlistfm(r.value.setlists));
    }
    sources.setlistfm = anyLive ? 'live' : 'error';
  } else {
    sources.setlistfm = artist ? (isMock('setlistfm') ? 'nokey' : 'mock') : 'na';
  }

  // Browse defaults to biggest-first (the discovery framing); artist view to recency.
  const merged = mergeConcerts(collected).filter((c) => !(browse && windowKey === 'past') || c.when === 'past');
  const concerts = browse
    ? (windowKey === 'past'
        ? merged.sort((a, b) => b.date.localeCompare(a.date))
        : merged.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1)))
    : merged.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ ok: true, artist, browse, window: browse ? windowKey : null, concerts, sources });
});

// --- Ticketmaster Discovery: single-ticket price range + buy link --------
// Open API only: event metadata, priceRanges, and the Ticketmaster event URL.
// The Partner API is restricted, so checkout/inventory is intentionally out of
// scope here. A user can send x-cohear-ticketmaster-key from local settings.
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';

router.get('/ticketmaster/match', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const venue = String(req.query.venue || '').trim();
  const city = String(req.query.city || '').trim();
  const country = String(req.query.country || '').trim();
  const date = String(req.query.date || '').slice(0, 10);
  const userKey = String(req.get('x-cohear-ticketmaster-key') || '').trim();
  const key = userKey || process.env.TICKETMASTER_API_KEY || '';
  const affiliate = String(req.get('x-cohear-ticketmaster-affiliate') || process.env.TICKETMASTER_AFFILIATE_ID || '').trim();

  if (!artist && !venue && !city) return res.status(400).json({ ok: false, error: 'artist, venue, or city required' });
  if (!key) {
    record('ticketmaster', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: 'no key' });
    return res.json({ ok: false, mode: 'nokey', error: 'ticketmaster key required' });
  }

  const params = new URLSearchParams({
    apikey: key,
    classificationName: 'music',
    size: '20',
    sort: 'date,asc',
  });
  const attractionId = artist ? await ticketmasterAttractionId(artist, key) : null;
  if (attractionId) params.set('attractionId', attractionId);
  else if (artist) params.set('keyword', artist);
  if (city) params.set('city', city);
  const countryCode = ticketmasterCountryCode(country);
  if (countryCode) params.set('countryCode', countryCode);
  if (date) {
    params.set('startDateTime', `${date}T00:00:00Z`);
    params.set('endDateTime', `${date}T23:59:59Z`);
  }

  const result = await callLive('ticketmaster', `${TM_BASE}/events.json?${params.toString()}`);
  if (!result.ok) return res.status(502).json({ ok: false, mode: 'live', error: `ticketmaster failed (HTTP ${result.status || 'unknown'})` });

  const events = (result.data?._embedded?.events || []).filter((event) => !isLikelyTributeEvent(event, artist));
  const ranked = events
    .map((event) => ({ event, score: scoreTicketmasterEvent(event, { artist, venue, city, date }) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 25) return res.json({ ok: false, mode: 'live', error: 'no confident ticket match' });

  res.json({ ok: true, mode: 'live', ticket: normalizeTicketmasterEvent(best.event, affiliate), score: best.score });
});

function normalizeTicketmasterEvent(event, affiliate = '') {
  const venue = event?._embedded?.venues?.[0] || {};
  const priceRanges = Array.isArray(event?.priceRanges) ? event.priceRanges : [];
  const prices = priceRanges
    .map((p) => ({ min: numOrNull(p.min), max: numOrNull(p.max), currency: p.currency || venue.currency || '' }))
    .filter((p) => p.min != null || p.max != null);
  const min = prices.length ? Math.min(...prices.map((p) => p.min ?? p.max).filter((v) => v != null)) : null;
  const max = prices.length ? Math.max(...prices.map((p) => p.max ?? p.min).filter((v) => v != null)) : null;
  const currency = prices.find((p) => p.currency)?.currency || venue.currency || 'USD';
  const typical = min != null && max != null ? Math.round((min + max) / 2) : (min ?? max);
  return {
    id: event.id,
    name: event.name || '',
    url: appendAffiliate(event.url || '', affiliate),
    source: 'ticketmaster',
    date: event.dates?.start?.localDate || '',
    time: event.dates?.start?.localTime || '',
    venue: venue.name || '',
    city: venue.city?.name || '',
    country: venue.country?.name || venue.country?.countryCode || '',
    currency,
    priceLow: min,
    priceHigh: max,
    priceTypical: typical,
    priceSource: prices.length ? 'ticketmaster_price_range' : 'ticketmaster_event',
  };
}

function appendAffiliate(url, affiliate) {
  if (!url || !affiliate) return url || '';
  try {
    const u = new URL(url);
    u.searchParams.set('CAMEFROM', affiliate);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}CAMEFROM=${encodeURIComponent(affiliate)}`;
  }
}

async function ticketmasterAttractionId(artist, key) {
  const params = new URLSearchParams({
    apikey: key,
    keyword: artist,
    classificationName: 'music',
    size: '10',
  });
  const result = await callLive('ticketmaster', `${TM_BASE}/attractions.json?${params.toString()}`);
  if (!result.ok) return null;
  const attractions = result.data?._embedded?.attractions || [];
  const exact = attractions.find((a) => String(a.name || '').trim().toLowerCase() === artist.toLowerCase());
  return exact?.id || null;
}

function isLikelyTributeEvent(event, artist) {
  if (!artist) return false;
  const text = [
    event?.name,
    ...(event?._embedded?.attractions || []).map((a) => a.name),
  ].filter(Boolean).join(' ').toLowerCase();
  if (!/\b(tribute|tributes|cover band|candlelight|experience)\b/.test(text)) return false;
  return !String(event?.name || '').trim().toLowerCase().startsWith(String(artist).toLowerCase());
}

function scoreTicketmasterEvent(event, wanted) {
  const evVenue = event?._embedded?.venues?.[0] || {};
  const haystack = [
    event?.name,
    evVenue.name,
    evVenue.city?.name,
    evVenue.country?.name,
    ...(event?._embedded?.attractions || []).map((a) => a.name),
  ].filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  if (wanted.date && event?.dates?.start?.localDate === wanted.date) score += 45;
  if (wanted.city && String(evVenue.city?.name || '').toLowerCase() === wanted.city.toLowerCase()) score += 20;
  if (wanted.venue && fuzzyContains(evVenue.name, wanted.venue)) score += 24;
  if (wanted.artist && fuzzyContains(haystack, wanted.artist)) score += 28;
  if (event?.url) score += 4;
  if (Array.isArray(event?.priceRanges) && event.priceRanges.length) score += 10;
  return score;
}

function fuzzyContains(haystack, needle) {
  const h = String(haystack || '').toLowerCase();
  const parts = String(needle || '').toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  if (!h || !parts.length) return false;
  return parts.every((p) => h.includes(p));
}

function ticketmasterCountryCode(country) {
  const c = String(country || '').trim().toLowerCase();
  if (!c) return '';
  if (c === 'us' || c.includes('united states') || c === 'usa') return 'US';
  if (c === 'ca' || c.includes('canada')) return 'CA';
  if (c === 'gb' || c === 'uk' || c.includes('united kingdom') || c.includes('england')) return 'GB';
  if (c.includes('australia')) return 'AU';
  if (c.includes('new zealand')) return 'NZ';
  if (c.includes('mexico')) return 'MX';
  if (c.includes('ireland')) return 'IE';
  if (c.includes('france')) return 'FR';
  if (c.includes('germany')) return 'DE';
  if (c.includes('spain')) return 'ES';
  if (c.includes('italy')) return 'IT';
  if (c.includes('japan')) return 'JP';
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return '';
}

// --- Web ticket estimate: top search snippets -> conservative price range -
router.get('/tickets/web-estimate', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const venue = String(req.query.venue || '').trim();
  const city = String(req.query.city || '').trim();
  const country = String(req.query.country || '').trim();
  const date = String(req.query.date || '').slice(0, 10);
  const requestedCurrency = String(req.query.currency || '').trim().toUpperCase();
  const key = String(req.get('x-cohear-google-cse-key') || process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const cx = String(req.get('x-cohear-google-cse-id') || process.env.GOOGLE_CSE_ID || '').trim();

  if (!artist && !venue && !city) return res.status(400).json({ ok: false, error: 'artist, venue, or city required' });
  if (!key || !cx) {
    record('websearch', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: 'no google cse config' });
    return res.json({ ok: false, mode: 'nokey', error: 'google search key and engine id required' });
  }

  const query = ticketSearchQuery({ artist, venue, city, country, date });
  const params = new URLSearchParams({
    key,
    cx,
    q: query,
    num: '10',
    safe: 'active',
  });
  const gl = ticketmasterCountryCode(country).toLowerCase();
  if (gl) params.set('gl', gl);

  const result = await callLive('websearch', `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!result.ok) return res.status(502).json({ ok: false, mode: 'live', error: `web search failed (HTTP ${result.status || 'unknown'})` });

  const items = Array.isArray(result.data?.items) ? result.data.items : [];
  const estimate = estimateTicketPriceFromSearch(items, requestedCurrency || defaultCurrencyForCountry(country));
  if (!estimate) {
    return res.json({
      ok: false,
      mode: 'live',
      error: 'no ticket prices found in search snippets',
      query,
      results: items.slice(0, 5).map(searchResultSummary),
    });
  }

  res.json({ ok: true, mode: 'live', query, estimate });
});

function ticketSearchQuery({ artist, venue, city, country, date }) {
  return [
    artist,
    venue ? `"${venue}"` : '',
    city,
    country,
    date,
    'tickets price',
    '-parking',
  ].filter(Boolean).join(' ');
}

function estimateTicketPriceFromSearch(items, defaultCurrency = 'USD') {
  const perResult = items.map((item) => {
    const summary = searchResultSummary(item);
    const text = [
      item?.title,
      item?.snippet,
      item?.htmlSnippet,
      ...(item?.pagemap?.offer || []).map((offer) => `${offer.pricecurrency || ''} ${offer.price || ''}`),
      ...(item?.pagemap?.offers || []).map((offer) => `${offer.pricecurrency || ''} ${offer.price || ''}`),
    ].filter(Boolean).join(' ');
    return { ...summary, prices: extractTicketPrices(text, defaultCurrency) };
  });
  const allPrices = perResult.flatMap((item) => item.prices.map((price) => ({ ...price, link: item.link })));
  if (!allPrices.length) return null;

  const byCurrency = new Map();
  for (const price of allPrices) {
    const list = byCurrency.get(price.currency) || [];
    list.push(price);
    byCurrency.set(price.currency, list);
  }
  const preferred = byCurrency.get(defaultCurrency);
  const prices = preferred?.length ? preferred : [...byCurrency.values()].sort((a, b) => b.length - a.length)[0];
  if (!prices?.length) return null;

  const values = prices.map((price) => price.value).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const resultLinks = new Set(prices.map((price) => price.link).filter(Boolean));
  const trimmed = trimOutliers(values);
  return {
    source: 'web_search',
    priceSource: 'google_cse_snippets',
    currency: prices[0].currency,
    priceLow: Math.round(trimmed[0]),
    priceHigh: Math.round(trimmed[trimmed.length - 1]),
    priceTypical: Math.round(medianNumber(trimmed)),
    priceAverage: Math.round(trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length),
    observedCount: values.length,
    sourceCount: resultLinks.size,
    confidence: searchPriceConfidence(values.length, resultLinks.size),
    results: perResult.filter((item) => item.prices.some((price) => price.currency === prices[0].currency)).slice(0, 5),
  };
}

function searchResultSummary(item) {
  return {
    title: item?.title || '',
    link: item?.link || '',
    snippet: cleanSnippet(item?.snippet || ''),
  };
}

function extractTicketPrices(text, defaultCurrency = 'USD') {
  const out = [];
  const seen = new Set();
  const push = (rawValue, currency, index = 0, raw = '') => {
    const value = parsePriceValue(rawValue);
    const normalizedCurrency = normalizeCurrency(currency, defaultCurrency);
    const max = normalizedCurrency === 'JPY' ? 500000 : 5000;
    const min = normalizedCurrency === 'JPY' ? 1000 : 10;
    if (!Number.isFinite(value) || value < min || value > max) return;
    const context = String(text).slice(Math.max(0, index - 24), index + String(raw).length + 24).toLowerCase();
    if (/\b(parking|hotel|shipping|deposit|gift card)\b/.test(context)) return;
    const key = `${normalizedCurrency}:${Math.round(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, currency: normalizedCurrency });
  };

  const symbolPattern = /(US\$|CA\$|C\$|A\$|\$|£|€|¥)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]{2,6}(?:\.\d{1,2})?)/gi;
  for (const match of String(text).matchAll(symbolPattern)) {
    push(match[2], currencyForSymbol(match[1], defaultCurrency), match.index, match[0]);
  }

  const codeBeforePattern = /\b(USD|CAD|EUR|GBP|AUD|JPY)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]{2,6}(?:\.\d{1,2})?)\b/gi;
  for (const match of String(text).matchAll(codeBeforePattern)) {
    push(match[2], match[1], match.index, match[0]);
  }

  const codeAfterPattern = /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]{2,6}(?:\.\d{1,2})?)\s*(USD|CAD|EUR|GBP|AUD|JPY)\b/gi;
  for (const match of String(text).matchAll(codeAfterPattern)) {
    push(match[1], match[2], match.index, match[0]);
  }
  return out.slice(0, 8);
}

function parsePriceValue(value) {
  return Number(String(value || '').replace(/,/g, ''));
}

function currencyForSymbol(symbol, fallback) {
  const s = String(symbol || '').toUpperCase();
  if (s === 'US$') return 'USD';
  if (s === 'CA$' || s === 'C$') return 'CAD';
  if (s === 'A$') return 'AUD';
  if (s === '£') return 'GBP';
  if (s === '€') return 'EUR';
  if (s === '¥') return 'JPY';
  return fallback || 'USD';
}

function normalizeCurrency(currency, fallback = 'USD') {
  const c = String(currency || '').toUpperCase();
  return ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'].includes(c) ? c : (fallback || 'USD');
}

function defaultCurrencyForCountry(country) {
  const code = ticketmasterCountryCode(country);
  if (code === 'CA') return 'CAD';
  if (code === 'GB' || code === 'IE') return 'GBP';
  if (['FR', 'DE', 'ES', 'IT'].includes(code)) return 'EUR';
  if (code === 'AU' || code === 'NZ') return 'AUD';
  if (code === 'JP') return 'JPY';
  return 'USD';
}

function trimOutliers(values) {
  if (values.length < 5) return values;
  return values.slice(1, -1);
}

function medianNumber(values) {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function searchPriceConfidence(count, sourceCount) {
  if (count >= 5 && sourceCount >= 3) return 'medium';
  if (count >= 2 && sourceCount >= 2) return 'low';
  return 'very_low';
}

function cleanSnippet(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// --- YouTube: crowd-sourced concert video search -------------------------
router.get('/youtube/search', async (req, res) => {
  const q = req.query.q || 'coldplay live';
  const result = await resolve('youtube', () => {
    const key = process.env.YOUTUBE_API_KEY;
    return `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${key}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Songstats: artist search / streaming analytics ----------------------
router.get('/songstats/search', async (req, res) => {
  const q = req.query.q || 'coldplay';
  const result = await resolve(
    'songstats',
    () => `https://api.songstats.com/enterprise/v1/artists/search?q=${encodeURIComponent(q)}&limit=5`,
    { headers: { apikey: process.env.SONGSTATS_API_KEY, Accept: 'application/json' } }
  );
  res.status(result.ok ? 200 : 502).json(result);
});

// --- setlist.fm: real setlist for a show (or the artist's most recent) ----
// JamBase shows are upcoming (no setlist yet), so if there's no exact-date
// match we return the most recent PAST setlist = "what they've been playing".
router.get('/setlistfm/setlist', async (req, res) => {
  const { artist, date } = req.query;

  if (isMock('setlistfm')) {
    // No key yet -> return empty so the Show page falls back to top tracks
    // (rather than showing a fake setlist for a real artist).
    record('setlistfm', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', songs: [], exact: false });
  }

  const result = await callLive(
    'setlistfm',
    `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist || '')}&p=1`,
    { headers: { 'x-api-key': process.env.SETLISTFM_API_KEY, Accept: 'application/json' } }
  );
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: `HTTP ${result.status}`, songs: [] });
  }

  const setlists = (result.data?.setlist || []).filter((s) => extractSetlistSongs(s).length);
  const want = isoToDmy(String(date || '').slice(0, 10)); // 2026-06-23 -> 23-06-2026
  const exactMatch = setlists.find((s) => s.eventDate === want);
  const chosen = exactMatch || setlists[0];
  if (!chosen) return res.json({ ok: true, mode: 'live', songs: [], exact: false });

  res.json({
    ok: true,
    mode: 'live',
    exact: Boolean(exactMatch),
    songs: extractSetlistSongs(chosen),
    source: {
      date: chosen.eventDate,
      venue: chosen.venue?.name || '',
      city: chosen.venue?.city?.name || '',
      tour: chosen.tour?.name || '',
    },
  });
});

function extractSetlistSongs(s) {
  return (s?.sets?.set || []).flatMap((set) => (set.song || []).map((x) => x.name)).filter(Boolean);
}

function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// --- Open-Meteo: venue weather at showtime (free, keyless) ---------------
// "Be in the crowd" extends to the air: for a LIVE show we show current
// conditions at the venue; for a REPLAY we pull the ARCHIVE for that date at
// ~9pm local ("it was 12°C and raining that night"). Especially good for the
// open-air Rogers Stadium featured show. No key, no cost.
const WMO = {
  0: { label: 'Clear', emoji: '☀️' },
  1: { label: 'Mainly clear', emoji: '🌤️' }, 2: { label: 'Partly cloudy', emoji: '⛅' }, 3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' }, 48: { label: 'Rime fog', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' }, 53: { label: 'Drizzle', emoji: '🌦️' }, 55: { label: 'Heavy drizzle', emoji: '🌦️' },
  61: { label: 'Light rain', emoji: '🌧️' }, 63: { label: 'Rain', emoji: '🌧️' }, 65: { label: 'Heavy rain', emoji: '🌧️' },
  66: { label: 'Freezing rain', emoji: '🌧️' }, 67: { label: 'Freezing rain', emoji: '🌧️' },
  71: { label: 'Light snow', emoji: '🌨️' }, 73: { label: 'Snow', emoji: '🌨️' }, 75: { label: 'Heavy snow', emoji: '❄️' }, 77: { label: 'Snow grains', emoji: '🌨️' },
  80: { label: 'Rain showers', emoji: '🌦️' }, 81: { label: 'Rain showers', emoji: '🌧️' }, 82: { label: 'Violent showers', emoji: '⛈️' },
  85: { label: 'Snow showers', emoji: '🌨️' }, 86: { label: 'Snow showers', emoji: '🌨️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' }, 96: { label: 'Thunderstorm + hail', emoji: '⛈️' }, 99: { label: 'Thunderstorm + hail', emoji: '⛈️' },
};
const wmo = (code) => WMO[code] || { label: '—', emoji: '🌡️' };

router.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const date = String(req.query.date || '').slice(0, 10);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ ok: false, error: 'lat,lng required' });
  const todayIso = new Date().toISOString().slice(0, 10);
  const isPast = date && date < todayIso;

  try {
    if (isPast) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}` +
        `&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
      const r = await callLive('openmeteo', url);
      const h = r.data?.hourly;
      if (!h?.time?.length) return res.json({ ok: false, error: 'no archive data' });
      let i = h.time.findIndex((t) => t.endsWith('21:00'));
      if (i < 0) i = Math.floor(h.time.length / 2);
      const code = h.weather_code?.[i];
      const w = wmo(code);
      return res.json({ ok: true, mode: 'historical', date, tempC: h.temperature_2m?.[i], code, label: w.label, emoji: w.emoji, windKph: h.wind_speed_10m?.[i], precip: h.precipitation?.[i], time: h.time[i] });
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&timezone=auto`;
    const r = await callLive('openmeteo', url);
    const c = r.data?.current;
    if (!c) return res.json({ ok: false, error: 'no current data' });
    const w = wmo(c.weather_code);
    return res.json({ ok: true, mode: 'live', tempC: c.temperature_2m, feelsLike: c.apparent_temperature, code: c.weather_code, label: w.label, emoji: w.emoji, windKph: c.wind_speed_10m, precip: c.precipitation, humidity: c.relative_humidity_2m, time: c.time });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// --- Spotify: track/artist popularity + art (Client-Credentials flow) -----
// App-level catalog data (no user login). Token cached ~1h. NOTE: Spotify
// deprecated audio-features/recommendations for new apps — we use it only for
// popularity (0-100), followers, genres, and album/artist art (Cyanite already
// covers mood/energy). Needs SPOTIFY_CLIENT_ID + SECRET; mock until the secret
// is set.
let spotifyTok = { value: null, exp: 0 };
async function spotifyAuth() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (spotifyTok.value && Date.now() < spotifyTok.exp - 30000) return spotifyTok.value;
  const r = await callLive('spotify', 'https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const tok = r.data?.access_token;
  if (!tok) return null;
  spotifyTok = { value: tok, exp: Date.now() + (r.data.expires_in || 3600) * 1000 };
  return tok;
}
async function spotifyGet(path) {
  const tok = await spotifyAuth();
  if (!tok) return { ok: false, data: null };
  return callLive('spotify', `https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${tok}` } });
}
const hashNum = (s, mod) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % mod;

router.get('/spotify/artist', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  if (isMock('spotify')) {
    record('spotify', { status: 200, latencyMs: 0, bytes: name.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', artist: { name, popularity: 55 + hashNum(name, 40), followers: 100000 + hashNum(name, 5_000_000), genres: ['pop'], image: null } });
  }
  const r = await spotifyGet(`/search?q=${encodeURIComponent(name)}&type=artist&limit=1`);
  if (!r.ok) return res.status(502).json({ ok: false, error: `spotify search failed (HTTP ${r.status || 'unknown'})` });
  const a = r.data?.artists?.items?.[0];
  if (!a) return res.json({ ok: false, error: 'artist not found' });
  res.json({ ok: true, mode: 'live', artist: { id: a.id, name: a.name, popularity: a.popularity, followers: a.followers?.total, genres: a.genres || [], image: a.images?.[0]?.url || null, url: a.external_urls?.spotify } });
});

router.get('/spotify/track', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const track = String(req.query.track || '').trim();
  if (!track) return res.status(400).json({ ok: false, error: 'track required' });
  if (isMock('spotify')) {
    record('spotify', { status: 200, latencyMs: 0, bytes: track.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', track: { name: track, popularity: 40 + hashNum(track, 55), art: null } });
  }
  const q = artist ? `track:${track} artist:${artist}` : `track:${track}`;
  const r = await spotifyGet(`/search?q=${encodeURIComponent(q)}&type=track&limit=1`);
  if (!r.ok) return res.status(502).json({ ok: false, error: `spotify search failed (HTTP ${r.status || 'unknown'})` });
  const t = r.data?.tracks?.items?.[0];
  if (!t) return res.json({ ok: false, error: 'track not found' });
  res.json({ ok: true, mode: 'live', track: { id: t.id, name: t.name, popularity: t.popularity, album: t.album?.name, art: t.album?.images?.[0]?.url || null, preview: t.preview_url, url: t.external_urls?.spotify } });
});

// --- Pinterest: extract a style-seed image from a public Pin/board URL ----
// Uses Open Graph meta tags (same as a link preview) — no API key or OAuth.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

router.get('/pinterest/extract', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ ok: false, error: 'url required' });

  if (isMock('pinterest')) {
    record('pinterest', { status: 200, latencyMs: 0, bytes: url.length, mode: 'mock', error: null });
    return res.json({
      ok: true,
      mode: 'mock',
      image: 'https://i.pinimg.com/736x/cb/ce/85/cbce8580e35f151f130054ffb8254390.jpg',
      title: 'Music festival stage (mock seed)',
      text: 'Futuristic outdoor festival stage, lasers and LED walls, dense crowd, neon lighting.',
    });
  }

  // Direct image URL — use as-is, no scraping needed.
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || /i\.pinimg\.com/.test(url)) {
    record('pinterest', { status: 200, latencyMs: 0, bytes: url.length, mode: 'live', error: null });
    return res.json({ ok: true, mode: 'live', image: url, title: '', text: '' });
  }

  const result = await callLive('pinterest', url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!result.ok || typeof result.data !== 'string') {
    return res.status(502).json({ ok: false, error: `fetch failed (HTTP ${result.status})` });
  }
  const og = parseOg(result.data);
  if (!og.image) return res.status(422).json({ ok: false, error: 'no image found at that URL' });
  res.json({ ok: true, mode: 'live', image: og.image, title: og.title, text: [og.title, og.description].filter(Boolean).join('. ') });
});

function parseOg(html) {
  const grab = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']og:${prop}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0] || '';
    return tag.match(/content=["']([^"']+)["']/i)?.[1] || '';
  };
  return { image: grab('image'), title: grab('title'), description: grab('description') };
}

// --- Gemini (BYOC): synthesize a concert scene for a missing-footage song -
// Order of resolution:
//   1. a viewer-supplied key (x-byoc-key header) -> always a live call (their compute)
//   2. else if gemini is in mock mode -> a placeholder scene (works offline)
//   3. else -> live call with the gateway's own key
router.post('/gemini/generate', express.json({ limit: '256kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '');
  const label = String(req.body?.label || '');
  const seedImageUrl = String(req.body?.seedImageUrl || '');
  const seedText = String(req.body?.seedText || '');
  const byoc = (req.get('x-byoc-key') || '').trim();

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (!byoc && isMock('gemini')) {
    record('gemini', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    // Before Gemini is live, show the Pinterest seed itself as the scene (if any).
    return res.json({
      ok: true,
      mode: seedImageUrl ? 'seed' : 'mock',
      image: seedImageUrl || placeholderScene(label),
    });
  }

  const fullPrompt = seedText ? `${prompt} Match this visual style: ${seedText}` : prompt;
  const parts = [{ text: fullPrompt }];
  if (seedImageUrl) {
    const seed = await fetchImageBase64(seedImageUrl);
    if (seed) parts.push({ inlineData: seed }); // image-to-image style reference
  }

  const key = byoc || process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`;
  const result = await callLive('gemini', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  const mode = byoc ? 'byoc' : 'live';
  if (!result.ok) {
    const msg = result.data?.error?.message || `HTTP ${result.status}`;
    // Degrade gracefully: still return a placeholder so the UI shows something.
    return res.status(502).json({ ok: false, mode, error: msg, image: placeholderScene(label) });
  }

  const respParts = result.data?.candidates?.[0]?.content?.parts || [];
  const img = respParts.find((p) => p.inlineData?.data);
  if (!img) {
    return res.status(502).json({ ok: false, mode, error: 'no image in response', image: placeholderScene(label) });
  }
  res.json({ ok: true, mode, image: `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}` });
});

// Fetch a remote image and base64-encode it for Gemini image-to-image input.
async function fetchImageBase64(imgUrl) {
  try {
    const r = await fetch(imgUrl, { headers: { 'User-Agent': BROWSER_UA } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null; // cap at 4MB
    return { mimeType: r.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') };
  } catch {
    return null;
  }
}

// SVG placeholder "scene" so the BYOC flow is demoable before the API is live.
function placeholderScene(label) {
  const safe = (label || 'Synthesized scene').replace(/[<&>]/g, '').slice(0, 48);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='#3b0764'/><stop offset='0.55' stop-color='#1e1b4b'/><stop offset='1' stop-color='#020617'/>
      </linearGradient>
      <radialGradient id='spot' cx='0.5' cy='0.3' r='0.55'>
        <stop offset='0' stop-color='#a78bfa' stop-opacity='0.55'/><stop offset='1' stop-color='#a78bfa' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <rect width='1280' height='720' fill='url(#g)'/>
    <rect width='1280' height='720' fill='url(#spot)'/>
    <rect y='560' width='1280' height='160' fill='#000' opacity='0.45'/>
    <text x='640' y='350' text-anchor='middle' fill='#e9d5ff' font-family='sans-serif' font-size='44' font-weight='700'>${safe}</text>
    <text x='640' y='400' text-anchor='middle' fill='#a1a1aa' font-family='sans-serif' font-size='21'>synthesized scene · placeholder</text>
    <text x='640' y='436' text-anchor='middle' fill='#71717a' font-family='sans-serif' font-size='15'>enable the Gemini API or add a BYOC key for real AI generation</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// --- Image generation (Pollinations FLUX keyless + HuggingFace FLUX) ------
// Image APIs return raw image BYTES, not JSON, so they can't use callLive
// (which parses text/JSON). This helper fetches binary, validates it's an
// image, records usage, and returns a base64 data URL — the same shape the
// Show page already consumes from /gemini/generate.
async function generateImageLive(id, url, options = {}) {
  const start = Date.now();
  try {
    const r = await fetch(url, options);
    const buf = Buffer.from(await r.arrayBuffer());
    const latencyMs = Date.now() - start;
    const ct = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok) {
      const snippet = buf.toString('utf8').slice(0, 200);
      record(id, { status: r.status, latencyMs, bytes: buf.length, mode: 'live', error: `HTTP ${r.status}` });
      return { ok: false, status: r.status, error: `HTTP ${r.status}: ${snippet}` };
    }
    if (!ct.startsWith('image/') || buf.length < 1024) {
      record(id, { status: 502, latencyMs, bytes: buf.length, mode: 'live', error: 'non-image response' });
      return { ok: false, status: 502, error: `non-image response (ct=${ct}, bytes=${buf.length})` };
    }
    record(id, { status: r.status, latencyMs, bytes: buf.length, mode: 'live', error: null });
    return { ok: true, status: r.status, bytes: buf.length, image: `data:${ct};base64,${buf.toString('base64')}` };
  } catch (err) {
    record(id, { status: 0, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: err.message });
    return { ok: false, status: 0, error: err.message };
  }
}

// Pollinations — free, keyless FLUX text-to-image (GET, prompt in the path).
router.post('/pollinations/generate', express.json({ limit: '64kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const label = String(req.body?.label || '');
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (isMock('pollinations')) {
    record('pollinations', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', model: 'mock', image: placeholderScene(label || 'Pollinations FLUX') });
  }

  const model = req.body?.model ? String(req.body.model) : 'flux';
  const width = Number(req.body?.width) || 1024;
  const height = Number(req.body?.height) || 1024;
  const encoded = encodeURIComponent(prompt.slice(0, 1900));
  const seed = Date.now() % 1_000_000;
  const url =
    `https://image.pollinations.ai/prompt/${encoded}` +
    `?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&enhance=true`;

  const result = await generateImageLive('pollinations', url, { headers: { 'User-Agent': 'cohear/0.1' } });
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: result.error, image: placeholderScene(label) });
  }
  res.json({ ok: true, mode: 'live', model: `pollinations/${model}`, image: result.image });
});

// HuggingFace FLUX.1-schnell — POST { inputs, parameters }, Bearer HF_TOKEN.
router.post('/huggingface/generate', express.json({ limit: '64kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const label = String(req.body?.label || '');
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (isMock('huggingface')) {
    record('huggingface', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', model: 'mock', image: placeholderScene(label || 'FLUX.1-schnell') });
  }

  const model = req.body?.model ? String(req.body.model) : 'black-forest-labs/FLUX.1-schnell';
  const url = `https://router.huggingface.co/hf-inference/models/${model}`;
  const result = await generateImageLive('huggingface', url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt.slice(0, 1900), parameters: { width: 1024, height: 1024 } }),
  });
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: result.error, image: placeholderScene(label) });
  }
  res.json({ ok: true, mode: 'live', model: `hf/${model}`, image: result.image });
});

// Dashboard "Probe" buttons (GET) — a small live generation so stats populate.
router.get('/pollinations/probe', async (_req, res) => {
  if (isMock('pollinations')) {
    record('pollinations', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock' });
  }
  const seed = Date.now() % 1_000_000;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent('a glowing neon concert stage')}` +
    `?width=512&height=512&model=flux&seed=${seed}&nologo=true`;
  const result = await generateImageLive('pollinations', url, { headers: { 'User-Agent': 'cohear/0.1' } });
  res.status(result.ok ? 200 : 502).json({ ok: result.ok, mode: 'live', bytes: result.bytes || 0, error: result.ok ? null : result.error });
});

router.get('/huggingface/probe', async (_req, res) => {
  if (isMock('huggingface')) {
    record('huggingface', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock' });
  }
  const url = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
  const result = await generateImageLive('huggingface', url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'a glowing neon concert stage', parameters: { width: 512, height: 512 } }),
  });
  res.status(result.ok ? 200 : 502).json({ ok: result.ok, mode: 'live', bytes: result.bytes || 0, error: result.ok ? null : result.error });
});

// --- Cerebras / Groq (free-tier text generation) -------------------------
// Both expose an OpenAI-compatible Chat Completions API, so one helper covers
// both: POST {baseUrl}/chat/completions with a Bearer key. Text only — neither
// generates images (Groq has vision = image *understanding*, not generation).
const FREE_LLM = {
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    defaultModel: process.env.CEREBRAS_TEXT_MODEL || 'gpt-oss-120b',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
  },
};

async function chatCompletion(id, { prompt, system, model, maxTokens }) {
  const cfg = FREE_LLM[id];
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const result = await callLive(id, `${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env[cfg.keyEnv]}`,
    },
    body: JSON.stringify({
      model: model || cfg.defaultModel,
      messages,
      // Reasoning models (e.g. gpt-oss-120b) spend tokens thinking before they
      // emit content, so give a generous default budget or `content` comes back
      // empty (finish_reason: length).
      max_tokens: maxTokens || 1024,
    }),
  });
  return result;
}

// Pull the assistant text out of an OpenAI-compatible response (live or mock).
// Reasoning models may leave `content` empty and put the answer (or its
// chain-of-thought) under `reasoning` — fall back to that so the UI isn't blank.
function extractText(data) {
  const msg = data?.choices?.[0]?.message || {};
  return msg.content || msg.reasoning || msg.reasoning_content || '';
}

for (const id of ['cerebras', 'groq']) {
  // Text generation — POST { prompt, system?, model?, maxTokens? } -> { text }.
  router.post(`/${id}/generate`, express.json({ limit: '64kb' }), async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

    if (isMock(id)) {
      const mock = await serveMock(id);
      return res.json({ ok: true, mode: 'mock', text: extractText(mock.data), model: 'mock' });
    }

    const result = await chatCompletion(id, {
      prompt,
      system: req.body?.system ? String(req.body.system) : '',
      model: req.body?.model ? String(req.body.model) : '',
      maxTokens: Number(req.body?.maxTokens) || 0,
    });
    if (!result.ok) {
      const msg = result.data?.error?.message || `HTTP ${result.status}`;
      return res.status(502).json({ ok: false, mode: 'live', error: msg });
    }
    res.json({
      ok: true,
      mode: 'live',
      model: result.data?.model || '',
      text: extractText(result.data),
    });
  });

  // Dashboard "Probe" — a tiny live ping so usage stats populate (GET).
  router.get(`/${id}/probe`, async (_req, res) => {
    if (isMock(id)) return res.json(await serveMock(id));
    const result = await chatCompletion(id, {
      prompt: 'Reply with the single word: ok',
      maxTokens: 5,
    });
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: 'live',
      model: result.data?.model || '',
      text: extractText(result.data),
      error: result.ok ? null : result.data?.error?.message || `HTTP ${result.status}`,
    });
  });
}

// --- Cyanite: real mood / energy / BPM for the actual setlist song -------
// Cyanite is GraphQL and analyzes AUDIO — but it ingests a YouTube source on
// ITS side, so we never host or split the master (unlike a stem API). Flow:
//   youTubeTrackEnqueue(videoUrl) -> libraryTrack.id -> poll audioAnalysisV6.
// Analysis is async (~45s) and costs a credit per distinct song, so results are
// cached to disk: `node --watch` restarts (and replays) never re-spend. The
// client calls this repeatedly for the current song; we enqueue once, then each
// call polls until FINISHED.
const CYANITE_GQL = 'https://api.cyanite.ai/graphql';
const CYANITE_CACHE_FILE = new URL('../.cyanite-cache.json', import.meta.url);

function loadCyaniteCache() {
  try { return new Map(Object.entries(JSON.parse(readFileSync(CYANITE_CACHE_FILE, 'utf8')))); }
  catch { return new Map(); }
}
const cyaniteCache = loadCyaniteCache(); // 'artist|song' -> { status, trackId, result }
function saveCyaniteCache() {
  try { writeFileSync(CYANITE_CACHE_FILE, JSON.stringify(Object.fromEntries(cyaniteCache))); } catch { /* ignore */ }
}

async function cyaniteGql(query, variables) {
  return callLive('cyanite', CYANITE_GQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CYANITE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
}

// Resolve a song to a YouTube videoId (Cyanite's ingestion source). Reuses the
// YouTube key; cached implicitly because we only call it once per new song.
async function youtubeVideoId(q) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const r = await callLive('youtube', `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(q)}&key=${key}`);
  return r.data?.items?.[0]?.id?.videoId || null;
}

// Russell circumplex -> a room accent color (valence/arousal in ~[-1,1]).
function moodColor(valence, arousal) {
  if (valence == null) return '#a78bfa';
  if (valence >= 0.2 && (arousal ?? 0) >= 0) return '#fb7185'; // happy + energetic
  if (valence >= 0.2) return '#f59e0b'; // warm / content
  if (valence < -0.1 && (arousal ?? 0) >= 0.1) return '#f43f5e'; // tense / intense
  if (valence < -0.1) return '#6366f1'; // sad / calm
  return '#a78bfa'; // neutral
}

function simplifyMood(r) {
  if (!r) return null;
  return {
    valence: r.valence ?? null,
    arousal: r.arousal ?? null,
    bpm: Math.round(r.bpmRangeAdjusted || 0) || null,
    energyLevel: r.energyLevel || null,
    moodTags: r.moodTags || [],
    genreTags: r.genreTags || [],
    characterTags: r.characterTags || [],
    movementTags: r.movementTags || [],
    caption: r.transformerCaption || '',
    color: moodColor(r.valence, r.arousal),
  };
}

const CYANITE_ENQUEUE = `mutation Enqueue($input: YouTubeTrackEnqueueInput!) {
  youTubeTrackEnqueue(input: $input) {
    __typename
    ... on YouTubeTrackEnqueueSuccess { enqueuedLibraryTrack { id } }
    ... on YouTubeTrackEnqueueError { message code }
  }
}`;
const CYANITE_ANALYSIS = `query Analysis($id: ID!) {
  libraryTrack(id: $id) {
    __typename
    ... on LibraryTrack {
      id
      audioAnalysisV6 {
        __typename
        ... on AudioAnalysisV6Finished {
          result { valence arousal bpmRangeAdjusted energyLevel moodTags genreTags characterTags movementTags transformerCaption }
        }
      }
    }
  }
}`;

// Deterministic mock so the feature renders identically with no key / in mock mode.
function mockMood(song) {
  const h = [...String(song)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const valence = ((h % 200) - 100) / 100; // -1..1
  const arousal = (((h * 7) % 200) - 100) / 100;
  const energy = ['low', 'medium', 'high'][h % 3];
  const moods = [['uplifting', 'happy'], ['romantic', 'sad'], ['energetic', 'powerful'], ['dreamy', 'chilled']][h % 4];
  return {
    valence, arousal, bpm: 80 + (h % 80), energyLevel: energy,
    moodTags: moods, genreTags: ['pop'], characterTags: ['warm'], movementTags: ['flowing'],
    caption: `${energy} ${moods[0]} track (demo mood — set CYANITE_API_KEY for real analysis)`,
    color: moodColor(valence, arousal),
  };
}

router.post('/cyanite/analyze', express.json(), async (req, res) => {
  const song = String(req.body?.song || '').trim();
  const artist = String(req.body?.artist || '').trim();
  let videoId = String(req.body?.videoId || '').trim();
  if (!song) return res.status(400).json({ ok: false, error: 'song required' });
  const ck = `${artist}|${song}`.toLowerCase();

  if (isMock('cyanite')) {
    record('cyanite', { status: 200, latencyMs: 0, bytes: song.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', status: 'finished', result: mockMood(song) });
  }

  const entry = cyaniteCache.get(ck) || {};
  if (entry.status === 'finished' && entry.result) {
    return res.json({ ok: true, mode: 'live', status: 'finished', result: entry.result, cached: true });
  }

  // Enqueue once (needs a YouTube source).
  let trackId = entry.trackId;
  if (!trackId) {
    if (!videoId) videoId = await youtubeVideoId(`${artist} ${song} official audio`);
    if (!videoId) return res.json({ ok: false, status: 'error', error: 'no youtube source for song' });
    const enq = await cyaniteGql(CYANITE_ENQUEUE, { input: { videoUrl: `https://www.youtube.com/watch?v=${videoId}` } });
    const out = enq.data?.data?.youTubeTrackEnqueue;
    if (out?.__typename !== 'YouTubeTrackEnqueueSuccess') {
      return res.status(502).json({ ok: false, status: 'error', error: out?.message || enq.data?.errors?.[0]?.message || 'enqueue failed' });
    }
    trackId = out.enqueuedLibraryTrack.id;
    cyaniteCache.set(ck, { status: 'pending', trackId });
    saveCyaniteCache();
  }

  // Poll once; the client re-calls until finished.
  const pr = await cyaniteGql(CYANITE_ANALYSIS, { id: trackId });
  const a = pr.data?.data?.libraryTrack?.audioAnalysisV6;
  if (a?.__typename === 'AudioAnalysisV6Finished') {
    const result = simplifyMood(a.result);
    cyaniteCache.set(ck, { status: 'finished', trackId, result });
    saveCyaniteCache();
    return res.json({ ok: true, mode: 'live', status: 'finished', result });
  }
  if (a && /Failed|NotAuthorized|NotFound/.test(a.__typename)) {
    cyaniteCache.set(ck, { status: 'error', trackId });
    saveCyaniteCache();
    return res.json({ ok: false, mode: 'live', status: 'error', error: a.__typename });
  }
  return res.json({ ok: true, mode: 'live', status: 'pending', trackId });
});

// --- LALAL.AI: stem separation (Suno tracks -> karaoke instrumental) ------
// Async, metered API (charges processing minutes). Flow:
//   upload bytes -> /split (stem) -> poll /check until task.state === success.
// Auth header is `Authorization: license <key>`. We only feed RIGHTS-CLEAR audio
// we host (Suno `audio_url`), never a copyrighted master. Results disk-cached by
// audioUrl+stem so re-runs don't re-spend minutes.
const LALAL_BASE = 'https://www.lalal.ai/api';
const LALAL_CACHE_FILE = new URL('../.lalalai-cache.json', import.meta.url);
function loadLalalCache() {
  try { return new Map(Object.entries(JSON.parse(readFileSync(LALAL_CACHE_FILE, 'utf8')))); }
  catch { return new Map(); }
}
const lalalCache = loadLalalCache(); // 'audioUrl|stem' -> { status, fileId, stems }
function saveLalalCache() {
  try { writeFileSync(LALAL_CACHE_FILE, JSON.stringify(Object.fromEntries(lalalCache))); } catch { /* ignore */ }
}
const lalalAuth = () => `license ${process.env.LALALAI_API_KEY}`;

async function lalalUpload(audioUrl, filename) {
  const a = await fetch(audioUrl, { headers: { 'User-Agent': BROWSER_UA } });
  if (!a.ok) return { ok: false, error: `fetch audio failed (HTTP ${a.status})` };
  const buf = Buffer.from(await a.arrayBuffer());
  const start = Date.now();
  const r = await fetch(`${LALAL_BASE}/upload/`, {
    method: 'POST',
    headers: {
      Authorization: lalalAuth(),
      'Content-Type': a.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${(filename || 'track.mp3').replace(/[^\w.\- ]/g, '_')}"`,
    },
    body: buf,
  });
  const d = await r.json().catch(() => ({}));
  const ok = r.ok && d.status === 'success';
  record('lalalai', { status: r.status, latencyMs: Date.now() - start, bytes: buf.length, mode: 'live', error: ok ? null : (d.error || `HTTP ${r.status}`) });
  return ok ? { ok: true, id: d.id, duration: d.duration } : { ok: false, error: d.error || `upload failed (HTTP ${r.status})` };
}

async function lalalSplit(fileId, stem) {
  const params = JSON.stringify([{ id: fileId, stem, splitter: 'phoenix', enhanced_processing_enabled: false, noise_cancelling_level: 0, dereverb_enabled: false }]);
  const r = await fetch(`${LALAL_BASE}/split/`, {
    method: 'POST',
    headers: { Authorization: lalalAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ params }),
  });
  const d = await r.json().catch(() => ({}));
  record('lalalai', { status: r.status, latencyMs: 0, bytes: 0, mode: 'live', error: d.status === 'success' ? null : (d.error || `HTTP ${r.status}`) });
  return d.status === 'success' ? { ok: true } : { ok: false, error: d.error || `split failed (HTTP ${r.status})` };
}

async function lalalCheck(fileId) {
  const r = await fetch(`${LALAL_BASE}/check/`, {
    method: 'POST',
    headers: { Authorization: lalalAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: fileId }),
  });
  return r.json().catch(() => ({}));
}

router.post('/lalalai/split', express.json(), async (req, res) => {
  const audioUrl = String(req.body?.audioUrl || '').trim();
  const title = String(req.body?.title || 'track').slice(0, 80);
  const stem = String(req.body?.stem || 'vocals'); // 'vocals' -> isolates vocals; back_track = instrumental
  if (!/^https?:\/\//i.test(audioUrl)) return res.status(400).json({ ok: false, error: 'valid audioUrl required' });
  const ck = `${audioUrl}|${stem}`;

  if (isMock('lalalai')) {
    const m = await serveMock('lalalai');
    const split = m.data?.task?.split || {};
    return res.json({ ok: true, mode: 'mock', status: 'done', stems: { vocals: split.vocals_url, instrumental: split.instrumental_url } });
  }

  const entry = lalalCache.get(ck) || {};
  if (entry.status === 'done' && entry.stems) {
    return res.json({ ok: true, mode: 'live', status: 'done', stems: entry.stems, cached: true });
  }

  // Upload + kick off the split once (this is what spends minutes).
  let fileId = entry.fileId;
  if (!fileId) {
    const up = await lalalUpload(audioUrl, `${title}.mp3`);
    if (!up.ok) return res.status(502).json({ ok: false, status: 'error', error: up.error });
    fileId = up.id;
    const sp = await lalalSplit(fileId, stem);
    if (!sp.ok) return res.status(502).json({ ok: false, status: 'error', error: sp.error });
    lalalCache.set(ck, { status: 'pending', fileId });
    saveLalalCache();
  }

  // Poll; the client re-calls until done.
  const d = await lalalCheck(fileId);
  const t = d?.result?.[fileId];
  const state = t?.task?.state;
  if (state === 'success' && t.split) {
    // stem_track = the isolated stem (vocals); back_track = the remainder (instrumental).
    const stems = stem === 'vocals'
      ? { vocals: t.split.stem_track, instrumental: t.split.back_track }
      : { [stem]: t.split.stem_track, rest: t.split.back_track };
    lalalCache.set(ck, { status: 'done', fileId, stems });
    saveLalalCache();
    return res.json({ ok: true, mode: 'live', status: 'done', stems });
  }
  if (state === 'error' || state === 'cancelled') {
    lalalCache.set(ck, { status: 'error', fileId });
    saveLalalCache();
    return res.json({ ok: false, mode: 'live', status: 'error', error: t?.task?.error || state });
  }
  return res.json({ ok: true, mode: 'live', status: 'pending', progress: t?.task?.progress ?? 0 });
});

// --- Stub services (mock only until keys arrive) -------------------------
for (const id of ['elevenlabs']) {
  router.get(`/${id}/ping`, async (_req, res) => {
    const result = await serveMock(id);
    res.json(result);
  });
}

// --- Suno: unified multi-account library --------------------------------
// Reads all 6 accounts from suno-dl/accounts.json and fans the live feed out
// across them in parallel. Defaults to LIVE (creds are local & free); pass
// ?source=mock to force the canned payload, or it falls back to mock on failure.

// Auth status for every account — "see all accounts at once".
router.get('/suno/accounts', async (_req, res) => {
  try {
    res.json({ ok: true, accounts: await listAccounts() });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Merged library feed across ALL accounts. ?page=N&pages=M&source=live|mock
router.get('/suno/feed', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 0;
  const pages = parseInt(req.query.pages, 10) || 1;
  if (req.query.source === 'mock') return res.json(await serveMock('suno'));
  try {
    const result = await feedAll({ page, pages });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    record('suno', { status: 0, latencyMs: 0, bytes: 0, mode: 'live', error: e.message });
    res.status(502).json(await serveMock('suno').then((m) => ({ ...m.data, _liveError: e.message })));
  }
});

// --- BYOC generation pool ------------------------------------------------
// Fans join a show and contribute capacity; scene/generate picks the best
// available provider with quota and always falls back to free Pollinations.

// A fan joins a show (creates/refreshes their identity + show membership).
router.post('/byoc/join', express.json(), (req, res) => {
  const { userId, name, showId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json(pool.join(userId, name, showId));
});

// Contribute capacity. v1 wires Meta workers (browser extension) end-to-end;
// the free Pollinations floor is always present. (Gemini/HF key pooling next.)
router.post('/byoc/contribute', express.json(), (req, res) => {
  const { userId, type = 'meta', name, capPerDay } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (type !== 'meta') {
    return res.status(400).json({ error: `only 'meta' is wired in v1 (Gemini/HF key pooling is next)` });
  }
  res.json(pool.contribute(userId, { type, name, capPerDay }));
});

// Live pool status for a show — drives the "N fans contributing X gens" UI.
router.get('/byoc/pool', (req, res) => {
  res.json({ ok: true, ...pool.poolStatus(req.query.showId) });
});

// --- Meta worker relay (the Reverb extension running in a fan's browser) ---
router.post('/byoc/worker/heartbeat', express.json(), (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json({ ok: true, workers: pool.heartbeat(userId) });
});

// Extension long-poll: hands back the next job for this user, or 204 if none.
router.get('/byoc/worker/poll', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  pool.heartbeat(userId);
  const job = pool.claimJob(userId);
  if (!job) return res.status(204).end();
  res.json({ ok: true, job: { id: job.id, prompt: job.prompt } });
});

// Extension posts the generated image (or an error) back.
router.post('/byoc/worker/result', express.json({ limit: '16mb' }), (req, res) => {
  const { jobId, imageUrl, error } = req.body || {};
  if (!jobId) return res.status(400).json({ error: 'jobId required' });
  res.json(pool.completeJob(jobId, { imageUrl, error }));
});

// --- Unified scene generation with fallback chain ------------------------
async function runProvider(p, prompt) {
  if (p.type === 'pollinations') {
    const seed = Date.now() % 100000;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&model=flux&seed=${seed}`;
    return { ok: true, imageUrl: url };
  }
  if (p.type === 'meta') {
    const job = pool.enqueueMeta(p, prompt);
    const deadline = Date.now() + 25000; // wait up to 25s for the fan's browser
    while (Date.now() < deadline) {
      await sleep(800);
      const j = pool.getJob(job.id);
      if (j.status === 'done') return { ok: true, imageUrl: j.result };
      if (j.status === 'failed') return { ok: false, error: j.error };
    }
    return { ok: false, error: 'meta worker timeout (no browser fulfilled it)' };
  }
  return { ok: false, error: `unsupported provider: ${p.type}` };
}

router.post('/scene/generate', express.json(), async (req, res) => {
  const { prompt, showId, preferType } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const tried = [];
  const exclude = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const p = pool.pick(showId, { preferType, exclude });
    if (!p) break;
    tried.push(p.type);
    const r = await runProvider(p, prompt);
    if (r.ok) {
      pool.recordUse(p.id);
      return res.json({ ok: true, provider: p.type, owner: p.owner, imageUrl: r.imageUrl, tried });
    }
    exclude.push(p.id);
  }
  res.status(502).json({ ok: false, error: 'all providers failed', tried });
});

// --- Synthesize a missing performance (full pipeline) -------------------
// YouTube/Music audio -> Suno seed (stub) -> AI visuals (pool) -> slideshow.
router.post('/pipeline/synthesize', express.json(), async (req, res) => {
  const { song, showId, youtubeUrl, audioUrl, imageCount, videoMode } = req.body || {};
  try {
    const result = await synthesize({ song, showId, youtubeUrl, audioUrl, imageCount, videoMode });
    res.json(result);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ========================================================================
// COHERE — live, synchronized "be there from anywhere" experience.
// ========================================================================

// Lightweight clock-sync endpoint: the client measures round-trip and computes
// its offset from server time so a skewed laptop clock still locks on.
router.get('/live/time', (_req, res) => {
  res.json({ now: Date.now() });
});

// The featured shows (Post Malone live + Madison Beer replay) — always work.
router.get('/live/featured', async (_req, res) => {
  try {
    const events = await live.getFeaturedList();
    res.json({ ok: true, events, event: events[0] || null });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Full event snapshot (static timeline + live correction + crowd clips).
// Polled by the room every few seconds for the shared corrected clock.
router.get('/live/event/:id', (req, res) => {
  const event = live.getEvent(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: 'event not found' });
  res.json({ ok: true, event });
});

// Turn any artist (optionally a real past date/venue) into a live/replay room.
router.post('/live/resolve', express.json(), async (req, res) => {
  try {
    const event = await live.resolveEvent(req.body || {});
    if (!event) return res.status(404).json({ ok: false, error: 'no setlist found for that artist' });
    res.json({ ok: true, event });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Crowd beacon: an attendee taps "they just started song #idx". Server-stamped,
// so no client clock is trusted. Median drift corrects the room for everyone.
router.post('/live/beacon', express.json(), (req, res) => {
  const { eventId, songIndex, userId } = req.body || {};
  const out = live.addBeacon(eventId, { songIndex, userId });
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

// Crowd-curated fan-clip wall: submit a clip URL, or upvote one.
router.post('/live/clip', express.json(), (req, res) => {
  const { eventId, url, platform, title, userId, songIndex } = req.body || {};
  const out = live.addClip(eventId, { url, platform, title, userId, songIndex });
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

router.post('/live/clip/vote', express.json(), (req, res) => {
  const { eventId, clipId } = req.body || {};
  const out = live.voteClip(eventId, clipId);
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

// Fan footage of the ACTUAL event: fresh uploads (publishedAfter + order=date)
// and active livestreams (eventType=live) — not old concerts. Each result is
// enriched with viewCount + publishedAt (one videos.list call) so the UI can
// sort by views / upload time / title. Returns a flat `items` array.
router.get('/live/youtube', async (req, res) => {
  const q = String(req.query.q || '').trim() || 'concert';
  const sinceIso = String(req.query.since || '').trim(); // RFC3339
  const wantLive = String(req.query.live || '') === '1';
  const windowHours = Number(req.query.hours) || 24;

  if (isMock('youtube')) {
    return res.json(await serveMock('youtube'));
  }
  const key = process.env.YOUTUBE_API_KEY;
  const base = (extra) =>
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12` +
    `&q=${encodeURIComponent(q)}&order=date${extra}&key=${key}`;

  const since = sinceIso || new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  // Active livestreams (the true real-time window) + fresh uploads.
  const live = [];
  if (wantLive) {
    const liveRes = await callLive('youtube', base('&eventType=live'));
    for (const i of liveRes.data?.items || []) if (i?.id?.videoId) live.push({ ...i, _live: true });
  }
  const freshRes = await callLive('youtube', base(`&publishedAfter=${encodeURIComponent(since)}`));
  const fresh = (freshRes.data?.items || []).filter((i) => i?.id?.videoId);

  const apiErr = freshRes.data?.error;
  let error = null;
  if (apiErr) error = /quota/i.test(apiErr.errors?.[0]?.reason || '') || apiErr.code === 403 ? 'quota' : 'api';

  // Merge + de-dupe, then enrich with view counts in one batched call.
  const seen = new Set();
  const merged = [...live, ...fresh].filter((i) => {
    const id = i.id.videoId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const views = {};
  if (merged.length && !error) {
    const ids = merged.map((i) => i.id.videoId).join(',');
    const statRes = await callLive('youtube', `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${key}`);
    for (const v of statRes.data?.items || []) views[v.id] = Number(v.statistics?.viewCount) || 0;
  }

  const items = merged.map((i) => ({
    videoId: i.id.videoId,
    title: i.snippet?.title || '',
    channel: i.snippet?.channelTitle || '',
    publishedAt: i.snippet?.publishedAt || '',
    views: views[i.id.videoId] ?? null,
    live: Boolean(i._live),
  }));

  res.json({ ok: !error, items, error });
});

// Multi-platform fan footage via RapidAPI (TikTok / Instagram / X). `platform`
// = 'all' (default) fans out to all three concurrently; or a single platform.
// Returns normalized items (source, url, title, author, views, ts) the live
// feed merges with YouTube + embeds with a source badge.
router.get('/live/social', async (req, res) => {
  if (!rapid.hasRapid()) return res.json({ ok: false, error: 'no RapidAPI key', items: [] });
  const q = String(req.query.q || '').trim();
  const artist = String(req.query.artist || '').trim();
  const platform = String(req.query.platform || 'all');
  const igUser = String(req.query.username || '') || rapid.igHandle(artist);

  try {
    if (platform !== 'all') {
      const r = await rapid.searchSocial(platform, { q, username: igUser });
      return res.json(r);
    }
    const [tt, x, ig] = await Promise.allSettled([
      rapid.searchTikTok(q),
      rapid.searchX(q),
      rapid.searchInstagram(igUser),
    ]);
    const items = [
      ...(tt.status === 'fulfilled' ? tt.value : []),
      ...(x.status === 'fulfilled' ? x.value : []),
      ...(ig.status === 'fulfilled' ? ig.value : []),
    ];
    res.json({ ok: true, items });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message, items: [] });
  }
});

export default router;
