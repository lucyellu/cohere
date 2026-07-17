import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from '../../live/maps.js';
import { cityCoords } from '../../account.js';
import { fetchTour } from '../../tour.js';
import { GOOGLE_PAPER_MAP } from '../../live/mapStyle.js';
import { useMapPref, RouteControls } from './mapPrefs.jsx';
import { makeRouteLine, disposeRouteLine, groupStops, visitsHtml } from './routeFx.js';

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
  const [showRoutes, toggleRoutes] = useMapPref('routes', true);
  const [arcs, toggleArcs] = useMapPref('arcs', true);

  // Forget this artist's (failed) fetch so the lazy-load effect tries again.
  function retryTour() {
    setTours((t) => {
      const next = { ...t };
      delete next[artist];
      return next;
    });
  }

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
  // NOTE: no cleanup-cancels here — setTours below changes `tours`, which
  // re-runs this effect, and an unmount-style `alive` flag would cancel its
  // own in-flight fetch (the old silent-hang bug). The ref marks in-flight
  // fetches instead, and late setTours calls on a gone component are no-ops.
  const inFlightRef = useRef(new Set());
  useEffect(() => {
    if (tab !== 'full' || !artist || tours[artist] || inFlightRef.current.has(artist)) return;
    inFlightRef.current.add(artist);
    setTours((t) => ({ ...t, [artist]: { stops: [], loading: true, error: null } }));
    fetchTour(artist)
      .then((res) => setTours((t) => ({ ...t, [artist]: { stops: res.stops || [], loading: false, error: null } })))
      .catch((e) => setTours((t) => ({ ...t, [artist]: { stops: [], loading: false, error: e.message || 'tour unavailable' } })))
      .finally(() => inFlightRef.current.delete(artist));
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
        <div className="flex items-center gap-2">
          <RouteControls showRoutes={showRoutes} arcs={arcs} onToggleRoutes={toggleRoutes} onToggleArcs={toggleArcs} />
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
      </div>

      <TourCanvas
        points={points}
        tab={tab}
        artist={artist}
        loading={loading}
        error={tour?.error}
        onRetry={retryTour}
        showRoutes={showRoutes}
        arcs={arcs}
      />
    </section>
  );
}

// The map (or paper-list fallback). One Google map instance, re-plotted whenever
// the selected points change — markers numbered in tour order, joined by a dashed
// route just like the passport journey map.
function TourCanvas({ points, tab, artist, loading, error, onRetry, showRoutes, arcs }) {
  const mapRef = useRef(null);
  const stateRef = useRef({ map: null, maps: null, markers: [], line: null, iw: null, fitKey: '' });
  const [err, setErr] = useState(hasMapsKey() ? null : 'missing-key');
  const [ready, setReady] = useState(false);
  // The plotting effect reads the toggles through this ref so flipping them
  // doesn't re-plot the markers; a separate effect adjusts the live polyline.
  const prefsRef = useRef({ showRoutes, arcs });
  prefsRef.current = { showRoutes, arcs };

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
          maxZoom: 16, // street level is plenty — beyond it the paper style dissolves
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
    return () => {
      cancelled = true;
      disposeRouteLine(stateRef.current.line);
    };
  }, []);

  useEffect(() => {
    const { map, maps } = stateRef.current;
    if (!map || !maps) return;
    stateRef.current.markers.forEach((m) => m.setMap(null));
    stateRef.current.markers = [];
    disposeRouteLine(stateRef.current.line);
    if (!stateRef.current.iw) stateRef.current.iw = new maps.InfoWindow();
    const iw = stateRef.current.iw;

    const bounds = new maps.LatLngBounds();
    for (const p of points) bounds.extend({ lat: Number(p.lat), lng: Number(p.lng) });

    // Multi-night stands stack into one badged pin; click it for every date.
    for (const g of groupStops(points)) {
      const count = g.visits.length;
      const latest = g.visits[count - 1];
      // On the full-tour map, stops you actually attended glow; others are faint.
      const attended = tab === 'mine' || g.visits.some((v) => v.attended);
      const marker = new maps.Marker({
        position: { lat: g.lat, lng: g.lng },
        map,
        title: count > 1
          ? `${g.city} — ${count} ${tab === 'mine' ? 'visits' : 'nights'} · click for all`
          : `${latest?.n}. ${g.city}${latest?.venue ? ` · ${latest.venue}` : ''}${latest?.date ? ` · ${latest.date}` : ''}${tab === 'full' && latest?.attended ? ' · you were here' : ''}`,
        label: { text: count > 1 ? `${count}×` : String(latest?.n ?? ''), color: '#3a2e16', fontSize: '11px', fontWeight: '800' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: attended ? (count > 1 ? 10.5 : 9) : count > 1 ? 8.5 : 7,
          fillColor: attended ? '#e8c977' : '#efe6cf',
          fillOpacity: attended ? 1 : 0.85,
          strokeColor: '#5b4a2a',
          strokeWeight: attended ? 1.5 : 1,
        },
        zIndex: attended ? 10 : 1,
      });
      if (count) {
        marker.addListener('click', () => {
          iw.setContent(visitsHtml(g));
          iw.open({ map, anchor: marker });
        });
      }
      stateRef.current.markers.push(marker);
    }

    if (points.length > 1) {
      stateRef.current.line = makeRouteLine(maps, map, points, {
        geodesic: prefsRef.current.arcs,
        visible: prefsRef.current.showRoutes,
      });
    }

    const fitKey = `${tab}:${points.map((p) => `${p.lat},${p.lng}`).join('|')}`;
    if (points.length && stateRef.current.fitKey !== fitKey) {
      if (points.length === 1) { map.setCenter(points[0]); map.setZoom(5); }
      else map.fitBounds(bounds, 56);
      stateRef.current.fitKey = fitKey;
    }
  }, [points, ready, tab]);

  // Apply the route toggles to the live polyline without re-plotting anything.
  useEffect(() => {
    const { line, map } = stateRef.current;
    if (!line) return;
    line.setOptions({ geodesic: arcs });
    line.setMap(showRoutes ? map : null);
  }, [showRoutes, arcs, points, ready]);

  const caption = tab === 'mine'
    ? `${points.length} ${points.length === 1 ? 'stop' : 'stops'} you've stamped`
    : `${points.length} tour ${points.length === 1 ? 'city' : 'cities'}`;

  function focusStop(p) {
    const { map } = stateRef.current;
    if (!map || p.lat == null) return;
    map.panTo({ lat: Number(p.lat), lng: Number(p.lng) });
    if (map.getZoom() < 8) map.setZoom(8);
  }

  if (err) {
    return <PaperFallback points={points} caption={caption} loading={loading} error={error} onRetry={onRetry} missingKey={err === 'missing-key'} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-black/55">
        <span>{caption}</span>
        {tab === 'full' && <span className="opacity-70">● filled = you were there</span>}
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_270px]">
        <div className="relative">
          <div ref={mapRef} className="h-[440px] w-full" aria-label="Artist tour map" />
          {(!ready || loading) && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 text-sm text-black/60">
              {loading ? 'Tracing the tour…' : 'Unrolling the map…'}
            </div>
          )}
          {!loading && !points.length && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 px-6 text-center text-sm text-black/60">
              {error ? (
                <TourError artist={artist} error={error} onRetry={onRetry} />
              ) : tab === 'full' ? (
                `No tour dates found for ${artist || 'this artist'} yet — new tours can take a while to appear. Check back soon.`
              ) : (
                'No stamped stops for this artist yet — join one of their live rooms and the stop pins itself here.'
              )}
            </div>
          )}
        </div>
        <TourDatesPanel points={points} tab={tab} artist={artist} loading={loading} onFocus={focusStop} />
      </div>
    </div>
  );
}

