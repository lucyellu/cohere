export const HISTORY_EVENT = 'cohear:history-changed';

const HISTORY_KEY = 'cohear_concert_history_v1';
const VISAS_KEY = 'cohear_passport_visas_v1';
const ENTRIES_KEY = 'cohear_passport_entries_v1';
const STUBS_KEY = 'cohear_ticket_stubs_v1';
const OPTOUT_KEY = 'cohear_passport_optout_v1';
const PROFILE_KEY = 'cohear_passport_profile_v1';

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

function clearOptOut(id) {
  const list = readOptOut();
  if (!id || !list.includes(id)) return;
  writeArray(OPTOUT_KEY, list.filter((x) => x !== id));
}

// "I was never here" — opt out and scrub every trace of the show: history,
// ticket stub, the city's entry stamp for that date, and the country visa if no
// other entries remain under it.
export function optOutConcert(input) {
  const concert = normalizeConcert(input);
  if (!concert.id) return;
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
  const prev = history.find((item) => item.id === concert.id);
  const entry = {
    ...(prev || {}),
    ...concert,
    firstViewedAt: prev?.firstViewedAt || now,
    lastViewedAt: now,
    status: attendedAction(action) ? 'attended' : (prev?.status || 'visited'),
    actions: { ...(prev?.actions || {}), [action]: now },
    source: meta.source || prev?.source || concert.source || 'cohear',
  };
  if (attendedAction(action)) entry.attendedAt = prev?.attendedAt || now;
  writeArray(HISTORY_KEY, [entry, ...history.filter((item) => item.id !== concert.id)]);
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

// Default behaviour: just seeing a room's page stamps the passport — it issues
// the country visa (once) and adds a dated entry stamp for the city. Silent on a
// prior "I was never here" (only an explicit claimStamp re-enables that show).
export function autoStampOnView(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  recordConcertAction(input, concert.when === 'past' ? 'opened_replay' : 'joined_live', { source: 'view' });
  const visa = issueVisa(concert);
  const entry = addEntryStamp(concert);
  return { visa, entry };
}

// Manual "add to passport" — an explicit opt-in that overrides a prior
// "never here" and stamps it just like a view would.
export function claimStamp(input) {
  const id = normalizeConcert(input).id;
  if (id) clearOptOut(id);
  recordConcertAction(input, 'stamp_claimed', { source: 'passport' });
  const visa = issueVisa(input);
  const entry = addEntryStamp(input);
  return { visa, entry };
}

// --- Ticket stubs (per concert, on listen) ------------------------------------
export function claimTicketStub(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  const record = recordConcertAction(input, 'listened', { source: 'live_room' });
  if (!record) return null;
  // Listening implies presence — make sure the country/city are stamped too.
  issueVisa(concert);
  addEntryStamp(concert);
  const stubs = readStubs();
  const prev = stubs.find((stub) => stub.id === record.id);
  if (prev) return prev;
  const edition = stubs.length + 1;
  const stub = {
    ...record,
    type: 'ticket',
    issuedAt: new Date().toISOString(),
    edition,
    serial: stubSerial(record, edition),
    seat: stubSeat(record),
    prompt: ticketPrompt(record),
    token: null,
    verified: false,
  };
  writeArray(STUBS_KEY, [stub, ...stubs]);
  emitHistoryChanged();
  signToken('ticket', stub);
  return stub;
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
    when: input.when || (input.mode === 'replay' ? 'past' : 'upcoming'),
    tour: input.tour || input.name || '',
    source: input.source || input.mode || '',
  };
}

// --- FLUX prompt builders (CSS renders by default; art is generated on demand) -
export function visaPrompt({ country, rule }) {
  return [
    `Vintage passport visa sticker for ${country || 'an international destination'}.`,
    `Official immigration aesthetic: ornate guilloché security pattern, fine engraved border, a small national landmark motif, "${rule?.label || 'Tourist Visa'}" energy.`,
    'Muted ink colors on aged paper, high detail, no readable paragraph text, souvenir-grade.',
  ].join(' ');
}
export function entryPrompt(entry) {
  const place = [entry.city, entry.country].filter(Boolean).join(', ');
  return [
    `Illustrated postage stamp for ${place || 'a concert city'}, single iconic local landmark or motif,`,
    'soft gouache illustration, perforated edge, denomination lettering, vintage philatelic style, no paragraph text.',
  ].join(' ');
}
export function ticketPrompt(entry) {
  const place = [entry.venue, entry.city].filter(Boolean).join(', ');
  return [
    `Vintage concert ticket artwork for ${entry.artist || 'the headliner'} at ${place || 'the venue'} on ${entry.date || 'show night'}.`,
    'Letterpress poster look, bold retro type, halftone band illustration, aged paper, ADMIT ONE energy, no long body text.',
  ].join(' ');
}
// Back-compat alias.
export const stampPrompt = entryPrompt;

// --- Helpers ------------------------------------------------------------------
function attendedAction(action) {
  return ['attended', 'joined_live', 'opened_replay', 'listened'].includes(action);
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
// Resolve the passport's home base from the profile: an explicit lat/lng if the
// typed city was geocoded against the bundled table, otherwise null.
export function resolveHome(profile = {}) {
  const city = (profile.homeCity || '').trim();
  if (!city) return null;
  const coords = cityCoords(city, profile.homeLat, profile.homeLng);
  return coords ? { city, ...coords } : { city, lat: null, lng: null };
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
