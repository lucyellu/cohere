import { stampCollection, inkWord, regionInk } from './components/passport/palette.js';

export const HISTORY_EVENT = 'cohear:history-changed';

const HISTORY_KEY = 'cohear_concert_history_v1';
const VISAS_KEY = 'cohear_passport_visas_v1';
const ENTRIES_KEY = 'cohear_passport_entries_v1';
const STUBS_KEY = 'cohear_ticket_stubs_v1';
const OPTOUT_KEY = 'cohear_passport_optout_v1';
const PROFILE_KEY = 'cohear_passport_profile_v1';
const TRASH_KEY = 'cohear_passport_trash_v1';
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Real-world-ish visa rules ------------------------------------------------
// Bundled static reference data (no API): typical tourist-visa terms per country
// so a passport "visa" prints a believable validity window. Keyed by slug(name);
// COUNTRY_ALIASES folds common variants onto the canonical key.
const SCHENGEN = { label: 'Schengen — Type C', entries: 'multiple', days: 90, accent: '#3b82f6' };
export const VISA_RULES = {
  canada: { label: 'Visitor Record', entries: 'multiple', days: 180, accent: '#ef4444' },
  'united-states': { label: 'B-2 Visitor', entries: 'multiple', days: 180, accent: '#1d4ed8' },
  'united-kingdom': { label: 'Standard Visitor', entries: 'multiple', days: 180, accent: '#7c3aed' },
  japan: { label: 'Temporary Visitor', entries: 'single', days: 90, accent: '#e11d48' },
  australia: { label: 'ETA (601)', entries: 'multiple', days: 90, accent: '#16a34a' },
  'new-zealand': { label: 'NZeTA', entries: 'multiple', days: 90, accent: '#0ea5e9' },
  brazil: { label: 'VITUR', entries: 'multiple', days: 90, accent: '#22c55e' },
  mexico: { label: 'FMM Tourist', entries: 'single', days: 180, accent: '#15803d' },
  france: SCHENGEN, germany: SCHENGEN, spain: SCHENGEN, italy: SCHENGEN, netherlands: SCHENGEN,
  portugal: SCHENGEN, belgium: SCHENGEN, austria: SCHENGEN, sweden: SCHENGEN, switzerland: SCHENGEN,
  'south-korea': { label: 'K-ETA', entries: 'multiple', days: 90, accent: '#2563eb' },
  singapore: { label: 'Visit Pass', entries: 'multiple', days: 90, accent: '#dc2626' },
  india: { label: 'e-Tourist', entries: 'multiple', days: 90, accent: '#ea580c' },
  'united-arab-emirates': { label: 'Tourist Visa', entries: 'single', days: 60, accent: '#65a30d' },
};
const DEFAULT_RULE = { label: 'Tourist Visa', entries: 'single', days: 90, accent: '#f59e0b' };
const COUNTRY_ALIASES = {
  usa: 'united-states', us: 'united-states', 'u-s-a': 'united-states', 'u-s': 'united-states',
  america: 'united-states', uk: 'united-kingdom', 'u-k': 'united-kingdom', britain: 'united-kingdom',
  'great-britain': 'united-kingdom', england: 'united-kingdom', scotland: 'united-kingdom',
  uae: 'united-arab-emirates', korea: 'south-korea', holland: 'netherlands',
};
// Bundled city geocoords (no API): used to (a) infer a country for cities lacking
// explicit country data, and (b) compute "as if you travelled there" mileage on
// the passport. Keyed by slug(city). Coords are city-center approximations.
const CITY_COORDS = {
  toronto: { lat: 43.65, lng: -79.38, country: 'Canada' },
  montreal: { lat: 45.50, lng: -73.57, country: 'Canada' },
  vancouver: { lat: 49.28, lng: -123.12, country: 'Canada' },
  calgary: { lat: 51.05, lng: -114.07, country: 'Canada' },
  ottawa: { lat: 45.42, lng: -75.70, country: 'Canada' },
  london: { lat: 51.51, lng: -0.13, country: 'United Kingdom' },
  manchester: { lat: 53.48, lng: -2.24, country: 'United Kingdom' },
  glasgow: { lat: 55.86, lng: -4.25, country: 'United Kingdom' },
  dublin: { lat: 53.35, lng: -6.26, country: 'Ireland' },
  paris: { lat: 48.85, lng: 2.35, country: 'France' },
  'saint-denis': { lat: 48.94, lng: 2.36, country: 'France' },
  berlin: { lat: 52.52, lng: 13.40, country: 'Germany' },
  madrid: { lat: 40.42, lng: -3.70, country: 'Spain' },
  barcelona: { lat: 41.39, lng: 2.17, country: 'Spain' },
  amsterdam: { lat: 52.37, lng: 4.90, country: 'Netherlands' },
  rome: { lat: 41.90, lng: 12.50, country: 'Italy' },
  milan: { lat: 45.46, lng: 9.19, country: 'Italy' },
  lisbon: { lat: 38.72, lng: -9.14, country: 'Portugal' },
  zurich: { lat: 47.37, lng: 8.54, country: 'Switzerland' },
  vienna: { lat: 48.21, lng: 16.37, country: 'Austria' },
  stockholm: { lat: 59.33, lng: 18.07, country: 'Sweden' },
  tokyo: { lat: 35.68, lng: 139.69, country: 'Japan' },
  osaka: { lat: 34.69, lng: 135.50, country: 'Japan' },
  seoul: { lat: 37.57, lng: 126.98, country: 'South Korea' },
  singapore: { lat: 1.35, lng: 103.82, country: 'Singapore' },
  sydney: { lat: -33.87, lng: 151.21, country: 'Australia' },
  melbourne: { lat: -37.81, lng: 144.96, country: 'Australia' },
  auckland: { lat: -36.85, lng: 174.76, country: 'New Zealand' },
  'mexico-city': { lat: 19.43, lng: -99.13, country: 'Mexico' },
  'sao-paulo': { lat: -23.55, lng: -46.63, country: 'Brazil' },
  'rio-de-janeiro': { lat: -22.91, lng: -43.17, country: 'Brazil' },
  mumbai: { lat: 19.08, lng: 72.88, country: 'India' },
  dubai: { lat: 25.20, lng: 55.27, country: 'United Arab Emirates' },
  'new-york': { lat: 40.71, lng: -74.01, country: 'United States' },
  inglewood: { lat: 33.96, lng: -118.35, country: 'United States' },
  'los-angeles': { lat: 34.05, lng: -118.24, country: 'United States' },
  miami: { lat: 25.76, lng: -80.19, country: 'United States' },
  'las-vegas': { lat: 36.17, lng: -115.14, country: 'United States' },
  chicago: { lat: 41.88, lng: -87.63, country: 'United States' },
  boston: { lat: 42.36, lng: -71.06, country: 'United States' },
  atlanta: { lat: 33.75, lng: -84.39, country: 'United States' },
  nashville: { lat: 36.16, lng: -86.78, country: 'United States' },
  austin: { lat: 30.27, lng: -97.74, country: 'United States' },
  seattle: { lat: 47.61, lng: -122.33, country: 'United States' },
  'san-francisco': { lat: 37.77, lng: -122.42, country: 'United States' },
  denver: { lat: 39.74, lng: -104.99, country: 'United States' },
  philadelphia: { lat: 39.95, lng: -75.17, country: 'United States' },
  washington: { lat: 38.91, lng: -77.04, country: 'United States' },
  houston: { lat: 29.76, lng: -95.37, country: 'United States' },
  dallas: { lat: 32.78, lng: -96.80, country: 'United States' },
};
// Fallback country inference for common concert cities lacking explicit country data.
const CITY_COUNTRY = Object.fromEntries(
  Object.entries(CITY_COORDS).map(([city, { country }]) => [city, country]),
);

