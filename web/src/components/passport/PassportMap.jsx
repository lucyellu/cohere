import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from '../../live/maps.js';
import { cityCoords } from '../../account.js';
import { GOOGLE_PAPER_MAP } from '../../live/mapStyle.js';
import { useMapPref, RouteControls } from './mapPrefs.jsx';

// The traveller's own map: every city you've stamped, plotted in date order and
// joined by a dashed route — your concert-hopping itinerary on a real, zoomable
// Google map styled to look like printed paper. Home (if set) bookends the trip.
export default function PassportMap({ entries, home }) {
  const mapRef = useRef(null);
  const stateRef = useRef({ map: null, maps: null, markers: [], line: null, fitKey: '' });
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
      .map((e) => ({ city: e.city, date: e.date, coords: cityCoords(e.city, e.lat, e.lng) }))
      .filter((e) => e.coords)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const pts = [];
    if (home?.lat != null) pts.push({ city: home.city, lat: home.lat, lng: home.lng, home: true });
    stops.forEach((s, i) => pts.push({ city: s.city, date: s.date, lat: s.coords.lat, lng: s.coords.lng, n: i + 1 }));
    if (home?.lat != null && stops.length) pts.push({ city: home.city, lat: home.lat, lng: home.lng, home: true, end: true });
    return pts;
  }, [entries, home]);

  const stopCount = points.filter((p) => !p.home).length;

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
      const marker = new maps.Marker({
        position,
        map,
        title: p.home ? `Home — ${p.city}` : `${p.n}. ${p.city}${p.date ? ` · ${p.date}` : ''}`,
        label: p.home
          ? { text: '⌂', color: '#3a2e16', fontSize: '14px', fontWeight: '800' }
          : { text: String(p.n), color: '#3a2e16', fontSize: '11px', fontWeight: '800' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: p.home ? 11 : 9,
          fillColor: p.home ? '#e8c977' : '#f3ead0',
          fillOpacity: 1,
          strokeColor: '#5b4a2a',
          strokeWeight: 1.5,
        },
        zIndex: p.home ? 999 : 1,
      });
      stateRef.current.markers.push(marker);
    }

    if (points.length > 1) {
      const dash = { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#5b4a2a', scale: 2 };
      stateRef.current.line = new maps.Polyline({
        path: points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
        geodesic: prefsRef.current.arcs,
        strokeOpacity: 0,
        icons: [{ icon: dash, offset: '0', repeat: '12px' }],
        map: prefsRef.current.showRoutes ? map : null,
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
        <div className="relative">
          <div ref={mapRef} className="h-[460px] w-full" aria-label="Your chronological concert map" />
          {!ready && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/70 text-sm text-black/60">
              Unrolling the map…
            </div>
          )}
        </div>
      )}
    </section>
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
