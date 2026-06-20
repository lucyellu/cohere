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
// Fallback country inference for common concert cities lacking explicit country data.
const CITY_COUNTRY = {
  toronto: 'Canada', montreal: 'Canada', vancouver: 'Canada', calgary: 'Canada', ottawa: 'Canada',
  london: 'United Kingdom', manchester: 'United Kingdom', glasgow: 'United Kingdom', dublin: 'Ireland',
  paris: 'France', berlin: 'Germany', madrid: 'Spain', barcelona: 'Spain', amsterdam: 'Netherlands',
  rome: 'Italy', milan: 'Italy', lisbon: 'Portugal', zurich: 'Switzerland', vienna: 'Austria',
  tokyo: 'Japan', osaka: 'Japan', seoul: 'South Korea', singapore: 'Singapore', sydney: 'Australia',
  melbourne: 'Australia', auckland: 'New Zealand', 'mexico-city': 'Mexico', 'sao-paulo': 'Brazil',
  'rio-de-janeiro': 'Brazil', mumbai: 'India', dubai: 'United Arab Emirates',
};

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
  const next = { ...readProfile(), ...patch };
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
  const stamp = {
    id,
    type: 'entry',
    city: concert.city,
    country,
    date,
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

function emitHistoryChanged() {
  window.dispatchEvent(new Event(HISTORY_EVENT));
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
