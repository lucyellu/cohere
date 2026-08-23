import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasMapsKey } from './maps.js';

// Satellite zoom on the exact venue, with a pulsing "LIVE" dot and a live-viewer
// overlay — "you and N others are here, watching from anywhere." A Street View
// peek drops you right at the venue gates with camera aimed directly at the structure.
// Degrades to a static link if no key is present.

function computeHeading(from, to) {
  const fromLat = (from.lat * Math.PI) / 180;
  const fromLng = (from.lng * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const toLng = (to.lng * Math.PI) / 180;
  const dLng = toLng - fromLng;

  const y = Math.sin(dLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  const heading = (Math.atan2(y, x) * 180) / Math.PI;
  return (heading + 360) % 360;
}

export default function VenueMap({ venue, city, lat, lng, live, viewers }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);
  const [viewMode, setViewMode] = useState('hybrid'); // 'hybrid' | 'roadmap' | 'street'
  const [mapObj, setMapObj] = useState(null);
  const [venueCoords, setVenueCoords] = useState(null);

  // Clean / normalize venue name: e.g. fix "Rogers Stadrium" / "Rogers Stadium" in Toronto -> "Rogers Centre"
  const normalizedVenue = (venue || '')
    .replace(/stadrium/gi, 'Centre')
    .replace(/rogers\s+stadium/gi, 'Rogers Centre');
  const displayVenue = normalizedVenue || venue || 'Rogers Centre';
  const displayCity = city || 'Toronto';

  useEffect(() => {
    if (!mapObj) return;
    const pano = mapObj.getStreetView();

    if (viewMode === 'hybrid' || viewMode === 'roadmap') {
      mapObj.setMapTypeId(viewMode);
      if (pano) pano.setVisible(false);
    } else if (viewMode === 'street') {
      const center = venueCoords || (mapObj.getCenter() ? { lat: mapObj.getCenter().lat(), lng: mapObj.getCenter().lng() } : null);
      if (!center) return;

      if (window.google?.maps) {
        const maps = window.google.maps;
        const sv = new maps.StreetViewService();
        // Try to find nearest outdoor street view panorama within 350m
        sv.getPanorama(
          {
            location: center,
            radius: 350,
            preference: maps.StreetViewPreference?.NEAREST || 'nearest',
            source: maps.StreetViewSource?.OUTDOOR || 'outdoor',
          },
          (data, status) => {
            if (status === 'OK' && data?.location?.latLng) {
              const panoLat = data.location.latLng.lat();
              const panoLng = data.location.latLng.lng();
              const heading = computeHeading({ lat: panoLat, lng: panoLng }, center);

              pano.setPano(data.location.pano);
              pano.setPov({ heading, pitch: 10 });
              pano.setOptions({
                disableDefaultUI: false,
                panControl: true,
                zoomControl: true,
                addressControl: true,
                fullscreenControl: false,
                motionTracking: false,
                linksControl: true,
              });
              pano.setVisible(true);
            } else {
              // Expand search radius to 1000m
              sv.getPanorama(
                { location: center, radius: 1000 },
                (data2, status2) => {
                  if (status2 === 'OK' && data2?.location?.latLng) {
                    const panoLat = data2.location.latLng.lat();
                    const panoLng = data2.location.latLng.lng();
                    const heading = computeHeading({ lat: panoLat, lng: panoLng }, center);
                    pano.setPano(data2.location.pano);
                    pano.setPov({ heading, pitch: 10 });
                    pano.setVisible(true);
                  } else {
                    pano.setPosition(center);
                    pano.setPov({ heading: 0, pitch: 10 });
                    pano.setVisible(true);
                  }
                }
              );
            }
          }
        );
      } else {
        pano.setPosition(center);
        pano.setVisible(true);
      }
    }
  }, [viewMode, mapObj, venueCoords]);

  useEffect(() => {
    if (!hasMapsKey()) {
      setErr('nokey');
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then(async (maps) => {
        if (cancelled || !mapRef.current) return;

        // Specific well-known coordinates for Rogers Centre downtown Toronto (1 Blue Jays Way)
        const isRogersCentre = /rogers\s*(centre|center|stadium|stadrium)/i.test(displayVenue) && /toronto/i.test(displayCity);
        let center = isRogersCentre
          ? { lat: 43.6414, lng: -79.3894 }
          : Number(lat) && Number(lng) ? { lat: Number(lat), lng: Number(lng) } : null;

        if (!center) {
          try {
            const geocoder = new maps.Geocoder();
            const { results } = await geocoder.geocode({ address: `${displayVenue}, ${displayCity}` });
            if (results?.[0]?.geometry?.location) {
              center = { lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() };
            }
          } catch {
            /* fall back to coords below */
          }
        }
        if (!center) center = { lat: 43.6414, lng: -79.3894 };
        if (cancelled) return;

        setVenueCoords(center);

        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 17,
          mapTypeId: 'hybrid', // satellite + labels
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          tilt: 0,
        });
        setMapObj(map);
        new maps.Marker({
          position: center,
          map,
          title: displayVenue,
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
  }, [lat, lng, displayVenue, displayCity, live]);

  if (err) {
    const q = encodeURIComponent(`${displayVenue} ${displayCity}`);
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 p-4 text-center">
        <div className="text-3xl">📍</div>
        <p className="text-sm font-medium text-zinc-200">{displayVenue}</p>
        <p className="text-xs text-zinc-500">{displayCity}</p>
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
          <p className="text-sm font-semibold text-zinc-100">{displayVenue}</p>
          <p className="text-[11px] text-zinc-400">{displayCity}</p>
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
