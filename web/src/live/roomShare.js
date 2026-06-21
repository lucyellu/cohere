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

// Resolve a room code (from ?room=) back into a full event to open.
export async function eventFromRoomCode(code) {
  const p = b64urlDecode(code);
  if (!p || !p.a) return null;
  if (p.i) {
    const hit = await getEvent(p.i);
    if (hit) return hit;
  }
  const ev = await resolveEvent({
    artist: p.a, date: p.d, startDate: p.sd, venue: p.v, city: p.c,
    country: p.n, lat: p.la, lng: p.lo, tz: p.tz, mode: p.m,
  });
  // Force the shared id so a fallback-resolve still joins the same channel.
  if (ev && p.i) ev.id = p.i;
  return ev;
}
