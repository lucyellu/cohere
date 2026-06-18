// Cohear — the live engine.
//
// Cohear turns a concert into a SHARED SYNCHRONIZED CLOCK: everyone on earth
// locks to the same absolute (UTC) instant, so the 50k people in the stadium and
// the person watching from their bedroom are on the same song at the same moment.
//
// There is no API anywhere that streams "song currently playing at concert X",
// so the timeline is built in three layers:
//   1. PREDICT  — start time + setlist order (setlist.fm) + a duration model.
//   2. CORRECT  — attendees tap "they just started ___"; we take the median drift
//                 of recent beacons and shift the whole timeline (banter, late
//                 starts, extended outros are exactly this residual error).
//   3. CONFIRM  — fresh fan uploads / livestreams (handled in routes.js + the UI).
//
// State is in-memory (same pattern as genpool.js). Timeline math lives here;
// the browser computes "what's playing now" from the timeline + a synced clock.

import { record } from './usage.js';

// --- Duration model ------------------------------------------------------
// Studio length isn't returned cheaply per-song, and live differs anyway, so we
// model an average performed-song length + a between-song gap (banter, walk,
// intro). The crowd-tap correction erases the residual drift.
const SONG_SEC = 235; // ~3:55 performed
const GAP_SEC = 35; // between songs
const OPENER_SEC = 0; // headliner offset baked into startUTC instead

// Keep only beacons from the last 12 minutes when computing the correction —
// drift is current, not cumulative-from-doors.
const BEACON_WINDOW_MS = 12 * 60 * 1000;

// ---- In-memory store ----------------------------------------------------
const events = new Map(); // id -> event

// ---- Timezone helpers (no API needed; Intl knows every IANA zone) -------
// Offset (ms) of a tz at a given UTC instant. Standard formatToParts trick.
function tzOffsetMs(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const m = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) m[p.type] = p.value;
  const asIfUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +(m.hour % 24), +m.minute, +m.second);
  return asIfUtc - utcMs;
}

// Convert a wall-clock time IN a tz to a UTC epoch (ms).
function zonedToUtc(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - tzOffsetMs(tz, guess);
}

// Today's Y/M/D as seen in a tz (so "tonight's show" is tonight at the venue).
function todayInTz(tz, nowMs = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, mo, d] = dtf.format(new Date(nowMs)).split('-').map(Number);
  return { y, mo, d };
}
const pad = (n) => String(n).padStart(2, '0');
function isoToday(tz) {
  const { y, mo, d } = todayInTz(tz);
  return `${y}-${pad(mo)}-${pad(d)}`;
}
function dmyToday(tz) {
  const { y, mo, d } = todayInTz(tz);
  return `${pad(d)}-${pad(mo)}-${y}`;
}

// ---- Real per-song durations (Musixmatch track length) ------------------
// Replaces the flat estimate with each song's actual recorded length, so the
// predicted timeline drifts far less. Cached across events + rebuilds; fetched
// with limited concurrency to respect Musixmatch rate limits. Falls back to the
// estimate per song when a track isn't found.
const durCache = new Map(); // 'artist|song' -> seconds

async function fetchDurations(artist, songs) {
  const key = process.env.MUSIXMATCH_API_KEY;
  const fetchOne = async (song) => {
    const ck = `${artist}|${song}`.toLowerCase();
    if (durCache.has(ck)) return durCache.get(ck);
    let sec = SONG_SEC;
    if (key) {
      try {
        const url =
          `https://api.musixmatch.com/ws/1.1/track.search?q_track=${encodeURIComponent(song)}` +
          `&q_artist=${encodeURIComponent(artist)}&page_size=1&s_track_rating=desc&apikey=${key}`;
        const r = await fetch(url);
        const d = await r.json().catch(() => ({}));
        const len = d?.message?.body?.track_list?.[0]?.track?.track_length;
        if (len && len > 45 && len < 900) sec = len; // sanity-bound (45s–15m)
      } catch {
        /* keep estimate */
      }
    }
    durCache.set(ck, sec);
    return sec;
  };
  // Limited concurrency (5 at a time).
  const out = new Array(songs.length);
  let i = 0;
  async function worker() {
    while (i < songs.length) {
      const idx = i++;
      out[idx] = await fetchOne(songs[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, songs.length) }, worker));
  return out;
}