// Representative coordinates (capital / largest city) per country, so the
// passport can use a chosen home *country* as the travel origin — like a real
// passport's nationality — instead of needing a recognised home city.
const COUNTRY_ORIGINS = {
  'United States': { lat: 38.90, lng: -77.04 },
  Canada: { lat: 45.42, lng: -75.70 },
  'United Kingdom': { lat: 51.51, lng: -0.13 },
  Ireland: { lat: 53.35, lng: -6.26 },
  France: { lat: 48.85, lng: 2.35 },
  Germany: { lat: 52.52, lng: 13.40 },
  Spain: { lat: 40.42, lng: -3.70 },
  Italy: { lat: 41.90, lng: 12.50 },
  Netherlands: { lat: 52.37, lng: 4.90 },
  Portugal: { lat: 38.72, lng: -9.14 },
  Switzerland: { lat: 46.95, lng: 7.45 },
  Austria: { lat: 48.21, lng: 16.37 },
  Sweden: { lat: 59.33, lng: 18.07 },
  Norway: { lat: 59.91, lng: 10.75 },
  Denmark: { lat: 55.68, lng: 12.57 },
  Belgium: { lat: 50.85, lng: 4.35 },
  Poland: { lat: 52.23, lng: 21.01 },
  Japan: { lat: 35.68, lng: 139.69 },
  'South Korea': { lat: 37.57, lng: 126.98 },
  Singapore: { lat: 1.35, lng: 103.82 },
  India: { lat: 28.61, lng: 77.21 },
  'United Arab Emirates': { lat: 25.20, lng: 55.27 },
  Australia: { lat: -33.87, lng: 151.21 },
  'New Zealand': { lat: -36.85, lng: 174.76 },
  Mexico: { lat: 19.43, lng: -99.13 },
  Brazil: { lat: -23.55, lng: -46.63 },
  Argentina: { lat: -34.60, lng: -58.38 },
  Chile: { lat: -33.45, lng: -70.67 },
  'South Africa': { lat: -26.20, lng: 28.04 },
  China: { lat: 39.90, lng: 116.40 },
};
// Country names for the passport "country of issue" picker, alphabetical.
export const COUNTRY_OPTIONS = Object.keys(COUNTRY_ORIGINS).sort((a, b) => a.localeCompare(b));

// Origin coords for a country name (tolerant of aliases like "USA"/"UK").
export function countryOrigin(name) {
  if (!name) return null;
  if (COUNTRY_ORIGINS[name]) return COUNTRY_ORIGINS[name];
  const key = canonicalCountryKey(name);
  const match = Object.keys(COUNTRY_ORIGINS).find((c) => canonicalCountryKey(c) === key);
  return match ? COUNTRY_ORIGINS[match] : null;
}

