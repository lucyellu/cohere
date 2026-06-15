// Tour data layer: fetch JamBase events through the gateway and normalize the
// raw (mock or live) payload into flat "stops" the globe and list can render.

// source: 'live' = real JamBase search, 'mock' = curated demo tour.
export async function fetchTour(artist, source = 'live') {
  const res = await fetch(`/api/jambase/events?artist=${encodeURIComponent(artist)}&source=${source}`);
  const payload = await res.json();
  const events = payload?.data?.events || [];
  return { stops: normalize(events), mode: payload?.mode, ok: payload?.ok };
}

function normalize(events) {
  return events
    .map((e) => {
      const loc = e.location || {};
      const addr = loc.address || {};
      const geo = loc.geo || {};
      const lat = Number(geo.latitude);
      const lng = Number(geo.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null; // can't place on globe
      return {
        id: e.identifier || `${loc.name}-${e.startDate}`,
        artist: e.performer?.[0]?.name || 'Unknown',
        venue: loc.name || 'Unknown venue',
        city: addr.addressLocality || '',
        // JamBase v3 returns region/country as objects ({name, identifier}); mocks use strings.
        region: txt(addr.addressRegion),
        country: txt(addr.addressCountry),
        lat,
        lng,
        date: e.startDate || '',
        // JamBase sometimes omits capacity; null sorts last and renders as "—".
        capacity: toNum(loc.maximumAttendeeCapacity ?? loc.capacity),
        setlist: Array.isArray(e.setlist) ? e.setlist : [],
      };
    })
    .filter(Boolean);
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Read a value that may be a plain string or a schema.org object ({name, identifier}).
function txt(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.name || v.identifier || '';
}

export const SORTS = {
  date: { label: 'Date', fn: (a, b) => a.date.localeCompare(b.date) },
  capacity: {
    label: 'Capacity (biggest)',
    fn: (a, b) => (b.capacity ?? -1) - (a.capacity ?? -1),
  },
  venue: { label: 'Venue (A–Z)', fn: (a, b) => a.venue.localeCompare(b.venue) },
  city: { label: 'City (A–Z)', fn: (a, b) => a.city.localeCompare(b.city) },
};

export function sortStops(stops, key) {
  const sort = SORTS[key] || SORTS.date;
  return [...stops].sort(sort.fn);
}

// The tour route is always chronological regardless of how the list is sorted.
export function chronological(stops) {
  return [...stops].sort((a, b) => a.date.localeCompare(b.date));
}

export function fmtCapacity(n) {
  return n == null ? '—' : n.toLocaleString();
}

export function fmtDate(iso) {
  if (!iso) return '';
  // JamBase v3 dates include a time ("2026-06-20T21:00:00"); mocks are date-only.
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
