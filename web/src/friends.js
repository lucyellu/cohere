// Concert friends — "who else was in the crowd?"
//
// A friend is just someone whose passport key you hold. You swap keys by
// sending a friend code (or an invite link that carries it); nothing is
// discoverable and nobody can look you up. Once you're friends, the gateway
// can answer the only question that matters here: for a given show, which of
// these keys also minted a ticket stub? That answer becomes the "together
// with" badges printed on your stubs.
//
// Everything is local-first: the friend list lives in localStorage (and rides
// along in the passport cloud snapshot), the tag map is cached so stubs render
// their badges instantly and offline, and a refresh happens in the background.
// One cache backs every surface that shows friends: passport stubs, the
// Discover calendar, and the friends list itself.

import { guestKey, readProfile, FRIENDS_KEY, HISTORY_EVENT } from './account.js';
import { hashString } from './components/passport/palette.js';

export const FRIENDS_EVENT = 'cohear:friends-changed';

const INVITES_KEY = 'cohear_friend_invites_v1'; // codes received but not yet accepted
const TAGS_KEY = 'cohear_friend_tags_v2'; // cached concertId -> { …show, keys }
const TAGS_TTL_MS = 10 * 60 * 1000; // background refresh cadence

// --- storage helpers ----------------------------------------------------------
function readArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value.slice(0, 200)));
  } catch (err) {
    console.warn(`Failed to write ${key} to localStorage:`, err);
  }
}

function emitChanged() {
  window.dispatchEvent(new Event(FRIENDS_EVENT));
  // The passport snapshot carries the friend list, so a change is also a
  // passport change — this is what schedules the cloud push.
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

// --- friend codes -------------------------------------------------------------
// Same b64url-of-JSON shape as the room share links, so a code pastes cleanly
// into a text message and survives a URL round-trip.
function b64urlEncode(obj) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
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

// Your own code: the passport key friends need, plus a display name so they
// don't have to ask who just added them.
export function myFriendCode() {
  const profile = readProfile();
  return b64urlEncode({
    k: guestKey(),
    n: String(profile.name || '').slice(0, 32),
    p: profile.passportId || '',
  });
}

export function friendInviteUrl() {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('friend', myFriendCode());
  return u.toString();
}

// Accepts a bare code or a full invite URL (people paste both).
export function parseFriendCode(input) {
  let raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.includes('friend=')) {
    try {
      raw = new URL(raw, window.location.origin).searchParams.get('friend') || raw;
    } catch {
      raw = raw.split('friend=')[1]?.split('&')[0] || raw;
    }
  }
  const payload = b64urlDecode(raw);
  if (!payload?.k) return null;
  return {
    userKey: String(payload.k),
    name: String(payload.n || '').slice(0, 32),
    passportId: String(payload.p || ''),
  };
}

// --- the friend list ----------------------------------------------------------
// Records are id-keyed (id === userKey) so account.js's mergeById unions them
// across devices without dropping anyone.
export function readFriends() {
  return readArray(FRIENDS_KEY);
}

export function isFriend(userKey) {
  return readFriends().some((f) => f.userKey === userKey);
}

export function addFriendByCode(input) {
  const parsed = parseFriendCode(input);
  if (!parsed) return { ok: false, error: "That doesn't look like a Cohear friend code." };
  if (parsed.userKey === guestKey()) return { ok: false, error: "That's your own code — send it to a friend instead." };
  const friends = readFriends();
  const prev = friends.find((f) => f.userKey === parsed.userKey);
  if (prev) {
    // Re-adding refreshes the name they're travelling under, nothing else.
    if (parsed.name && parsed.name !== prev.name) {
      writeArray(FRIENDS_KEY, friends.map((f) => (f.userKey === prev.userKey ? { ...f, name: parsed.name } : f)));
      emitChanged();
    }
    return { ok: true, friend: prev, already: true };
  }
  const friend = {
    id: parsed.userKey, // mergeById keys on `id`
    userKey: parsed.userKey,
    name: parsed.name || 'Fellow traveller',
    passportId: parsed.passportId,
    addedAt: new Date().toISOString(),
  };
  writeArray(FRIENDS_KEY, [friend, ...friends]);
  dismissInvite(parsed.userKey);
  emitChanged();
  return { ok: true, friend };
}

export function removeFriend(userKey) {
  writeArray(FRIENDS_KEY, readFriends().filter((f) => f.userKey !== userKey));
  // Drop them from the cached badges immediately rather than waiting for a refresh.
  const tags = readTagCache();
  for (const [id, show] of Object.entries(tags.shows)) {
    const keys = (show.keys || []).filter((k) => k !== userKey);
    if (keys.length) tags.shows[id] = { ...show, keys };
    else delete tags.shows[id];
  }
  writeTagCache(tags);
  emitChanged();
}

export function renameFriend(userKey, name) {
  writeArray(
    FRIENDS_KEY,
    readFriends().map((f) => (f.userKey === userKey ? { ...f, name: String(name || '').slice(0, 32) } : f)),
  );
  emitChanged();
}

// --- pending invites ----------------------------------------------------------
// Arriving on a ?friend=… link never silently adds anyone: the code is parked
// here and the Friends panel asks first.
export function readInvites() {
  return readArray(INVITES_KEY);
}

export function receiveInvite(code) {
  const parsed = parseFriendCode(code);
  if (!parsed || parsed.userKey === guestKey() || isFriend(parsed.userKey)) return null;
  const invites = readInvites().filter((i) => i.userKey !== parsed.userKey);
  const invite = { ...parsed, id: parsed.userKey, code: String(code), receivedAt: new Date().toISOString() };
  writeArray(INVITES_KEY, [invite, ...invites]);
  emitChanged();
  return invite;
}