// City-center coords for a place. Prefers explicit lat/lng (e.g. from a concert
// record), then the bundled table; returns null if we can't place it.
export function cityCoords(city, lat, lng) {
  if (lat != null && lng != null && Number.isFinite(+lat) && Number.isFinite(+lng)) {
    return { lat: +lat, lng: +lng };
  }
  const c = CITY_COORDS[slug(city)];
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export function visaRuleFor(country) {
  const key = canonicalCountryKey(country);
  return VISA_RULES[key] || DEFAULT_RULE;
}

function canonicalCountryKey(country) {
  const k = slug(country);
  return COUNTRY_ALIASES[k] || k;
}

function resolveCountry(concert) {
  if (concert.country) return concert.country;
  const byCity = CITY_COUNTRY[slug(concert.city)];
  return byCity || '';
}

// --- Reads --------------------------------------------------------------------
export function readHistory() { return readArray(HISTORY_KEY); }
export function readVisas() { return readArray(VISAS_KEY); }
export function readEntries() { return readArray(ENTRIES_KEY); }
export function readStubs() { return readArray(STUBS_KEY); }
export function readOptOut() { return readArray(OPTOUT_KEY); }
export function isOptedOut(id) { return id ? readOptOut().includes(id) : false; }

// --- Trash (soft-delete, 30-day window) ---------------------------------------
export function readTrash() {
  const cutoff = Date.now() - TRASH_TTL_MS;
  return readArray(TRASH_KEY).filter((t) => new Date(t.deletedAt).getTime() > cutoff);
}

function writeTrash(items) {
  writeArray(TRASH_KEY, items.slice(0, 200));
}

// Move a concert and all its associated records into the trash instead of
// hard-deleting them. The caller (optOutConcert) still removes them from the
// active arrays and reconciles visas — this just keeps a recoverable snapshot.
function pushToTrash(concert) {
  const concertId = concert.id;
  const histItem = readHistory().find((h) => h.id === concertId) || null;
  const stubItem = readStubs().find((s) => s.id === concertId) || null;
  const entryItems = readEntries().filter((e) => e.concertId === concertId);
  const trashEntry = {
    concertId,
    deletedAt: new Date().toISOString(),
    history: histItem,
    stub: stubItem,
    entries: entryItems,
    country: histItem?.country || entryItems[0]?.country || concert.country || '',
  };
  writeTrash([trashEntry, ...readTrash().filter((t) => t.concertId !== concertId)]);
}

export function restoreFromTrash(concertId) {
  const trash = readTrash();
  const item = trash.find((t) => t.concertId === concertId);
  if (!item) return;

  // Restore history record
  if (item.history) {
    const hist = readHistory();
    if (!hist.find((h) => h.id === concertId)) {
      writeArray(HISTORY_KEY, [item.history, ...hist]);
    }
  }
  // Restore ticket stub
  if (item.stub) {
    const stubs = readStubs();
    if (!stubs.find((s) => s.id === concertId)) {
      writeArray(STUBS_KEY, [item.stub, ...stubs]);
    }
  }
  // Restore entry stamps
  if (item.entries?.length) {
    const entries = readEntries();
    const existing = new Set(entries.map((e) => e.id));
    const toAdd = item.entries.filter((e) => !existing.has(e.id));
    if (toAdd.length) writeArray(ENTRIES_KEY, [...toAdd, ...entries]);
  }
  // Re-issue visa (idempotent — skips if country already has a visa)
  if (item.history || item.entries?.[0]) {
    issueVisa(item.history || item.entries[0]);
  }
  // Clear from optout and trash
  const list = readOptOut();
  if (list.includes(concertId)) writeArray(OPTOUT_KEY, list.filter((x) => x !== concertId));
  writeTrash(trash.filter((t) => t.concertId !== concertId));
  emitHistoryChanged();
}

export function deleteFromTrash(concertId) {
  writeTrash(readTrash().filter((t) => t.concertId !== concertId));
  emitHistoryChanged();
}

export function emptyTrash() {
  writeTrash([]);
  emitHistoryChanged();
}

// Canonical "this is the same show" key, independent of the source-assigned id,
// the start time, or the (randomly-derived) seat. Same artist at the same
// venue/city is treated as one show — so re-minting from a different session, a
// cloud merge, or a slightly different start time collapses onto a single stub
// instead of repeating. Falls back to artist+date, then the raw id, when the
// venue/city are missing.
export function showIdentity(c = {}) {
  const a = slug(c.artist || '');
  const v = slug(c.venue || '');
  const ci = slug(c.city || '');
  if (a && (v || ci)) return `${a}|${v}|${ci}`;
  if (a && c.date) return `${a}|${c.date}`;
  return `id:${c.id || ''}`;
}

// Find stubs that appear to be duplicates: same show (artist + venue/city),
// different id. Returns an array of groups where each group is [keepStub, ...dupStubs].
export function findDuplicateStubs() {
  const stubs = readStubs();
  const groups = new Map();
  for (const stub of stubs) {
    const key = showIdentity(stub);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(stub);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => String(b.issuedAt || '').localeCompare(String(a.issuedAt || ''))));
}

// Remove duplicate stubs (keeping newest per artist+date), moving the extras to trash.
export function deduplicateStubs() {
  const groups = findDuplicateStubs();
  let removed = 0;
  for (const [, ...dups] of groups) {
    for (const dup of dups) {
      optOutConcert(dup); // soft-deletes (pushes to trash internally)
      removed += 1;
    }
  }
  return removed;
}

// Silent, automatic de-duplication run on app start. Unlike deduplicateStubs()
// this does NOT trash the extras (they're exact duplicates, not mistakes) — it
// just collapses each ticket stub / entry stamp to a single canonical copy.
//
// Why duplicates can appear at all: stub ids come from the concert source and
// can differ for the same show across sessions/devices, so a cloud merge (which
// unions by id) can keep two stubs for one concert. Entry stamps are keyed
// deterministically (city + date) so they rarely duplicate, but we guard them
// too. The canonical copy kept is the verified one, else the earliest-issued.
export function pruneDuplicates() {
  let removed = 0;
  removed += pruneArrayByKey(STUBS_KEY, (s) => showIdentity(s));
  removed += pruneArrayByKey(ENTRIES_KEY, (e) => contentKey(slug(e.city || ''), e.date, e.id));
  if (removed) {
    reconcileVisas();
    emitHistoryChanged();
  }
  return removed;
}

