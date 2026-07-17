import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from '../../live/maps.js';
import { cityCoords, haversineKm } from '../../account.js';
import { GOOGLE_PAPER_MAP } from '../../live/mapStyle.js';
import { useMapPref, RouteControls } from './mapPrefs.jsx';
import { makeRouteLine, disposeRouteLine, groupStops, visitsHtml } from './routeFx.js';

// The traveller's own map: every city you've stamped, plotted in date order and
// joined by a dashed route — your concert-hopping itinerary on a real, zoomable
// Google map styled to look like printed paper. Home (if set) bookends the trip.
// Repeat visits to a city stack into one badged pin (click it for the list),
// and the full leg-by-leg itinerary rides alongside the map.
export default function PassportMap({ entries, home }) {
  const mapRef = useRef(null);
  const stateRef = useRef({ map: null, maps: null, markers: [], line: null, iw: null, fitKey: '' });
  const [err, setErr] = useState(hasMapsKey() ? null : 'missing-key');
  const [ready, setReady] = useState(false);
  const [showRoutes, toggleRoutes] = useMapPref('routes', true);
  const [arcs, toggleArcs] = useMapPref('arcs', true);
  // The plotting effect only re-runs on data changes; it reads the current
  // toggle values through this ref so toggling never re-plots the markers.
  const prefsRef = useRef({ showRoutes, arcs });
  prefsRef.current = { showRoutes, arcs };

  const points = useMemo(() => {
    const stops = entries
      .map((e) => ({ city: e.city, artist: e.artist, date: e.date, coords: cityCoords(e.city, e.lat, e.lng) }))
      .filter((e) => e.coords)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const pts = [];
    if (home?.lat != null) pts.push({ city: home.city, lat: home.lat, lng: home.lng, home: true });
    stops.forEach((s, i) => pts.push({ city: s.city, artist: s.artist, date: s.date, lat: s.coords.lat, lng: s.coords.lng, n: i + 1 }));
    if (home?.lat != null && stops.length) pts.push({ city: home.city, lat: home.lat, lng: home.lng, home: true, end: true });
    return pts;
  }, [entries, home]);

  // Leg-by-leg distances for the side panel (home departure/return included in
  // the total, matching the passport's headline mileage).
  const itinerary = useMemo(() => {
    const rows = [];
    let prev = null;
    let total = 0;
    for (const p of points) {
      const km = prev ? haversineKm(prev, p) : 0;
      total += km;
      if (!p.home) rows.push({ ...p, km });
      prev = p;
    }
    return { rows, total };
  }, [points]);

  const stopCount = itinerary.rows.length;

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

    for (const g of groupStops(points)) {
      const count = g.visits.length;
      const latest = g.visits[count - 1];
      const marker = new maps.Marker({
        position: { lat: g.lat, lng: g.lng },
        map,
        title: g.home
          ? `Home — ${g.city}`
          : count > 1
            ? `${g.city} — ${count} visits (latest ${latest?.date || '—'}) · click for all`
            : `${latest?.n}. ${g.city}${latest?.date ? ` · ${latest.date}` : ''}`,
        label: g.home
          ? { text: '⌂', color: '#3a2e16', fontSize: '14px', fontWeight: '800' }
          : { text: count > 1 ? `${count}×` : String(latest?.n ?? ''), color: '#3a2e16', fontSize: '11px', fontWeight: '800' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: g.home ? 11 : count > 1 ? 10.5 : 9,
          fillColor: g.home ? '#e8c977' : '#f3ead0',
          fillOpacity: 1,
          strokeColor: '#5b4a2a',
          strokeWeight: count > 1 ? 2 : 1.5,
        },
        zIndex: g.home ? 999 : count > 1 ? 20 : 1,
      });
      if (!g.home && count) {
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

    const fitKey = points.map((p) => `${p.lat},${p.lng}`).join('|');
    if (points.length && stateRef.current.fitKey !== fitKey) {
      if (points.length === 1) { map.setCenter(points[0]); map.setZoom(5); }
      else map.fitBounds(bounds, 56);
      stateRef.current.fitKey = fitKey;
    }
  }, [points, ready]);

  // Apply the route toggles to the live polyline without re-plotting anything.
  useEffect(() => {
    const { line, map } = stateRef.current;
    if (!line) return;
    line.setOptions({ geodesic: arcs });
    line.setMap(showRoutes ? map : null);
  }, [showRoutes, arcs, points, ready]);

  function focusStop(p) {
    const { map } = stateRef.current;
    if (!map || p.lat == null) return;
    map.panTo({ lat: Number(p.lat), lng: Number(p.lng) });
    if (map.getZoom() < 8) map.setZoom(8);
  }

  return (
    <section className="cohear-passport-page overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 px-4 py-3">
        <h3 className="text-sm font-black uppercase tracking-[0.18em]">Your journey</h3>
        <div className="flex items-center gap-3">
          {!err && <RouteControls showRoutes={showRoutes} arcs={arcs} onToggleRoutes={toggleRoutes} onToggleArcs={toggleArcs} />}
          <span className="text-xs font-semibold uppercase tracking-[0.1em] opacity-60">
            {stopCount} {stopCount === 1 ? 'stop' : 'stops'}, in order
          </span>
        </div>
      </div>
      {err ? (
        <PaperFallback points={points} missingKey={err === 'missing-key'} />
      ) : (
        <div className="grid md:grid-cols-[minmax(0,1fr)_270px]">
          <div className="relative">
            <div ref={mapRef} className="h-[460px] w-full" aria-label="Your chronological concert map" />
            {!ready && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 text-sm text-black/60">
                Unrolling the map…
              </div>
            )}
          </div>
          <ItineraryPanel rows={itinerary.rows} totalKm={itinerary.total} home={home} onFocus={focusStop} />
        </div>
      )}
    </section>
  );
}