// The tour's dates and cities as a readable list beside the map — the same
// stops the pins show, in play order. Clicking a row pans the map to it.
function TourDatesPanel({ points, tab, artist, loading, onFocus }) {
  return (
    <aside className="flex max-h-[300px] flex-col border-t border-black/15 md:max-h-[440px] md:border-l md:border-t-0">
      <div className="border-b border-black/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
        {tab === 'mine' ? 'Your stops' : `${artist || 'Tour'} dates`}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {points.map((p) => (
          <li key={`${p.city}-${p.date}-${p.n}`}>
            <button
              type="button"
              onClick={() => onFocus?.(p)}
              className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 border-b border-dashed border-black/10 px-3 py-2 text-left text-xs transition hover:bg-black/[0.05] ${tab === 'full' && !p.attended ? 'opacity-70' : ''}`}
              title={`Pan the map to ${p.city}`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-bold ${tab === 'full' && !p.attended ? 'border-black/20 bg-transparent' : 'border-black/25 bg-[#e8c977]/60'}`}>{p.n}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{p.city}{tab === 'full' && p.attended ? ' ●' : ''}</span>
                {p.venue && <span className="block truncate text-[11px] opacity-60">{p.venue}</span>}
              </span>
              <span className="text-right font-mono text-[10px] opacity-60">{p.date || ''}</span>
            </button>
          </li>
        ))}
        {!points.length && (
          <li className="px-3 py-4 text-xs text-black/50">{loading ? 'Tracing the tour…' : 'No stops to list yet.'}</li>
        )}
      </ol>
    </aside>
  );
}

// Shared "couldn't fetch the tour" notice with a retry — fetchTour used to fail
// silently; now the failure is visible and recoverable in place.
function TourError({ artist, error, onRetry }) {
  return (
    <div className="pointer-events-auto grid justify-items-center gap-2">
      <span>Couldn&rsquo;t fetch {artist ? `${artist}'s` : 'the'} tour{error ? ` (${error})` : ''}.</span>
      {onRetry && (
        <button
          type="button"
          className="rounded-md border border-black/25 bg-black/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#f1e7d0] transition hover:bg-black"
          onClick={onRetry}
        >
          ↻ Retry
        </button>
      )}
    </div>
  );
}

function PaperFallback({ points, caption, loading, error, onRetry, missingKey }) {
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
        <div className="grid min-h-20 place-items-center text-sm text-black/50">
          {error ? <TourError error={error} onRetry={onRetry} /> : 'No stops to show yet.'}
        </div>
      )}
    </div>
  );
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