function contentKey(a, date, id) {
  const d = date || '';
  return a || d ? `${a}|${d}` : `id:${id}`;
}

function pruneArrayByKey(key, keyOf) {
  const list = readArray(key);
  const seen = new Map(); // contentKey -> index in `keep`
  const keep = [];
  let removed = 0;
  for (const item of list) {
    const k = keyOf(item);
    if (!seen.has(k)) {
      seen.set(k, keep.length);
      keep.push(item);
      continue;
    }
    const idx = seen.get(k);
    keep[idx] = preferRecord(keep[idx], item);
    removed += 1;
  }
  if (removed) writeArray(key, keep);
  return removed;
}

// Of two duplicate records, keep the verified one; if neither (or both) are
// verified, keep the one issued first (the original).
function preferRecord(a, b) {
  if (Boolean(a.verified) !== Boolean(b.verified)) return a.verified ? a : b;
  const ta = String(a.issuedAt || '');
  const tb = String(b.issuedAt || '');
  if (ta && tb) return ta <= tb ? a : b;
  return ta ? a : b;
}

// Editable passport identity (display name + chosen home city/avatar tint).
export function readProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
export function writeProfile(patch) {
  const next = { ...readProfile(), ...patch, profileUpdatedAt: new Date().toISOString() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  emitHistoryChanged();
  return next;
}

// Every passport carries a permanent unique id, minted once and then carried
// in the profile (so it syncs across devices with the rest of the identity).
// The QR code on the identity page encodes it.
export function ensurePassportId() {
  const profile = readProfile();
  if (profile.passportId) return profile.passportId;
  const id = globalThis.crypto?.randomUUID?.()
    || `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  writeProfile({ passportId: id });
  return id;
}

function clearOptOut(id) {
  const list = readOptOut();
  if (!id || !list.includes(id)) return;
  writeArray(OPTOUT_KEY, list.filter((x) => x !== id));
}

// Soft-delete: move all traces of the show to the trash (recoverable for 30 days),
// then scrub from the active arrays and update optout so it won't auto-re-stamp.
export function optOutConcert(input) {
  const concert = normalizeConcert(input);
  if (!concert.id) return;
  pushToTrash(concert); // snapshot before removing
  const list = readOptOut();
  if (!list.includes(concert.id)) writeArray(OPTOUT_KEY, [concert.id, ...list]);
  writeArray(HISTORY_KEY, readHistory().filter((item) => item.id !== concert.id));
  writeArray(STUBS_KEY, readStubs().filter((stub) => stub.id !== concert.id));
  writeArray(ENTRIES_KEY, readEntries().filter((e) => e.concertId !== concert.id));
  reconcileVisas();
  emitHistoryChanged();
}

// Drop visas for countries that no longer have any entry stamps.
function reconcileVisas() {
  const liveCountries = new Set(readEntries().map((e) => canonicalCountryKey(e.country)).filter(Boolean));
  writeArray(VISAS_KEY, readVisas().filter((v) => liveCountries.has(v.id)));
}

export function recordConcertAction(input, action = 'viewed', meta = {}) {
  const concert = normalizeConcert(input);
  if (!concert.id) return null;
  if (isOptedOut(concert.id)) return null; // respects "I was never here"
  const now = new Date().toISOString();
  const history = readHistory();
  const prev = history.find((item) => item.id === concert.id)
    || (concert.artist && concert.date
      ? history.find((item) => slug(item.artist || '') === slug(concert.artist) && item.date === concert.date)
      : null);
  const entry = {
    ...(prev || {}),
    ...concert,
    id: prev?.id || concert.id, // keep the original id if merging into an existing record
    firstViewedAt: prev?.firstViewedAt || now,
    lastViewedAt: now,
    status: attendedAction(action) ? 'attended' : (prev?.status || 'visited'),
    actions: { ...(prev?.actions || {}), [action]: now },
    source: meta.source || prev?.source || concert.source || 'cohear',
  };
  if (attendedAction(action)) entry.attendedAt = prev?.attendedAt || now;
  writeArray(HISTORY_KEY, [entry, ...history.filter((item) => item.id !== entry.id)]);
  emitHistoryChanged();
  return entry;
}

export function markAttended(input) {
  const id = normalizeConcert(input).id;
  if (id) clearOptOut(id);
  return recordConcertAction(input, 'attended', { source: 'manual' });
}

// --- Visas (per country) ------------------------------------------------------
// Issued once on the first show in a country, with a real-world-ish validity.
export function issueVisa(input) {
  const concert = normalizeConcert(input);
  const country = resolveCountry(concert);
  if (!country) return null;
  const id = canonicalCountryKey(country);
  const visas = readVisas();
  const prev = visas.find((v) => v.id === id);
  if (prev) return prev;
  const rule = visaRuleFor(country);
  const edition = visas.length + 1;
  const issuedAt = new Date().toISOString();
  const visa = {
    id,
    type: 'visa',
    country,
    rule,
    issuedAt,
    expiresAt: addDays(issuedAt, rule.days),
    edition,
    serial: visaSerial(id, edition),
    prompt: visaPrompt({ country, rule }),
    token: null,
    verified: false,
  };
  writeArray(VISAS_KEY, [visa, ...visas]);
  emitHistoryChanged();
  signToken('visa', visa);
  return visa;
}

// --- Entry stamps (per city, per visit-date) ----------------------------------
// A fresh dated postmark each time you turn up in a city — exactly like an
// immigration entry stamp. Deduped by city + date.
export function addEntryStamp(input) {
  const concert = normalizeConcert(input);
  if (!concert.city) return null;
  const date = concert.date || isoDate(new Date());
  const id = `${slug(concert.city)}:${date}`;
  const entries = readEntries();
  const prev = entries.find((e) => e.id === id);
  if (prev) return prev;
  const country = resolveCountry(concert);
  const edition = entries.length + 1;
  const coords = cityCoords(concert.city, concert.lat, concert.lng);
  const stamp = {
    id,
    type: 'entry',
    city: concert.city,
    region: concert.region || '', // state/province when the source provides one
    country,
    date,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    artist: concert.artist,
    venue: concert.venue,
    concertId: concert.id,
    issuedAt: new Date().toISOString(),
    edition,
    serial: entrySerial(id),
    prompt: entryPrompt(concert),
    token: null,
    verified: false,
  };
  writeArray(ENTRIES_KEY, [stamp, ...entries]);
  emitHistoryChanged();
  signToken('entry', stamp);
  return stamp;
}

// A souvenir (visa / entry stamp / ticket stub) should only mint once you could
// actually be "in the crowd": the show is live, already happened, or starts very
// soon. Opening an upcoming show hours or days early must NOT stamp it — you
// weren't there yet. You can "arrive" up to STAMP_LEAD_MS before the start.
const STAMP_LEAD_MS = 2 * 60 * 60 * 1000; // 2 hours

function stampStartMs(c) {
  const raw = c.startDate || c.date || '';
  if (!raw) return null;
  // Date-only → assume an 8pm show; datetimes parse as-is.
  const t = Date.parse(raw.length <= 10 ? `${raw}T20:00:00` : raw);
  return Number.isNaN(t) ? null : t;
}

// Has this show started (or is it about to / already past)? Replays always count.
export function isStampable(concert, now = Date.now()) {
  if (!concert) return false;
  if (concert.when === 'past' || concert.mode === 'replay' || concert.source === 'replay') return true;
  const start = stampStartMs(concert);
  if (start == null) return true; // unknown start time → don't block (back-compat)
  return now >= start - STAMP_LEAD_MS;
}

// Default behaviour: seeing a room's page stamps the passport — it issues the
// country visa (once) and a dated entry stamp + ticket stub for the city. But
// only once the show is actually on; opening it too early just records the view.
// Silent on a prior "I was never here" (only an explicit claimStamp re-enables).
export function autoStampOnView(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  if (!isStampable(concert)) {
    // Too early — log that you looked, but hand out no souvenir yet.
    recordConcertAction(input, 'viewed', { source: 'view' });
    return { visa: null, entry: null, stub: null, pending: true };
  }
  recordConcertAction(input, concert.when === 'past' ? 'opened_replay' : 'joined_live', { source: 'view' });
  const visa = issueVisa(concert);
  const entry = addEntryStamp(concert);
  const stub = issueTicketStub(concert); // attending a show = you hold its ticket
  return { visa, entry, stub };
}

// Manual "add to passport" — an explicit opt-in that overrides a prior
// "never here" and stamps it just like a view would.
export function claimStamp(input) {
  const id = normalizeConcert(input).id;
  if (id) clearOptOut(id);
  recordConcertAction(input, 'stamp_claimed', { source: 'passport' });
  const visa = issueVisa(input);
  const entry = addEntryStamp(input);
  const stub = issueTicketStub(input);
  return { visa, entry, stub };
}

// --- Ticket stubs (one per concert you attend) --------------------------------
// Minting a stub is the souvenir of attending a specific show. Deduped per
// concert id and idempotent, so attending, listening, or backfilling all land on
// the same single stub.
export function issueTicketStub(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  const stubs = readStubs();
  const identity = showIdentity(concert);
  const prev = stubs.find((stub) => stub.id === concert.id || showIdentity(stub) === identity);
  if (prev) return prev;
  // Prefer the richer history record (carries status/capacity) if we have it.
  const record = readHistory().find((h) => h.id === concert.id) || concert;
  const edition = stubs.length + 1;
  const stub = {
    ...record,
    id: concert.id,
    type: 'ticket',
    issuedAt: new Date().toISOString(),
    edition,
    serial: stubSerial(record, edition),
    seat: stubSeat(record),
    estTicketUsd: estTicketUsd({ ...concert, ...record }),
    prompt: ticketPrompt(record),
    token: null,
    verified: false,
  };
  writeArray(STUBS_KEY, [stub, ...stubs]);
  emitHistoryChanged();
  signToken('ticket', stub);
  return stub;
}

// Listening in the room: record it, ensure the visa/entry, then mint the stub.
export function claimTicketStub(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  recordConcertAction(input, 'listened', { source: 'live_room' });
  issueVisa(concert);
  addEntryStamp(concert);
  return issueTicketStub(input);
}

// One-time repair: make sure every show you've attended has its ticket stub
// (older data only minted a stub when a song happened to be playing).
export function backfillStubs() {
  const have = new Set(readStubs().map((s) => s.id));
  let made = 0;
  for (const item of readHistory()) {
    if (item.status === 'attended' && !have.has(item.id) && !isOptedOut(item.id)) {
      if (issueTicketStub(item)) {
        have.add(item.id);
        made += 1;
      }
    }
  }
  return made;
}

// The actions that mean you actually experienced the show — as opposed to
// 'viewed', which is just tapping a card in Discover to read about it.
const REAL_ATTENDANCE = ['joined_live', 'opened_replay', 'listened', 'stamp_claimed'];

// Stamp every attended show in the record automatically — no manual "stamp
// passport" button. Only shows you genuinely joined (live room, replay, or an
// explicit claim) qualify; merely having looked at a concert in Discover never
// earns a souvenir. Idempotent and dedup-safe, so re-running on each Passport
// open never creates a second stamp or ticket.
export function autoStampHistory() {
  let stamped = 0;
  const have = new Set(readStubs().map((s) => s.id));
  for (const item of readHistory()) {
    if (!item.id || isOptedOut(item.id)) continue;
    if (item.status !== 'attended') continue; // browsing Discover isn't attending
    if (!isStampable(item)) continue; // not started yet → no souvenir
    issueVisa(item);
    addEntryStamp(item);
    issueTicketStub(item);
    if (!have.has(item.id)) stamped += 1;
  }
  return stamped;
}

// One-time repair for data the old autoStampHistory over-stamped: it promoted
// shows you had only *looked at* in Discover to "attended" (tagged source
// 'auto') and minted stubs/stamps for them — filling the passport with artists
// you never saw. Demote those records and pull their souvenirs; anything with a
// real attendance action, or marked attended manually, is untouched.
export function pruneViewedOnlyStamps() {
  const history = readHistory();
  const junk = new Set();
  const repaired = history.map((item) => {
    if (item.status !== 'attended' || item.source !== 'auto') return item;
    if (REAL_ATTENDANCE.some((k) => item.actions?.[k])) return item;
    junk.add(item.id);
    const { attendedAt, ...rest } = item;
    return { ...rest, status: 'visited' };
  });
  if (!junk.size) return 0;
  writeArray(HISTORY_KEY, repaired);
  writeArray(STUBS_KEY, readStubs().filter((s) => !junk.has(s.id)));
  writeArray(ENTRIES_KEY, readEntries().filter((e) => !junk.has(e.concertId)));
  reconcileVisas();
  emitHistoryChanged();
  return junk.size;
}

// Aggregate "your live passport" stats for the Discover header.
export function personalStats() {
  const stubs = readStubs();
  const trip = travelItinerary(readEntries(), resolveHome(readProfile()));
  const attendedHistory = readHistory().filter((h) => h.status === 'attended').length;
  const savedUsd = stubs.reduce((sum, s) => sum + (s.estTicketUsd || estTicketUsd(s) || 0), 0);
  return {
    attended: Math.max(stubs.length, attendedHistory),
    miles: trip.miles,
    km: trip.km,
    stops: trip.stops,
    savedUsd,
  };
}

export function normalizeConcert(input = {}) {
  const artist = input.artist || '';
  const venue = input.venue || '';
  const city = input.city || '';
  const country = input.country || '';
  const date = normalizeDate(input.date || input.setlistDate || input.startDate);
  const id = input.concertId || input.id || slug([artist, venue, city, date].filter(Boolean).join('-'));
  return {
    id,
    artist,
    venue,
    city,
    region: input.region || '',
    country,
    date,
    startDate: input.startDate || '',
    timeZone: input.timeZone || input.tz || '',
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    capacity: input.capacity ?? null,
    popularity: input.popularity ?? input.spotifyPopularity ?? input.artistPopularity ?? null,
    avgTicketUsd: input.avgTicketUsd ?? null,
    when: input.when || (input.mode === 'replay' ? 'past' : 'upcoming'),
    tour: input.tour || input.name || '',
    source: input.source || input.mode || '',
  };
}

// Rough single-ticket estimate (mirrors Discover's estimatedTicketUsd) so the
// passport can total up "ticket money saved" by being there virtually.
export function estTicketUsd(c = {}) {
  if (c.avgTicketUsd) return Math.round(c.avgTicketUsd);
  const rawPop = Number(c.popularity ?? c.spotifyPopularity ?? c.artistPopularity ?? 55);
  const pop = rawPop > 100 ? Math.min(100, 48 + Math.log10(Math.max(10, rawPop)) * 10) : rawPop;
  const cap = Number(c.capacity || 12000);
  const premium = cap >= 60000 ? 80 : cap >= 25000 ? 45 : cap >= 15000 ? 25 : 0;
  return Math.max(35, Math.round(45 + pop * 1.15 + premium));
}

// --- FLUX prompt builders (CSS renders by default; art is generated on demand) -
// The art must read as part of the printed object — a stamp illustration or a
// ticket's press-printed background — never a picture pasted onto the card.
// No faces/portraits: real stubs are typographic, and generated artist faces
// read as propaganda posters.
export function visaPrompt({ country, rule }) {
  return [
    `Engraved intaglio visa stamp print for ${country || 'an international destination'}, edge-to-edge full-bleed design.`,
    `Monochromatic palette — two or three tints of a single muted ink on aged cream paper: ornate guilloché security border framing a small national landmark or emblem vignette, "${rule?.label || 'Tourist Visa'}" energy.`,
    'Looks pressed into the paper, fine engraved linework, soft print grain. Strictly no faces, no portraits, no people, no photorealism, no readable paragraph text.',
  ].join(' ');
}
export function entryPrompt(entry) {
  const place = [entry.city, entry.country].filter(Boolean).join(', ');
  return [
    `Vintage engraved postage stamp artwork of ${place || 'a concert city'}: one iconic local landmark, skyline silhouette or nature motif, full-bleed edge-to-edge.`,
    'Monochromatic duotone — three tints of one muted ink, airbrushed grain and stippled shading, hand-drawn philatelic linework, the design fills the whole frame like a real printed stamp.',
    'No faces, no portraits, no people, no paragraph text.',
  ].join(' ');
}

// Souvenir postage face — prompt-locked to the same print collection the
// procedural face uses (marijanapav-style stamp album: monoline / textured /
// typographic), so generated art drops into a matching frame.
const SOUVENIR_STYLES = {
  monoline: (place, ink) => [
    `Mid-century minimalist postage stamp art of ${place}: a single landmark, sun or nature scene drawn as a single-weight monoline line illustration.`,
    `One ${ink} ink on warm cream paper, thick even outlines, geometric simplification, generous negative space, flat print with no shading or gradients.`,
  ],
  textured: (place, ink) => [
    `Vintage engraved postage stamp artwork of ${place}: bold landmark or nature motif with ornamental banner and botanical corner flourishes.`,
    `Monochromatic ${ink} palette in three tints, airbrushed grain and stippled shading, looks screen-printed with soft noise texture, classical philatelic composition.`,
  ],
  typographic: (place, ink) => [
    `Typographic vintage postage stamp for ${place}: giant overlapping letterforms and numerals ARE the artwork.`,
    `Two spot colors (${ink} and one accent) on aged paper, bold grotesque and serif wood type mix, slight off-registration print charm, strictly typography and geometric ornament — no pictorial scene.`,
  ],
};
export function souvenirPrompt(item) {
  const style = SOUVENIR_STYLES[stampCollection(item.id)] || SOUVENIR_STYLES.textured;
  const place = item.city || item.country || 'a concert city';
  const ink = inkWord(regionInk(item.country, place));
  return [
    ...style(place, ink),
    'Full-bleed edge-to-edge, no white border, no perforations. No faces, no portraits, no people, no readable paragraph text.',
  ].join(' ');
}
export function ticketPrompt(entry) {
  const place = [entry.venue, entry.city].filter(Boolean).join(', ');
  return [
    `Vintage letterpress concert ticket background for ${entry.artist || 'the headliner'} at ${place || 'the venue'}: typography and print ornament are the artwork.`,
    'Big wood-type block lettering of the band name, radiating sunburst rays or halftone texture behind it, ornamental rules and print-shop borders, two-color ink on aged paper.',
    'Strictly typographic and geometric — absolutely NO faces, NO portraits, NO people, NO illustration of the artist. No long body text.',
  ].join(' ');
}
// Back-compat alias.
export const stampPrompt = entryPrompt;

// --- Helpers ------------------------------------------------------------------
function attendedAction(action) {
  return ['attended', 'joined_live', 'opened_replay', 'listened', 'stamp_claimed'].includes(action);
}

function visaSerial(id, edition) {
  return `VISA-${hash(id).slice(0, 6).toUpperCase()}-${String(edition).padStart(3, '0')}`;
}
function entrySerial(id) {
  return `ENT-${hash(id).slice(0, 8).toUpperCase()}`;
}
function stubSerial(entry, edition) {
  return `TIX-${hash(`${entry.id}:stub`).slice(0, 6).toUpperCase()}-${String(edition).padStart(4, '0')}`;
}

// Deterministic souvenir seat assignment derived from the event id, so the same
// show always prints the same stub.
function stubSeat(entry) {
  const n = parseInt(hash(`${entry.id}:seat`).slice(0, 7), 16);
  const sections = ['GA', 'FLOOR', 'PIT', 'LOWER', 'UPPER', 'BALCONY'];
  return {
    section: sections[n % sections.length],
    row: String.fromCharCode(65 + ((n >> 3) % 26)),
    seat: ((n >> 8) % 42) + 1,
    gate: ((n >> 5) % 12) + 1,
  };
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString();
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// --- Travel mileage ("as if you actually went there") ------------------------
// Resolve the passport's home base from the profile. A typed home city wins
// (placed via the bundled table or a stored geocode); the chosen home country's
// origin point (its capital) is only the fallback — otherwise everyone from
// Canada "lives" in Ottawa.
export function resolveHome(profile = {}) {
  const city = (profile.homeCity || '').trim();
  if (city) {
    const coords = cityCoords(city, profile.homeLat, profile.homeLng);
    if (coords) return { city, country: profile.homeCountry || coords.country || '', ...coords };
  }
  const country = (profile.homeCountry || '').trim();
  if (country) {
    const c = countryOrigin(country);
    return { country, city: city || country, lat: c?.lat ?? null, lng: c?.lng ?? null };
  }
  return city ? { city, lat: null, lng: null } : null;
}

function entryCoords(entry) {
  return cityCoords(entry.city, entry.lat, entry.lng);
}

// Great-circle distance between two {lat,lng} points, in kilometres.
export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Build the "concert-hopping itinerary": order entry stamps by date and sum the
// great-circle hops between consecutive cities. If a home base is set, the route
// departs from and returns to home (a real round-trip). Legs to/from unplaced
// cities are skipped. Returns { km, miles, legs, stops }.
export function travelItinerary(entries = [], home = null) {
  const placed = entries
    .map((e) => ({ entry: e, coords: entryCoords(e) }))
    .filter((x) => x.coords)
    .sort((a, b) => String(a.entry.date || '').localeCompare(String(b.entry.date || '')));

  const homePt = home && home.lat != null ? { city: home.city, ...home } : null;
  const points = [];
  if (homePt) points.push(homePt);
  for (const { entry, coords } of placed) points.push({ city: entry.city, ...coords });
  if (homePt && placed.length) points.push(homePt); // fly home

  let km = 0;
  const legs = [];
  for (let i = 1; i < points.length; i += 1) {
    const d = haversineKm(points[i - 1], points[i]);
    if (d < 1) continue; // same city / no real hop
    legs.push({ from: points[i - 1].city, to: points[i].city, km: d });
    km += d;
  }
  return { km, miles: km * 0.621371, legs, stops: placed.length };
}

// --- Token layer (Ed25519 signing + Supabase registry, via the gateway) ------
// Mint is instant + local; signing happens lazily so it never blocks the UI and
// survives being offline (records stay "pending" and re-sync later).
const TYPE_KEY = { visa: VISAS_KEY, entry: ENTRIES_KEY, ticket: STUBS_KEY };

function guestKey() {
  let k = localStorage.getItem('cohear_guest_id');
  if (!k) {
    k = (window.crypto?.randomUUID?.() || `g-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('cohear_guest_id', k);
  }
  return k;
}

