export const HISTORY_EVENT = 'cohear:history-changed';

const HISTORY_KEY = 'cohear_concert_history_v1';
const STAMPS_KEY = 'cohear_passport_stamps_v1';

export function readHistory() {
  return readArray(HISTORY_KEY);
}

export function readStamps() {
  return readArray(STAMPS_KEY);
}

export function recordConcertAction(input, action = 'viewed', meta = {}) {
  const concert = normalizeConcert(input);
  if (!concert.id) return null;
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
  return recordConcertAction(input, 'attended', { source: 'manual' });
}

export function claimStamp(input) {
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
  return ['attended', 'joined_live', 'opened_replay'].includes(action);
}

function stampSerial(entry, edition) {
  return `COH-${hash(`${entry.id}:${entry.artist}:${entry.date}`).slice(0, 6).toUpperCase()}-${String(edition).padStart(4, '0')}`;
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
