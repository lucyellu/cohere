import { useCallback, useEffect, useState } from 'react';

// Shared map view preferences — persisted so the choice survives reloads, and
// broadcast so the journey map and the tour map always show the same state —
// plus the header toggle buttons both maps render.
const KEYS = {
  routes: 'cohear-map-show-routes',
  arcs: 'cohear-map-route-arcs',
};
const PREF_EVENT = 'cohear-map-prefs';

export function readMapPref(name, fallback = true) {
  try {
    const v = localStorage.getItem(KEYS[name]);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function writeMapPref(name, value) {
  try { localStorage.setItem(KEYS[name], value ? '1' : '0'); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { name, value } }));
}

// [value, toggle] — like useState, but persisted and synced across every map
// on the page (toggling routes on one map flips it on the other too).
export function useMapPref(name, fallback = true) {
  const [value, setValue] = useState(() => readMapPref(name, fallback));
  useEffect(() => {
    const onChange = (e) => { if (e.detail?.name === name) setValue(e.detail.value); };
    window.addEventListener(PREF_EVENT, onChange);
    return () => window.removeEventListener(PREF_EVENT, onChange);
  }, [name]);
  const toggle = useCallback(() => {
    writeMapPref(name, !readMapPref(name, fallback));
  }, [name, fallback]);
  return [value, toggle];
}

// Two small header buttons: show/hide the route polyline, and switch the line
// between great-circle arcs and straight Mercator lines.
export function RouteControls({ showRoutes, arcs, onToggleRoutes, onToggleArcs }) {
  const base = 'rounded-md border px-2 py-1 text-xs font-semibold transition';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`${base} ${showRoutes ? 'border-black/40 bg-black/80 text-[#f1e7d0]' : 'border-black/20 bg-black/[0.04] text-black/60 hover:text-black/90'}`}
        onClick={onToggleRoutes}
        aria-pressed={showRoutes}
        title={showRoutes ? 'Hide routes' : 'Show routes'}
      >
        🛤️
      </button>
      <button
        type="button"
        className={`${base} border-black/20 bg-black/[0.04] text-black/70 hover:text-black/95 disabled:opacity-40`}
        onClick={onToggleArcs}
        disabled={!showRoutes}
        title="Switch between great-circle arcs and straight lines"
      >
        {arcs ? '✈️ Arcs' : '⟶ Lines'}
      </button>
    </div>
  );
}