function patchRecord(type, id, patch) {
  const key = TYPE_KEY[type];
  const list = readArray(key);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  writeArray(key, list);
  emitHistoryChanged();
}

async function signToken(type, record) {
  if (!record || record.verified) return;
  try {
    const res = await fetch('/api/passport/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        scopeKey: record.id,
        userKey: guestKey(),
        serial: record.serial,
        concertId: record.concertId || record.id,
        artist: record.artist || '',
        venue: record.venue || '',
        city: record.city || '',
        country: record.country || '',
        date: record.date || '',
      }),
    });
    const out = await res.json();
    if (!out?.ok) return;
    patchRecord(type, record.id, {
      mintNo: out.mintNo ?? null,
      signature: out.signature || null,
      publicKey: out.publicKey || null,
      issuedAt: out.issuedAt || record.issuedAt,
      verified: Boolean(out.registered),
    });
  } catch {
    /* offline — stays pending; resyncTokens() retries later */
  }
}

// Retry signing for anything still pending (called on the Passport view mount).
export function resyncTokens() {
  for (const [type, key] of Object.entries(TYPE_KEY)) {
    for (const record of readArray(key)) {
      if (!record.verified) signToken(type, record);
    }
  }
}

function emitHistoryChanged() {
  window.dispatchEvent(new Event(HISTORY_EVENT));
  schedulePush();
}