export function dismissInvite(userKey) {
  const next = readInvites().filter((i) => i.userKey !== userKey);
  writeArray(INVITES_KEY, next);
  emitChanged();
}

// Pull ?friend=… out of the URL (and off the address bar) exactly once.
export function consumeInviteFromUrl() {
  let code = '';
  try {
    code = new URLSearchParams(window.location.search).get('friend') || '';
  } catch {
    return null;
  }
  if (!code) return null;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('friend');
    window.history.replaceState(null, '', u.toString());
  } catch {
    /* leave the URL alone if it can't be rewritten */
  }
  return receiveInvite(code);
}

// --- attendance tags ----------------------------------------------------------
// One cache serves every view. We ask for everything the friends hold tickets
// to — not just the shows you attended — so the passport, the calendar and the
// friends list all read the same map, and shows you *missed* are visible too.
//
//   { at: iso, shows: { concertId: { artist, venue, city, country, date, keys: [] } } }
function readTagCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAGS_KEY) || '{}');
    const shows = parsed?.shows && typeof parsed.shows === 'object' ? parsed.shows : {};
    return { at: parsed?.at || '', shows };
  } catch {
    return { at: '', shows: {} };
  }
}

function writeTagCache(next) {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Failed to cache friend tags:', err);
  }
}

// Everything a badge needs to draw itself, derived from the key so a friend
// looks the same on every device without storing an avatar anywhere.
export function decorate(friend) {
  const seed = friend.userKey || friend.id || '';
  const hue = hashString(`${seed}:friend`) % 360;
  return {
    ...friend,
    initials: initialsOf(friend.name),
    color: `hsl(${hue} 62% 42%)`,
    tint: `hsl(${hue} 62% 92%)`,
  };
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '☺';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Hydrate the whole cache into { concertId: [decorated friend] } in one pass —
// the shape every view hands down to its cards, so rendering a page of tickets
// (or a month of calendar cells) doesn't re-read localStorage per item.
export function buildFriendTagMap(friends = readFriends()) {
  const byKey = new Map(friends.map((f) => [f.userKey, decorate(f)]));
  const out = {};
  for (const [concertId, show] of Object.entries(readTagCache().shows)) {
    const people = (show.keys || []).map((k) => byKey.get(k)).filter(Boolean);
    if (!people.length) continue;
    out[concertId] = people;
    // The same night can be registered under two ids — the JamBase listing id
    // a Discover card carries, and the `ev-…` id the live room mints. Index an
    // artist+date alias too so a calendar cell still finds its people.
    const alias = artistDateKey(show);
    if (alias && !out[alias]) out[alias] = people;
  }
  return out;
}

// Secondary lookup key, used only as a fallback when ids don't line up.
export function artistDateKey(concert = {}) {
  const artist = slug(concert.artist);
  const date = String(concert.date || '').slice(0, 10);
  return artist && date ? `${artist}|${date}` : '';
}

// Find the friends on a concert from a tag map, by id then by artist+date.
export function friendsOn(tagMap, concert) {
  if (!tagMap || !concert) return [];
  return tagMap[concert.id] || tagMap[artistDateKey(concert)] || [];
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// "Which of my friends went to which concerts" — the cached answer, one entry
// per show, newest first. No network: refreshFriendTags() owns the fetching.
export function readFriendShows(friends = readFriends()) {
  const byKey = new Map(friends.map((f) => [f.userKey, decorate(f)]));
  return Object.entries(readTagCache().shows)
    .map(([concertId, show]) => ({
      concertId,
      artist: show.artist || '',
      venue: show.venue || '',
      city: show.city || '',
      country: show.country || '',
      date: show.date || '',
      friends: (show.keys || []).map((k) => byKey.get(k)).filter(Boolean),
    }))
    .filter((show) => show.friends.length)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function tagsUpdatedAt() {
  return readTagCache().at;
}

let inFlight = null;

// Ask the gateway for every ticket your friends hold, and cache it. Called on
// mount by any view that shows badges; the cache answers instantly meanwhile,
// so nothing ever waits on the network to render.
export async function refreshFriendTags({ force = false } = {}) {
  const friends = readFriends();
  const cache = readTagCache();
  if (!friends.length) {
    if (Object.keys(cache.shows).length) writeTagCache({ at: new Date().toISOString(), shows: {} });
    return {};
  }
  const fresh = cache.at && Date.now() - Date.parse(cache.at) < TAGS_TTL_MS;
  if (fresh && !force) return cache.shows;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/passport/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKeys: friends.map((f) => f.userKey) }),
      });
      const out = await res.json();
      if (!out?.ok) return cache.shows;
      const shows = {};
      for (const [concertId, rows] of Object.entries(out.matches || {})) {
        const keys = [...new Set(rows.map((r) => r.userKey).filter(Boolean))];
        if (!keys.length) continue;
        const first = rows[0] || {};
        shows[concertId] = {
          artist: first.artist || '',
          venue: first.venue || '',
          city: first.city || '',
          country: first.country || '',
          date: first.date || '',
          keys,
        };
      }
      writeTagCache({ at: new Date().toISOString(), shows });
      window.dispatchEvent(new Event(FRIENDS_EVENT));
      return shows;
    } catch {
      return cache.shows; // offline — keep showing the last known badges
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

