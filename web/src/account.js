export const HISTORY_EVENT = 'cohear:history-changed';

const HISTORY_KEY = 'cohear_concert_history_v1';
const STAMPS_KEY = 'cohear_passport_stamps_v1';
const STUBS_KEY = 'cohear_ticket_stubs_v1';
const OPTOUT_KEY = 'cohear_passport_optout_v1';

export function readHistory() {
  return readArray(HISTORY_KEY);
}

export function readStamps() {
  return readArray(STAMPS_KEY);
}

export function readStubs() {
  return readArray(STUBS_KEY);
}

// Shows the visitor has said "I was never here" for. Sticky: auto-stamping and
// passive recording both skip these until the visitor explicitly opts back in
// (a manual Claim stamp).
export function readOptOut() {
  return readArray(OPTOUT_KEY);
}

export function isOptedOut(id) {
  return id ? readOptOut().includes(id) : false;
}

function clearOptOut(id) {
  const list = readOptOut();
  if (!id || !list.includes(id)) return;
  writeArray(OPTOUT_KEY, list.filter((x) => x !== id));
}

// "I was never here" — opt out and scrub every trace of the show from the
// passport (history, stamp, ticket stub).
export function optOutConcert(input) {
  const concert = normalizeConcert(input);
  if (!concert.id) return;
  const list = readOptOut();
  if (!list.includes(concert.id)) writeArray(OPTOUT_KEY, [concert.id, ...list]);
  writeArray(HISTORY_KEY, readHistory().filter((item) => item.id !== concert.id));
  writeArray(STAMPS_KEY, readStamps().filter((stamp) => stamp.id !== concert.id));
  writeArray(STUBS_KEY, readStubs().filter((stub) => stub.id !== concert.id));
  emitHistoryChanged();
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
    actions: {
      ...(prev?.actions || {}),
      [action]: now,
    },
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

export function claimStamp(input) {
  // A manual claim is an explicit opt-in — it overrides a prior "never here".
  const id = normalizeConcert(input).id;
  if (id) clearOptOut(id);
  const entry = recordConcertAction(input, 'stamp_claimed', { source: 'passport' });
  if (!entry) return null;
  const stamps = readStamps();
  const prev = stamps.find((stamp) => stamp.id === entry.id);
  if (prev) return prev;
  const stamp = {
    ...entry,
    issuedAt: new Date().toISOString(),
    edition: stamps.length + 1,
    serial: stampSerial(entry, stamps.length + 1),
    prompt: stampPrompt(entry),
  };
  writeArray(STAMPS_KEY, [stamp, ...stamps]);
  emitHistoryChanged();
  return stamp;
}

// Default behaviour: just seeing a room's page stamps the passport. Silent on a
// prior "I was never here" — only an explicit claimStamp re-enables that show.
export function autoStampOnView(input) {
  const id = normalizeConcert(input).id;
  if (!id || isOptedOut(id)) return null;
  return claimStamp(input);
}

// Earned the moment you listen to at least one song while in the room. A ticket
// stub is a separate collectible from the passport stamp.
export function claimTicketStub(input) {
  const concert = normalizeConcert(input);
  if (!concert.id || isOptedOut(concert.id)) return null;
  const entry = recordConcertAction(input, 'listened', { source: 'live_room' });
  if (!entry) return null;
  const stubs = readStubs();
  const prev = stubs.find((stub) => stub.id === entry.id);
  if (prev) return prev;
  const edition = stubs.length + 1;
  const stub = {
    ...entry,
    issuedAt: new Date().toISOString(),
    edition,
    serial: stubSerial(entry, edition),
    seat: stubSeat(entry),
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

export function stampPrompt(entry) {
  const place = [entry.city, entry.country].filter(Boolean).join(', ');
  const date = entry.date || 'undated';
  const tour = entry.tour ? `, ${entry.tour}` : '';
  return [
    `Collectible concert passport stamp for ${entry.artist || 'the artist'} at ${entry.venue || 'the venue'} in ${place || 'the concert city'} on ${date}${tour}.`,
    'Design it as a tactile ink stamp on textured paper, unique to the event, with visual motifs from the artist identity and city, no readable body text except short event lettering, high contrast, souvenir-grade.'
  ].join(' ');
}

function attendedAction(action) {
  return ['attended', 'joined_live', 'opened_replay', 'listened'].includes(action);
}

function stampSerial(entry, edition) {
  return `COH-${hash(`${entry.id}:${entry.artist}:${entry.date}`).slice(0, 6).toUpperCase()}-${String(edition).padStart(4, '0')}`;
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