// --- Cross-device cloud sync (Supabase, registered by the Passport view) ------
// account.js stays network-agnostic: the view hands us a push function + user id
// once signed in, and we (a) write through every mutation (debounced) and
// (b) expose pure merge helpers so a new device reconciles cloud + local without
// losing a single stamp.
let cloudPush = null; // (state) => Promise
let cloudUserId = null;
let pushTimer = null;

export function setCloudSync(userId, pushFn) {
  cloudUserId = userId || null;
  cloudPush = pushFn || null;
}

function schedulePush() {
  if (!cloudPush || !cloudUserId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    Promise.resolve(cloudPush(snapshotLocal())).catch(() => {});
  }, 1200);
}

// The full local passport as one plain object (what we store in the cloud row).
export function snapshotLocal() {
  return {
    profile: readProfile(),
    visas: readVisas(),
    entries: readEntries(),
    stubs: readStubs(),
    history: readHistory(),
    optout: readOptOut(),
  };
}

// Overwrite local storage with a reconciled state and notify the UI. Does not
// re-trigger a push (the caller owns the cloud write for this state).
export function writeLocalState(state = {}) {
  if (state.profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
  if (state.visas) writeArray(VISAS_KEY, state.visas);
  if (state.entries) writeArray(ENTRIES_KEY, state.entries);
  if (state.stubs) writeArray(STUBS_KEY, state.stubs);
  if (state.history) writeArray(HISTORY_KEY, state.history);
  if (state.optout) writeArray(OPTOUT_KEY, state.optout);
  window.dispatchEvent(new Event(HISTORY_EVENT)); // refresh UI, no cloud push
}

function latestTs(obj, keys) {
  for (const k of keys) if (obj && obj[k]) return obj[k];
  return '';
}

// Union two id-keyed lists, keeping the newer copy of any shared id. Never drops
// a record that exists on only one side — so logging in merges, never deletes.
function mergeById(local = [], remote = [], tsKeys = ['issuedAt']) {
  const map = new Map();
  for (const item of [...(remote || []), ...(local || [])]) {
    if (!item || !item.id) continue;
    const prev = map.get(item.id);
    if (!prev || latestTs(item, tsKeys) >= latestTs(prev, tsKeys)) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => String(latestTs(b, tsKeys)).localeCompare(String(latestTs(a, tsKeys))));
}

// Reconcile a local snapshot with a cloud snapshot. Arrays union (no loss);
// profile is last-write-wins on profileUpdatedAt.
export function mergeState(local = {}, remote = {}) {
  const lp = local.profile || {};
  const rp = remote.profile || {};
  const profile = (lp.profileUpdatedAt || '') >= (rp.profileUpdatedAt || '')
    ? { ...rp, ...lp }
    : { ...lp, ...rp };
  return {
    profile,
    visas: mergeById(local.visas, remote.visas, ['issuedAt']),
    entries: mergeById(local.entries, remote.entries, ['issuedAt']),
    stubs: mergeById(local.stubs, remote.stubs, ['issuedAt']),
    history: mergeById(local.history, remote.history, ['lastViewedAt', 'firstViewedAt']),
    optout: [...new Set([...(local.optout || []), ...(remote.optout || [])])],
  };
}

// --- JSON backup / restore ----------------------------------------------------
export function exportJson() {
  return JSON.stringify({ ...snapshotLocal(), exportedAt: new Date().toISOString(), version: 1 }, null, 2);
}

export function importJson(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error('Invalid JSON file'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Unrecognised backup format');
  // Accept any object that has at least one recognisable passport key.
  const known = ['history', 'visas', 'entries', 'stubs', 'profile', 'optout'];
  if (!known.some((k) => Array.isArray(parsed[k]) || (k === 'profile' && parsed[k]))) {
    throw new Error('File does not appear to be a Cohear passport backup');
  }
  // Merge rather than replace so importing never loses local stamps.
  const merged = mergeState(snapshotLocal(), parsed);
  writeLocalState(merged);
}

function readArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value.slice(0, 500)));
}

function normalizeDate(value) {
  const raw = String(value || '');
  if (!raw) return '';
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : raw.slice(0, 10);
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