async function fetchTopTracks(artist) {
  const key = process.env.MUSIXMATCH_API_KEY;
  if (!key || !artist) return [];
  const start = Date.now();
  try {
    const p = new URLSearchParams({ apikey: key, q_artist: artist, s_track_rating: 'desc', page_size: '15' });
    const r = await fetch(`https://api.musixmatch.com/ws/1.1/track.search?${p.toString()}`);
    const d = await r.json().catch(() => ({}));
    record('musixmatch', { status: r.status, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: r.ok ? null : `HTTP ${r.status}` });
    if (!r.ok) return [];
    const wanted = artist.toLowerCase();
    const seen = new Set();
    const out = [];
    for (const item of d?.message?.body?.track_list || []) {
      const t = item.track || {};
      const name = t.track_name;
      if (!name || seen.has(name.toLowerCase())) continue;
      if (t.artist_name && !t.artist_name.toLowerCase().includes(wanted)) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
    return out.slice(0, 12);
  } catch (e) {
    record('musixmatch', { status: 0, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: e.message });
    return [];
  }
}

// Live performances run longer than the studio cut (extended intros/outros,
// crowd moments), so scale the recorded length up a touch for the prediction.
const LIVE_FACTOR = 1.15;

// Refine an event's timeline with real durations in the background (non-blocking
// so the landing/room render instantly on the estimate, then tighten).
function enrichDurations(ev) {
  fetchDurations(ev.artist, ev.songs)
    .then((durs) => {
      const live = durs.map((d) => Math.round(d * LIVE_FACTOR));
      ev.durations = live;
      ev.timeline = buildTimeline(ev.songs, ev.startUTC, live);
    })
    .catch(() => {});
}

// ---- Timeline -----------------------------------------------------------
// Compose per-song UTC start times from a start instant + duration model.
function buildTimeline(songs, startUTC, durations) {
  let t = startUTC + OPENER_SEC * 1000;
  return songs.map((song, i) => {
    const durSec = Math.round(durations?.[i] || SONG_SEC);
    const startMs = t;
    t += durSec * 1000 + GAP_SEC * 1000;
    return { i, song, startMs, durSec };
  });
}

// Total predicted show length (ms), for the map "ends ~" label.
function showLengthMs(timeline) {
  if (!timeline.length) return 0;
  const last = timeline[timeline.length - 1];
  return last.startMs + last.durSec * 1000 - timeline[0].startMs;
}

// ---- Crowd drift correction --------------------------------------------
// A beacon = "song K just started" (we stamp it with server-receive time, so it
// needs no client clock). correction = median(beaconTime - predictedStart[K]).
function recomputeCorrection(ev) {
  const now = Date.now();
  const fresh = ev.beacons.filter((b) => now - b.ts < BEACON_WINDOW_MS);
  if (!fresh.length) {
    ev.correctionMs = 0;
    ev.beaconCount = 0;
    return;
  }
  // Real shows drift by minutes (late start, long banter), never hours — clamp
  // out absurd taps so one stray/troll beacon can't yank the clock for everyone.
  const MAX_DRIFT = 3 * 3600 * 1000;
  const drifts = fresh
    .map((b) => {
      const slot = ev.timeline[b.songIndex];
      return slot ? b.ts - slot.startMs : null;
    })
    .filter((x) => x != null && Math.abs(x) < MAX_DRIFT)
    .sort((a, b) => a - b);
  ev.correctionMs = drifts.length ? drifts[Math.floor(drifts.length / 2)] : 0;
  ev.beaconCount = fresh.length;
  // De-dupe contributors for the "N people syncing" label.
  ev.beaconPeople = new Set(fresh.map((b) => b.userId)).size;
}

// ---- Public snapshot ----------------------------------------------------
function snapshot(ev) {
  return {
    id: ev.id,
    artist: ev.artist,
    venue: ev.venue,
    city: ev.city,
    country: ev.country,
    lat: ev.lat,
    lng: ev.lng,
    tz: ev.tz,
    startUTC: ev.startUTC,
    opener: ev.opener,
    openerStartUTC: ev.openerStartUTC,
    mode: ev.mode, // 'live' | 'replay'
    songsSource: ev.songsSource, // 'setlistfm' | 'fallback'
    setlistDate: ev.setlistDate || null,
    exact: Boolean(ev.exact), // true once tonight's REAL setlist is loaded
    timeline: ev.timeline,
    showLengthMs: showLengthMs(ev.timeline),
    correctionMs: ev.correctionMs || 0,
    clips: [...ev.clips].sort((a, b) => b.votes - a.votes).slice(0, 24),
    serverNow: Date.now(),
  };
}

// ---- setlist.fm: real recent setlist ------------------------------------
// Picks an exact-date match if `date` is given, else a show in `cityPref` if
// given (e.g. "Vancouver"), else the most recent show with songs.
async function fetchSetlist(artist, { date, cityPref } = {}) {
  const key = process.env.SETLISTFM_API_KEY;
  if (!key || !key.trim()) return null;
  const start = Date.now();
  try {
    const url = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist)}&p=1`;
    const r = await fetch(url, { headers: { 'x-api-key': key, Accept: 'application/json' } });
    const data = await r.json().catch(() => ({}));
    record('setlistfm', { status: r.status, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: r.ok ? null : `HTTP ${r.status}` });
    if (!r.ok) return null;
    const setlists = (data?.setlist || []).filter((s) => songsOf(s).length);
    const want = isoToDmy(String(date || '').slice(0, 10));
    const byCity = cityPref
      ? setlists.find((s) => (s.venue?.city?.name || '').toLowerCase().includes(cityPref.toLowerCase()))
      : null;
    const chosen = setlists.find((s) => s.eventDate === want) || byCity || setlists[0];
    if (!chosen) return null;
    return {
      songs: songsOf(chosen),
      date: chosen.eventDate,
      venue: chosen.venue?.name || '',
      city: chosen.venue?.city?.name || '',
    };
  } catch (e) {
    record('setlistfm', { status: 0, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: e.message });
    return null;
  }
}

function songsOf(s) {
  return (s?.sets?.set || []).flatMap((set) => (set.song || []).map((x) => x.name)).filter(Boolean);
}
function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Real-ish fallback setlists so the featured shows always work offline.
const POSTMALONE_FALLBACK = [
  'Wow.', 'Too Young', 'Better Now', 'I Fall Apart', 'Reputation', 'Goodbyes',
  'Saint-Tropez', 'Otherside', 'Chemical', 'Cooped Up', 'Circles', 'Wrapped Around Your Finger',
  'I Like You (A Happier Song)', 'White Iverson', 'Psycho', 'Congratulations', 'rockstar', 'Sunflower',
];
const MADISONBEER_FALLBACK = [
  'Make You Mine', 'Reckless', 'Home to Another One', 'Spinnin', 'Selfish', 'Good in Goodbye',
  'Default', '15 Minutes', 'Ryder', 'Yes Baby', 'Sweet Relief', 'Dangerous', 'Showed Me (How I Fell in Love with You)', 'Baby',
];

// ---- Event factory ------------------------------------------------------
function makeEvent({ id, artist, venue, city, country, lat, lng, tz, startUTC, mode, songs, songsSource, setlistDate, durations, opener, openerOffsetMin, exact, watchDateDmy }) {
  const timeline = buildTimeline(songs, startUTC, durations);
  // Most stadium shows have an opener: the announced "show time" is when THEY
  // start; the headliner's first song is ~openerOffsetMin later (= timeline[0]).
  const openerStartUTC = opener && openerOffsetMin ? startUTC - openerOffsetMin * 60000 : null;
  const ev = {
    id, artist, venue, city, country, lat, lng, tz, startUTC, mode,
    songs, songsSource, setlistDate, timeline,
    opener: opener || null, openerStartUTC,
    exact: Boolean(exact), // tonight's REAL setlist loaded (vs predicted order)
    watchDateDmy: watchDateDmy || null, // for live setlist polling
    lastSetlistCheck: 0,
    beacons: [], correctionMs: 0, beaconCount: 0, beaconPeople: 0,
    clips: [],
  };
  events.set(id, ev);
  return ev;
}

// ---- Live setlist polling -----------------------------------------------
// For a LIVE show, keep checking setlist.fm for tonight's exact-date setlist.
// Attendees often log it during/just after the show; the moment it appears we
// swap the predicted order (borrowed from the artist's last show) for the REAL
// one. Throttled, and stops once we have it. Fire-and-forget from getEvent.
const SETLIST_POLL_MS = 90 * 1000;
async function refreshLiveSetlist(ev) {
  if (ev.mode !== 'live' || ev.exact || !ev.watchDateDmy) return;
  const now = Date.now();
  if (now - ev.lastSetlistCheck < SETLIST_POLL_MS) return;
  ev.lastSetlistCheck = now;
  const sf = await fetchSetlist(ev.artist, { date: dmyToIso(ev.watchDateDmy) }).catch(() => null);
  if (sf?.date === ev.watchDateDmy && sf.songs.length) {
    ev.songs = sf.songs;
    ev.setlistDate = sf.date;
    ev.songsSource = 'setlistfm';
    ev.exact = true;
    ev.timeline = buildTimeline(sf.songs, ev.startUTC); // estimate first…
    enrichDurations(ev); // …then refine with real lengths
  }
}
function dmyToIso(dmy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// ---- Featured shows -----------------------------------------------------
// 1) Post Malone @ Rogers Stadium, Toronto — the new (2025) open-air stadium at
//    Downsview Park (NOT downtown by the CN Tower — that's Rogers *Centre*).
//    A LIVE/upcoming show: predict + crowd-correct.
// 2) Madison Beer @ Vancouver — a PAST show replayed in sync (real setlist.fm
//    setlist; great for fan footage since attendees have already uploaded).
const FEATURED = [
  {
    id: 'featured-postmalone-toronto',
    artist: 'Post Malone', venue: 'Rogers Stadium', city: 'Toronto', country: 'Canada',
    lat: 43.7460, lng: -79.4768, tz: 'America/Toronto', mode: 'live',
    opener: 'Jelly Roll', openerOffsetMin: 90, // Jelly Roll opens ~90 min before Posty
    fallback: POSTMALONE_FALLBACK,
  },
  {
    id: 'featured-madisonbeer-vancouver',
    artist: 'Madison Beer', venue: 'Doug Mitchell Thunderbird Sports Centre', city: 'Vancouver', country: 'Canada',
    lat: null, lng: null, tz: 'America/Vancouver', mode: 'replay', cityPref: 'Vancouver',
    fallback: MADISONBEER_FALLBACK,
  },
];

async function buildFeatured(cfg) {
  let ev = events.get(cfg.id);
  if (ev) return ev;

  // For a live show, try tonight's EXACT-date setlist first (usually empty until
  // attendees log it), else the artist's most recent — the live poller swaps in
  // the real one when it appears.
  const watchDateDmy = cfg.mode === 'live' ? dmyToday(cfg.tz) : null;
  const sf = await fetchSetlist(cfg.artist, {
    date: cfg.mode === 'live' ? isoToday(cfg.tz) : undefined,
    cityPref: cfg.cityPref,
  }).catch(() => null);
  const songs = sf?.songs?.length ? sf.songs : cfg.fallback;
  const exact = Boolean(sf?.date && watchDateDmy && sf.date === watchDateDmy);

  // Live shows: tonight 9pm local. Replays: anchor to the real show date 9pm local.
  let startUTC;
  if (cfg.mode === 'replay' && sf?.date) {
    const [dd, mm, yy] = sf.date.split('-').map(Number);
    startUTC = zonedToUtc(cfg.tz, yy, mm, dd, 21, 0);
  } else {
    const { y, mo, d } = todayInTz(cfg.tz);
    startUTC = zonedToUtc(cfg.tz, y, mo, d, 21, 0);
  }

  ev = makeEvent({
    id: cfg.id, artist: cfg.artist,
    venue: cfg.venue || sf?.venue || 'Venue',
    city: cfg.city, country: cfg.country,
    lat: cfg.lat, lng: cfg.lng, tz: cfg.tz,
    startUTC, mode: cfg.mode, songs,
    songsSource: sf?.songs?.length ? 'setlistfm' : 'fallback',
    setlistDate: sf?.date || null,
    opener: cfg.opener, openerOffsetMin: cfg.openerOffsetMin,
    exact, watchDateDmy,
  });
  enrichDurations(ev); // refine timing with real Musixmatch track lengths
  return ev;
}

// All featured shows (for the landing). Built once, then cached.
export async function getFeaturedList() {
  const built = await Promise.all(FEATURED.map((c) => buildFeatured(c).catch(() => null)));
  return built.filter(Boolean).map(snapshot);
}

// The primary featured show (kept for compatibility).
export async function getFeatured() {
  return snapshot(await buildFeatured(FEATURED[0]));
}

// ---- Resolve an arbitrary artist into a live/replay event ---------------
// `when`: 'live' uses tonight @ a generic time; 'replay' anchors to the real
// past show's date. Venue/coords come from the caller (globe) when available.
export async function resolveEvent({ artist, date, startDate, venue, city, country, lat, lng, tz, mode = 'live' }) {
  if (!artist) throw new Error('artist required');
  const zone = tz || 'America/New_York';
  const sf = await fetchSetlist(artist, { date, cityPref: city }).catch(() => null);
  const topTracks = sf?.songs?.length ? [] : await fetchTopTracks(artist).catch(() => []);
  const songs = sf?.songs?.length ? sf.songs : topTracks;
  if (!songs.length) return null;

  let startUTC;
  const exactStart = startDateToUtc(startDate, zone);
  if (exactStart) {
    startUTC = exactStart;
  } else if (mode === 'replay' && (sf?.date || date)) {
    const dmy = sf?.date || isoToDmy(String(date).slice(0, 10));
    const [dd, mm, yy] = dmy.split('-').map(Number);
    startUTC = zonedToUtc(zone, yy, mm, dd, 21, 0); // historical shows: assume 9pm local
  } else {
    const { y, mo, d } = todayInTz(zone);
    startUTC = zonedToUtc(zone, y, mo, d, 21, 0);
  }

  const id = `ev-${slug(artist)}-${sf?.date || date || 'live'}`;
  const ev = makeEvent({
    id, artist,
    venue: venue || sf?.venue || 'Venue',
    city: city || sf?.city || '',
    country: country || '',
    lat: Number(lat) || null,
    lng: Number(lng) || null,
    tz: zone,
    startUTC,
    mode,
    songs,
    songsSource: sf?.songs?.length ? 'setlistfm' : 'fallback',
    setlistDate: sf?.date || null,
    exact: mode === 'replay', // a chosen past show IS that show's real setlist
    watchDateDmy: mode === 'live' ? dmyToday(zone) : null,
  });
  enrichDurations(ev); // real per-song lengths
  return snapshot(ev);
}

function startDateToUtc(raw, zone) {
  if (!raw || !String(raw).includes('T')) return null;
  const value = String(raw);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return zonedToUtc(zone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// ---- Room operations ----------------------------------------------------
export function getEvent(id) {
  const ev = events.get(id);
  if (!ev) return null;
  refreshLiveSetlist(ev).catch(() => {}); // non-blocking: swaps in tonight's real setlist when logged
  return snapshot(ev);
}

export function addBeacon(id, { songIndex, userId }) {
  const ev = events.get(id);
  if (!ev) return null;
  const idx = Number(songIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ev.timeline.length) return { ok: false, error: 'bad songIndex' };
  ev.beacons.push({ songIndex: idx, userId: userId || 'anon', ts: Date.now() });
  recomputeCorrection(ev);
  return { ok: true, correctionMs: ev.correctionMs, beaconPeople: ev.beaconPeople, beaconCount: ev.beaconCount };
}

export function addClip(id, { url, platform, title, userId, songIndex }) {
  const ev = events.get(id);
  if (!ev) return null;
  const clean = String(url || '').trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false, error: 'valid url required' };
  // Tag the clip to a setlist song (its live timecode) when provided.
  const idx = Number.isInteger(Number(songIndex)) && Number(songIndex) >= 0 && Number(songIndex) < ev.timeline.length
    ? Number(songIndex)
    : null;
  const existing = ev.clips.find((c) => c.url === clean);
  if (existing) {
    existing.votes += 1;
    if (idx != null && existing.songIndex == null) existing.songIndex = idx;
    return { ok: true, clip: existing, deduped: true };
  }
  const clip = {
    id: `clip-${ev.clips.length + 1}-${Date.now().toString(36)}`,
    url: clean,
    platform: platform || detectPlatform(clean),
    title: String(title || '').slice(0, 140),
    songIndex: idx,
    song: idx != null ? ev.timeline[idx].song : null,
    votes: 1,
    by: userId || 'anon',
    ts: Date.now(),
  };
  ev.clips.push(clip);
  return { ok: true, clip };
}

export function voteClip(id, clipId) {
  const ev = events.get(id);
  if (!ev) return null;
  const clip = ev.clips.find((c) => c.id === clipId);
  if (!clip) return { ok: false, error: 'clip not found' };
  clip.votes += 1;
  return { ok: true, votes: clip.votes };
}

function detectPlatform(url) {
  if (/youtu\.?be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/(twitter|x)\.com/i.test(url)) return 'x';
  return 'link';
}
