// Shareable room links — turn a live room into a URL you can text to friends so
// they land in YOUR room (same synced clock, same presence channel), not on the
// generic Discover page.
//
// The link carries the room id (fast path: the gateway already has it once you've
// opened it) PLUS enough to re-resolve the same room if the gateway restarted or
// a friend arrives first. Everyone converges on the same event id, which is what
// keys the Supabase presence/chat channel (`room:${id}`).

import { getEvent, resolveEvent } from './liveApi.js';

function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(code) {
  try {
    const b64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

// setlist.fm dates are DD-MM-YYYY; resolveEvent wants an ISO-ish date.
function dmyToIso(d) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(d || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Accepts a resolved event OR a Discover concert (whatever fields are present).
function payloadFor(src) {
  const date =
    src.date ||
    dmyToIso(src.setlistDate) ||
    (src.startUTC ? new Date(src.startUTC).toISOString().slice(0, 10) : '');
  const songs = Array.isArray(src.songs) && src.songs.length
    ? src.songs.slice(0, 25)
    : (Array.isArray(src.setlist) && src.setlist.length ? src.setlist.slice(0, 25) : []);
  const durs = Array.isArray(src.durations) && src.durations.length ? src.durations.slice(0, 25) : null;
  return {
    i: src.id || '',
    a: src.artist || '',
    d: date,
    sd: src.startDate || '',
    v: src.venue || '',
    c: src.city || '',
    n: src.country || '',
    la: src.lat ?? null,
    lo: src.lng ?? null,
    tz: src.tz || src.timeZone || '',
    m: src.mode || (src.when === 'past' ? 'replay' : 'live'),
    s: songs,
    st: src.startUTC || null,
    dur: durs,
  };
}

export function roomUrl(src) {
  const code = b64urlEncode(payloadFor(src));
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  return u.toString();
}

export function currentRoomCode() {
  try {
    return new URLSearchParams(window.location.search).get('room') || '';
  } catch {
    return '';
  }
}

// Reflect the open room in the address bar (no navigation) so the URL is always
// shareable; pass null to clear it when leaving the room.
export function syncRoomUrl(src) {
  try {
    if (src) {
      window.history.replaceState(null, '', roomUrl(src));
    } else if (currentRoomCode()) {
      const u = new URL(window.location.href);
      u.search = '';
      u.hash = '';
      window.history.replaceState(null, '', u.toString());
    }
  } catch {
    /* ignore */
  }
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
    timeZone: tz || 'America/Vancouver',
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

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function fallbackSongsForArtist(artist) {
  const key = String(artist || '').toLowerCase();
  if (key.includes('bts')) return ['Dynamite', 'Butter', 'Boy With Luv', 'DNA', 'MIC Drop', 'Spring Day', 'Blood Sweat & Tears', 'Fake Love', 'IDOL', 'Life Goes On', 'Permission to Dance', 'Run BTS', 'Fire', 'Save ME', 'Euphoria', 'Black Swan', 'Yet To Come'];
  if (key.includes('bruno')) return ['24K Magic', 'Treasure', 'That’s What I Like', 'Leave the Door Open', 'Locked Out of Heaven', 'Just the Way You Are', 'Uptown Funk'];
  if (key.includes('harry')) return ['Music for a Sushi Restaurant', 'Golden', 'Adore You', 'Watermelon Sugar', 'Sign of the Times', 'As It Was', 'Kiwi'];
  if (key.includes('olivia')) return ['bad idea right?', 'vampire', 'drivers license', 'deja vu', 'traitor', 'good 4 u', 'all-american bitch'];
  if (key.includes('beyonce')) return ['Crazy in Love', 'Formation', 'Cuff It', 'Break My Soul', 'Love on Top', 'Texas Hold ’Em', 'Halo'];
  if (key.includes('madison')) return ['Make You Mine', 'Home to Another One', 'Reckless', 'Selfish', 'Good in Goodbye', 'Spinnin', 'Baby'];
  return ['Main Stage Opener', 'Hit Track 1', 'Hit Track 2', 'Acoustic Medley', 'Fan Favorite', 'Encore Finale'];
}

// Fast, synchronous event construction from the invite link payload (0ms render)
export function fastEventFromRoomCode(code) {
  const p = b64urlDecode(code);
  if (!p || !p.a) return null;
  const zone = p.tz || 'America/Vancouver';
  const startUTC = p.st || startMs(p.sd, p.d, zone);
  const songs = (Array.isArray(p.s) && p.s.length) ? p.s : fallbackSongsForArtist(p.a);
  const durs = Array.isArray(p.dur) && p.dur.length === songs.length ? p.dur : songs.map(() => 270);
  
  let cur = startUTC;
  const timeline = songs.map((song, idx) => {
    const durSec = durs[idx] || 270;
    const item = { i: idx, song, startMs: cur, durSec };
    cur += durSec * 1000;
    return item;
  });
  const showLengthMs = timeline.length
    ? (timeline[timeline.length - 1].startMs + timeline[timeline.length - 1].durSec * 1000) - startUTC
    : 0;

  return {
    id: p.i || `ev-${slug(p.a)}-${p.d || 'live'}`,
    artist: p.a,
    venue: p.v || 'Live Venue',
    city: p.c || '',
    country: p.n || '',
    lat: p.la ?? null,
    lng: p.lo ?? null,
    tz: zone,
    startUTC,
    mode: p.m || 'live',
    songs,
    durations: durs,
    songsSource: p.s?.length ? 'share' : 'fallback',
    setlistDate: p.d || null,
    exact: Boolean(p.s?.length),
    timeline,
    showLengthMs,
    correctionMs: 0,
    clips: [],
    voiceNotes: [],
    serverNow: Date.now(),
  };
}

// Resolve a room code (from ?room=) into a full event immediately.
export async function eventFromRoomCode(code) {
  const local = fastEventFromRoomCode(code);
  if (local) {
    // Non-blocking background sync with gateway if available
    resolveEvent({
      artist: local.artist,
      date: local.setlistDate,
      startDate: local.startDate,
      venue: local.venue,
      city: local.city,
      country: local.country,
      lat: local.lat,
      lng: local.lng,
      tz: local.tz,
      mode: local.mode,
    }).catch(() => {});
    return local;
  }
  return null;
}
