import { useEffect, useMemo, useState } from 'react';
import { fetchTour, sortStops, SORTS, fmtCapacity, fmtDate } from '../tour.js';
import TourGlobe from './TourGlobe.jsx';

export default function TourView({ onEnterShow }) {
  const [artist, setArtist] = useState('Coldplay');
  const [query, setQuery] = useState('Coldplay');
  const [stops, setStops] = useState([]);
  const [mode, setMode] = useState(null);
  const [sortKey, setSortKey] = useState('date');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(name) {
    setLoading(true);
    try {
      const { stops, mode } = await fetchTour(name);
      setStops(stops);
      setMode(mode);
      setSelectedId(stops.length ? stops[0].id : null);
    } catch {
      setStops([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(artist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => sortStops(stops, sortKey), [stops, sortKey]);
  const selected = useMemo(() => stops.find((s) => s.id === selectedId), [stops, selectedId]);
  const totalCap = useMemo(() => stops.reduce((n, s) => n + (s.capacity || 0), 0), [stops]);

  function submit(e) {
    e.preventDefault();
    if (query.trim()) {
      setArtist(query.trim());
      load(query.trim());
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artist…"
            className="w-44 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
          />
          <button className="rounded-lg bg-indigo-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
            {loading ? '…' : 'Map tour'}
          </button>
        </form>

        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-zinc-100 focus:outline-none"
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k} className="bg-zinc-900">{v.label}</option>
            ))}
          </select>
        </label>

        <ModeBadge mode={mode} />
        <span className="ml-auto text-xs text-zinc-500">
          {stops.length} stops · {fmtCapacity(totalCap)} total capacity
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Globe */}
        <div className="lg:col-span-3">
          {stops.length ? (
            <TourGlobe stops={stops} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <div className="flex h-96 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-6 text-center text-sm text-zinc-500">
              {loading ? (
                'Loading tour…'
              ) : (
                <>
                  <span>No upcoming shows found for this artist.</span>
                  {mode === 'live' && (
                    <span className="text-xs text-zinc-600">
                      They may not be touring right now. The JamBase trial is jam-band-heavy — try{' '}
                      <button onClick={() => { setQuery('Dave Matthews Band'); setArtist('Dave Matthews Band'); load('Dave Matthews Band'); }} className="text-indigo-400 hover:underline">
                        Dave Matthews Band
                      </button>{' '}or{' '}
                      <button onClick={() => { setQuery('Phish'); setArtist('Phish'); load('Phish'); }} className="text-indigo-400 hover:underline">
                        Phish
                      </button>.
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-zinc-600">
            Point size & color scale with venue capacity · arcs trace the chronological route · click a venue to focus
          </p>
        </div>

        {/* Sortable stop list */}
        <div className="lg:col-span-2">
          <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {sorted.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    s.id === selectedId
                      ? 'border-emerald-400/40 bg-emerald-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-zinc-100">
                      <span className="text-xs text-zinc-600 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      {s.venue}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-300">{fmtCapacity(s.capacity)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-500">
                    <span>{[s.city, s.country].filter(Boolean).join(', ')}</span>
                    <span>{fmtDate(s.date)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ol>

          {/* Selected setlist */}
          {selected && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">{selected.venue} — setlist</h4>
                  <p className="text-xs text-zinc-500">{fmtDate(selected.date)} · {selected.city}</p>
                </div>
                <button
                  onClick={() => onEnterShow?.(selected)}
                  className="shrink-0 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  ▶ Enter show
                </button>
              </div>
              {selected.setlist.length ? (
                <ol className="mt-2 space-y-1 text-sm text-zinc-300">
                  {selected.setlist.map((song, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-xs text-zinc-600 tabular-nums">{i + 1}.</span> {song}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">No setlist data for this stop.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeBadge({ mode }) {
  if (!mode) return null;
  const live = mode === 'live';
  return (
    <span
      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
        live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
      }`}
    >
      {live ? 'LIVE · JamBase' : 'MOCK data'}
    </span>
  );
}