// The leg-by-leg travel log beside the map: city, who you saw, when, and how
// far that hop was. Clicking a row pans the map to the stop.
function ItineraryPanel({ rows, totalKm, home, onFocus }) {
  return (
    <aside className="flex max-h-[300px] flex-col border-t border-black/15 md:max-h-[460px] md:border-l md:border-t-0">
      <div className="border-b border-black/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
        Itinerary{home?.lat != null && home?.city ? ` · from ${home.city}` : ''}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((p) => (
          <li key={`${p.n}-${p.city}-${p.date}`}>
            <button
              type="button"
              onClick={() => onFocus?.(p)}
              className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 border-b border-dashed border-black/10 px-3 py-2 text-left text-xs transition hover:bg-black/[0.05]"
              title={`Pan the map to ${p.city}`}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full border border-black/25 bg-black/[0.04] text-[10px] font-bold">{p.n}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{p.city}</span>
                {p.artist && <span className="block truncate text-[11px] opacity-60">{p.artist}</span>}
              </span>
              <span className="text-right font-mono text-[10px] leading-tight opacity-60">
                {p.date || ''}
                <br />
                {p.km >= 1 ? `+${Math.round(p.km).toLocaleString()} km` : '·'}
              </span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-4 text-xs text-black/50">No stamped cities yet.</li>}
      </ol>
      <div className="border-t border-black/15 px-3 py-2 text-right font-mono text-[11px] font-bold opacity-75">
        ≈ {Math.round(totalKm).toLocaleString()} km travelled
      </div>
    </aside>
  );
}

// No Maps key (or it failed) — still show the itinerary as a numbered paper list.
function PaperFallback({ points, missingKey }) {
  const stops = points.filter((p) => !p.home);
  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-black/50">
        {missingKey
          ? 'Add a Google Maps key to see the live map — here’s your route in the meantime.'
          : 'Map unavailable right now — here’s your route.'}
      </p>
      {stops.length ? (
        <ol className="grid gap-1.5">
          {stops.map((p) => (
            <li key={`${p.city}-${p.date}`} className="flex items-center gap-3 border-b border-dashed border-black/15 pb-1.5 text-sm">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full border border-black/30 bg-black/[0.04] text-[11px] font-bold">{p.n}</span>
              <span className="font-semibold">{p.city}</span>
              <span className="ml-auto font-mono text-xs opacity-60">{p.date || ''}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="grid min-h-20 place-items-center text-sm text-black/50">No stamped cities yet.</p>
      )}
    </div>
  );
}
