import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from './maps.js';

// Satellite zoom on the exact venue, with a pulsing "LIVE" dot and a live-viewer
// overlay — "you and N others are here, watching from anywhere." A Street View
// peek drops you at the gates. Degrades to a static link if no key is present.

export default function VenueMap({ venue, city, lat, lng, live, viewers }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);
  const [viewMode, setViewMode] = useState('hybrid'); // 'hybrid' | 'roadmap' | 'street'
  const [mapObj, setMapObj] = useState(null);

  useEffect(() => {
    if (!mapObj) return;
    if (viewMode === 'hybrid' || viewMode === 'roadmap') {
      mapObj.setMapTypeId(viewMode);
      mapObj.getStreetView().setVisible(false);
    } else if (viewMode === 'street') {
      const pano = mapObj.getStreetView();
      pano.setOptions({
        position: mapObj.getCenter(),
        pov: { heading: 165, pitch: 0 },
        zoom: 0,
        disableDefaultUI: true,
      });
      pano.setVisible(true);
    }
  }, [viewMode, mapObj]);

  useEffect(() => {
    if (!hasMapsKey()) {
      setErr('nokey');
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then(async (maps) => {
        if (cancelled || !mapRef.current) return;

        // Accuracy: geocode the venue BY NAME (so "Rogers Stadium, Toronto"
        // lands on the actual stadium) rather than trusting a hardcoded coord.
        // Fall back to provided lat/lng, then a default.
        let center = Number(lat) && Number(lng) ? { lat: Number(lat), lng: Number(lng) } : null;
        try {
          const geocoder = new maps.Geocoder();
          const { results } = await geocoder.geocode({ address: `${venue}, ${city}` });
          if (results?.[0]?.geometry?.location) {
            center = { lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() };
          }
        } catch {
          /* fall back to coords below */
        }
        if (!center) center = { lat: 43.7460, lng: -79.4768 };
        if (cancelled) return;

        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 16,
          mapTypeId: 'hybrid', // satellite + labels
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          tilt: 0,
        });
        setMapObj(map);
        new maps.Marker({
          position: center,
          map,
          title: venue,
        });
        // Pulsing "live" ring drawn as a self-animating circle.
        if (live) {
          const ring = new maps.Circle({
            map,
            center,
            radius: 120,
            strokeColor: '#f43f5e',
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: '#f43f5e',
            fillOpacity: 0.15,
          });
          let r = 80, growing = true;
          const timer = setInterval(() => {
            r += growing ? 8 : -8;
            if (r > 260) growing = false;
            if (r < 80) growing = true;
            ring.setRadius(r);
            ring.setOptions({ fillOpacity: 0.22 - (r - 80) / 1800 });
          }, 90);
          map.__ringTimer = timer;
        }
      })
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [lat, lng, venue, live]);

  if (err) {
    const q = encodeURIComponent(`${venue} ${city}`);
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 p-4 text-center">
        <div className="text-3xl">📍</div>
        <p className="text-sm font-medium text-zinc-200">{venue}</p>
        <p className="text-xs text-zinc-500">{city}</p>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${q}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/20"
        >
          Open in Google Maps →
        </a>
        {err === 'nokey' && (
          <p className="max-w-xs text-[10px] text-zinc-600">
            Set VITE_GOOGLE_MAPS_KEY in web/.env to embed the satellite view.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapRef} className="h-full w-full" />

      {/* Live + viewers overlay */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-rose-300 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> LIVE
          </span>
        )}
        {viewers != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-zinc-200 backdrop-blur">
            👥 {viewers.toLocaleString()} here now
          </span>
        )}
      </div>

      {/* Venue label + street view toggle */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
        <div className="rounded-lg bg-black/70 px-3 py-1.5 backdrop-blur">
          <p className="text-sm font-semibold text-zinc-100">{venue}</p>
          <p className="text-[11px] text-zinc-400">{city}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode((v) => (v === 'roadmap' ? 'hybrid' : 'roadmap'))}
            className="pointer-events-auto rounded-lg bg-black/70 px-3 py-1.5 text-[11px] font-medium text-zinc-200 backdrop-blur hover:bg-black/90"
          >
            {viewMode === 'roadmap' ? '🗺️ Map' : '🛰️ Satellite'}
          </button>
          <button
            onClick={() => setViewMode((v) => (v === 'street' ? 'hybrid' : 'street'))}
            className="pointer-events-auto rounded-lg bg-black/70 px-3 py-1.5 text-[11px] font-medium text-zinc-200 backdrop-blur hover:bg-black/90"
          >
            🚶 Street View
          </button>
        </div>
      </div>
    </div>
  );
}
