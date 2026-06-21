import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from '../../live/maps.js';
import { cityCoords } from '../../account.js';
import { fetchTour } from '../../tour.js';
import { GOOGLE_PAPER_MAP } from '../../live/mapStyle.js';

// Per-artist tour route, in the same paper-map style as the passport journey.
// Two tabs:
//   • "Your stops" — only the venues you actually have stamps for, in date order.
//   • "Full tour"  — every city on that artist's tour (fetched live), dashed and
//                     numbered in the order they play, with your stops highlighted.
export default function ArtistTourMap({ stubs = [], entries = [] }) {
  const artists = useMemo(() => {
    const set = new Set();
    for (const s of [...stubs, ...entries]) if (s.artist) set.add(s.artist);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [stubs, entries]);

  const [artist, setArtist] = useState(artists[0] || '');
  const [tab, setTab] = useState('mine'); // 'mine' | 'full'
  const [tours, setTours] = useState({}); // artist -> { stops, loading, error }

  // Keep the selected artist valid as the list changes.
  useEffect(() => {
    if (artists.length && !artists.includes(artist)) setArtist(artists[0]);
  }, [artists, artist]);

  // The shows you hold stamps/tickets for, for this artist, placed + date-ordered.
  const myStops = useMemo(() => {
    const seen = new Map();
    for (const r of [...stubs, ...entries]) {
      if (r.artist !== artist) continue;
      const date = (r.date || '').slice(0, 10);
      const key = `${slug(r.city)}|${date}`;
      const coords = cityCoords(r.city, r.lat, r.lng);
      if (!coords) continue;
      const prev = seen.get(key);
      // Prefer the record that carries a venue (ticket stub) over a bare entry.
      if (!prev || (!prev.venue && r.venue)) {
        seen.set(key, { city: r.city, venue: r.venue || prev?.venue || '', date, lat: coords.lat, lng: coords.lng });
      }
    }
    return [...seen.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [stubs, entries, artist]);

  // Set of "I was here" keys, for highlighting stops on the full-tour map.
  const attendedKeys = useMemo(() => {
    const cityDates = new Set();
    const venues = new Set();
    for (const r of [...stubs, ...entries]) {
      if (r.artist !== artist) continue;
      cityDates.add(`${slug(r.city)}|${(r.date || '').slice(0, 10)}`);
      if (r.venue) venues.add(slug(r.venue));
    }
    return { cityDates, venues };
  }, [stubs, entries, artist]);

  // Fetch the full tour lazily, the first time its tab is opened for an artist.
  useEffect(() => {
    if (tab !== 'full' || !artist || tours[artist]) return;
    let alive = true;
    setTours((t) => ({ ...t, [artist]: { stops: [], loading: true, error: null } }));
    fetchTour(artist)
      .then((res) => {
        if (alive) setTours((t) => ({ ...t, [artist]: { stops: res.stops || [], loading: false, error: null } }));
      })
      .catch((e) => {
        if (alive) setTours((t) => ({ ...t, [artist]: { stops: [], loading: false, error: e.message || 'tour unavailable' } }));
      });
    return () => { alive = false; };
  }, [tab, artist, tours]);

  const tour = tours[artist];
  const fullStops = useMemo(() => {
    if (!tour?.stops?.length) return [];
    return [...tour.stops]
      .map((s) => {
        const coords = cityCoords(s.city, s.lat, s.lng) || (s.lat != null ? { lat: +s.lat, lng: +s.lng } : null);
        if (!coords) return null;
        const date = (s.date || '').slice(0, 10);
        const attended = attendedKeys.cityDates.has(`${slug(s.city)}|${date}`) || (s.venue && attendedKeys.venues.has(slug(s.venue)));
        return { city: s.city, venue: s.venue, date, lat: coords.lat, lng: coords.lng, attended };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [tour, attendedKeys]);

  const stops = tab === 'mine' ? myStops : fullStops;
  const points = useMemo(() => stops.map((s, i) => ({ ...s, n: i + 1 })), [stops]);
  const loading = tab === 'full' && tour?.loading;

  if (!artists.length) return null;

  return (
    <section className="cohear-passport-page overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-black uppercase tracking-[0.18em]">Tour routes</h3>
          <select
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className="rounded-md border border-black/20 bg-black/[0.04] px-2 py-1 text-xs font-semibold text-black/80 outline-none"
            aria-label="Choose artist"
          >
            {artists.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-black/20">
          {[{ id: 'mine', label: 'Your stops' }, { id: 'full', label: 'Full tour' }].map((t) => (
            <button
              key={t.id}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] transition ${tab === t.id ? 'bg-black/80 text-[var(--paper,#f1e7d0)]' : 'bg-transparent text-black/60 hover:text-black/90'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <TourCanvas points={points} tab={tab} loading={loading} error={tour?.error} />
    </section>
  );
}

// The map (or paper-list fallback). One Google map instance, re-plotted whenever
// the selected points change — markers numbered in tour order, joined by a dashed
// route just like the passport journey map.
function TourCanvas({ points, tab, loading, error }) {
  const mapRef = useRef(null);
  const stateRef = useRef({ map: null, maps: null, markers: [], line: null, fitKey: '' });
  const [err, setErr] = useState(hasMapsKey() ? null : 'missing-key');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasMapsKey()) return undefined;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;
        stateRef.current.maps = maps;
        stateRef.current.map = new maps.Map(mapRef.current, {
          center: { lat: 25, lng: 0 },
          zoom: 2,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          backgroundColor: '#a9c4cc',
          styles: GOOGLE_PAPER_MAP,
        });
        setReady(true);
        setErr(null);
      })
      .catch((e) => setErr(e.message || 'map failed'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const { map, maps } = stateRef.current;
    if (!map || !maps) return;
    stateRef.current.markers.forEach((m) => m.setMap(null));
    stateRef.current.markers = [];
    if (stateRef.current.line) stateRef.current.line.setMap(null);

    const bounds = new maps.LatLngBounds();
    for (const p of points) {
      const position = { lat: Number(p.lat), lng: Number(p.lng) };
      bounds.extend(position);
      // On the full-tour map, stops you actually attended glow; others are faint.
      const attended = tab === 'mine' || p.attended;
      const marker = new maps.Marker({
        position,
        map,
        title: `${p.n}. ${p.city}${p.venue ? ` · ${p.venue}` : ''}${p.date ? ` · ${p.date}` : ''}${tab === 'full' && p.attended ? ' · you were here' : ''}`,
        label: { text: String(p.n), color: '#3a2e16', fontSize: '11px', fontWeight: '800' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: attended ? 9 : 7,
          fillColor: attended ? '#e8c977' : '#efe6cf',
          fillOpacity: attended ? 1 : 0.85,
          strokeColor: '#5b4a2a',
          strokeWeight: attended ? 1.5 : 1,
        },
        zIndex: attended ? 10 : 1,
      });
      stateRef.current.markers.push(marker);
    }

    if (points.length > 1) {
      const dash = { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#5b4a2a', scale: 2 };
      stateRef.current.line = new maps.Polyline({
        path: points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
        geodesic: true,
        strokeOpacity: 0,
        icons: [{ icon: dash, offset: '0', repeat: '12px' }],
        map,
      });
    }

    const fitKey = `${tab}:${points.map((p) => `${p.lat},${p.lng}`).join('|')}`;
    if (points.length && stateRef.current.fitKey !== fitKey) {
      if (points.length === 1) { map.setCenter(points[0]); map.setZoom(5); }
      else map.fitBounds(bounds, 56);
      stateRef.current.fitKey = fitKey;
    }
  }, [points, ready, tab]);

  const caption = tab === 'mine'
    ? `${points.length} ${points.length === 1 ? 'stop' : 'stops'} you've stamped`
    : `${points.length} tour ${points.length === 1 ? 'city' : 'cities'}`;

  if (err) {
    return <PaperFallback points={points} caption={caption} loading={loading} error={error} missingKey={err === 'missing-key'} />;
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-black/55">
        <span>{caption}</span>
        {tab === 'full' && <span className="opacity-70">● filled = you were there</span>}
      </div>
      <div ref={mapRef} className="h-[440px] w-full" aria-label="Artist tour map" />
      {(!ready || loading) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 text-sm text-black/60">
          {loading ? 'Tracing the tour…' : 'Unrolling the map…'}
        </div>
      )}
      {!loading && !points.length && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 px-6 text-center text-sm text-black/60">
          {error ? 'Tour unavailable right now.' : tab === 'full' ? 'No tour dates found for this artist yet.' : 'No stamped stops for this artist yet.'}
        </div>
      )}
    </div>
  );
}

function PaperFallback({ points, caption, loading, error, missingKey }) {
  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-black/50">
        {missingKey
          ? 'Add a Google Maps key to see the live map — here’s the route in the meantime.'
          : 'Map unavailable right now — here’s the route.'}
      </p>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-black/55">{caption}</p>
      {loading ? (
        <p className="grid min-h-20 place-items-center text-sm text-black/50">Tracing the tour…</p>
      ) : points.length ? (
        <ol className="grid gap-1.5">
          {points.map((p) => (
            <li key={`${p.city}-${p.date}-${p.n}`} className="flex items-center gap-3 border-b border-dashed border-black/15 pb-1.5 text-sm">
              <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] font-bold ${p.attended === false ? 'border-black/20 bg-transparent' : 'border-black/30 bg-black/[0.04]'}`}>{p.n}</span>
              <span className="min-w-0">
                <span className="font-semibold">{p.city}</span>
                {p.venue ? <span className="ml-2 text-xs opacity-60">{p.venue}</span> : null}
              </span>
              <span className="ml-auto font-mono text-xs opacity-60">{p.date || ''}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="grid min-h-20 place-items-center text-sm text-black/50">
          {error ? 'Tour unavailable right now.' : 'No stops to show yet.'}
        </p>
      )}
    </div>
  );
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
