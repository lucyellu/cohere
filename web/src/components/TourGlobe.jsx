import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { chronological } from '../tour.js';

// Color a venue point on an indigo → amber ramp by capacity, so the biggest
// shows literally glow brighter. Selected stop renders larger + white.
function capacityColor(cap, maxCap) {
  if (cap == null || !maxCap) return '#6366f1';
  const t = Math.min(1, cap / maxCap);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const r = lerp(99, 251), g = lerp(102, 191), b = lerp(241, 36);
  return `rgb(${r},${g},${b})`;
}

export default function TourGlobe({ stops, selectedId, onSelect }) {
  const globeRef = useRef();
  const wrapRef = useRef();
  const [size, setSize] = useState({ w: 600, h: 480 });

  // Responsive sizing so it works on phones/tablet.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(360, Math.min(560, el.clientWidth * 0.75)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Gentle auto-rotation.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.45;
    c.enableZoom = true;
    g.pointOfView({ altitude: 2.4 }, 0);
  }, []);

  const maxCap = useMemo(() => Math.max(0, ...stops.map((s) => s.capacity || 0)), [stops]);

  // Tour route arcs follow chronological order, not the list sort.
  const arcs = useMemo(() => {
    const route = chronological(stops);
    const out = [];
    for (let i = 0; i < route.length - 1; i++) {
      out.push({
        startLat: route[i].lat,
        startLng: route[i].lng,
        endLat: route[i + 1].lat,
        endLng: route[i + 1].lng,
      });
    }
    return out;
  }, [stops]);

  // Fly to the selected stop.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selectedId) return;
    const s = stops.find((x) => x.id === selectedId);
    if (s) g.pointOfView({ lat: s.lat, lng: s.lng, altitude: 1.7 }, 900);
  }, [selectedId, stops]);

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#6366f1"
        atmosphereAltitude={0.18}
        pointsData={stops}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(d) => (d.id === selectedId ? 0.14 : 0.04 + (d.capacity || 0) / (maxCap || 1) * 0.06)}
        pointRadius={(d) => (d.id === selectedId ? 0.55 : 0.32)}
        pointColor={(d) => (d.id === selectedId ? '#ffffff' : capacityColor(d.capacity, maxCap))}
        pointLabel={(d) =>
          `<div style="font:600 12px sans-serif;color:#fff;background:#111;padding:6px 8px;border-radius:6px;border:1px solid #333">
             ${d.venue}<br/><span style="color:#a1a1aa">${d.city} · ${d.date}</span>
           </div>`
        }
        onPointClick={(d) => onSelect(d.id)}
        arcsData={arcs}
        arcColor={() => ['rgba(99,102,241,0.1)', 'rgba(52,211,153,0.85)']}
        arcStroke={0.5}
        arcDashLength={0.5}
        arcDashGap={0.25}
        arcDashAnimateTime={2200}
        arcsTransitionDuration={0}
      />
    </div>
  );
}
