import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchConcerts, sortConcerts, filterWhen, spotifyArtist, C_SORTS, defaultDir } from '../concerts.js';
import { fmtCapacity, fmtDate } from '../tour.js';
import { loadGoogleMaps, hasMapsKey } from '../live/maps.js';

// Cohere — Concerts browser. Every show an artist has played or will play, in
// three lenses (List / Map / Calendar), past + upcoming in one place, sortable
// by attendance, date, popularity, name, etc. Past shows come from setlist.fm,
// upcoming from JamBase; the gateway merges them into one normalized list.

const MODES = [
  { id: 'list', label: '☰ List' },
  { id: 'map', label: '🗺️ Map' },
  { id: 'calendar', label: '🗓️ Calendar' },
];
const WHEN = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
];
const WINDOWS = [
  { id: 'tonight', label: '🔥 Tonight' },
  { id: 'week', label: 'This week' },
  { id: 'upcoming', label: 'Upcoming' },
];

export default function ConcertsView({ onEnterShow, onSyncLive }) {
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState(''); // '' = browse / discover everything
  const [windowKey, setWindowKey] = useState('week');
  const [concerts, setConcerts] = useState([]);
  const [sources, setSources] = useState({});
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState('list');
  const [sortKey, setSortKey] = useState('capacity');
  const [dir, setDir] = useState('desc');
  const [when, setWhen] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [spotify, setSpotify] = useState(null);

  const browse = !artist;

  // Discover everything happening in a date window (no artist needed).
  async function loadBrowse(win = windowKey) {
    setLoading(true);
    try {
      const { concerts, sources } = await fetchConcerts('', 'live', win);
      setArtist(''); setQuery(''); setWindowKey(win);
      setConcerts(concerts); setSources(sources);
      setSortKey('capacity'); setDir('desc'); setWhen('all');
      setSelectedId(concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  // One artist's past + upcoming.
  async function loadArtist(name, source = 'live') {
    setLoading(true);
    try {
      const { concerts, sources } = await fetchConcerts(name, source);
      setArtist(name);
      setConcerts(concerts); setSources(sources);
      setSortKey('date'); setDir('desc'); setWhen('all');
      setSelectedId(concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrowse('week'); // discover-first, no query needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spotify artist chip — only meaningful in single-artist mode.
  useEffect(() => {
    if (!artist) { setSpotify(null); return; }
    let alive = true;
    setSpotify(null);
    spotifyArtist(artist).then((a) => alive && setSpotify(a));
    return () => { alive = false; };
  }, [artist]);

  function submit(e) {
    e.preventDefault();
    const q = query.trim();
    if (q) loadArtist(q, 'live');
  }
  function pickSort(key) {
    setSortKey(key);
    setDir(defaultDir(key));
  }

  const visible = useMemo(() => sortConcerts(filterWhen(concerts, when), sortKey, dir), [concerts, when, sortKey, dir]);
  const selected = useMemo(() => concerts.find((c) => c.id === selectedId) || null, [concerts, selectedId]);

  const counts = useMemo(() => {
    const upcoming = concerts.filter((c) => c.when === 'upcoming').length;
    const totalCap = concerts.reduce((n, c) => n + (c.capacity || 0), 0);
    return { upcoming, past: concerts.length - upcoming, totalCap };
  }, [concerts]);
  const biggest = useMemo(() => concerts.reduce((m, c) => ((c.capacity || 0) > (m?.capacity || 0) ? c : m), null), [concerts]);

  return (
    <div>
      {/* Title / context */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            {browse ? <>🧭 Discover concerts</> : <>{artist}</>}
            {!browse && <SpotifyChip a={spotify} />}
          </h2>
          <p className="text-xs text-zinc-500">
            {browse ? (
              biggest ? <>Biggest right now: <span className="text-amber-300">{biggest.artist}</span> @ {biggest.venue}, {biggest.city} · {fmtCapacity(biggest.capacity)} cap</>
                      : 'Everything happening — no search needed'
            ) : (
              <>{counts.upcoming} upcoming · {counts.past} past · {fmtCapacity(counts.totalCap)} seats</>
            )}
          </p>
        </div>
        {!browse && (
          <button onClick={() => loadBrowse(windowKey)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100">
            ← All concerts
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an artist — e.g. Coldplay…"
            className="w-52 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
          />
          <button className="rounded-lg bg-indigo-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
            {loading ? '…' : 'Search'}
          </button>
        </form>

        {/* Discover window (browse only) */}
        {browse && (
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => loadBrowse(w.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${windowKey === w.id ? 'bg-rose-500/80 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* View mode */}
        <nav className="ml-auto inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === m.id ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter + sort row */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {/* Past/Upcoming only matters in artist mode (browse is all upcoming) */}
        {!browse && (
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {WHEN.map((w) => (
              <button
                key={w.id}
                onClick={() => setWhen(w.id)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${when === w.id ? 'bg-rose-500/80 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-zinc-400">
          Sort
          <select
            value={sortKey}
            onChange={(e) => pickSort(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-100 focus:outline-none"
          >
            {Object.entries(C_SORTS).map(([k, v]) => (
              <option key={k} value={k} className="bg-zinc-900">{v.label}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-300 hover:text-zinc-100"
          title="Flip sort direction"
        >
          {dir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
        {sortKey === 'popularity' && (
          <span className="text-[11px] text-zinc-600" title="Venue capacity when known, else setlist richness. True per-show popularity isn't exposed by any free API.">
            ⓘ heuristic (capacity · setlist size)
          </span>
        )}

        <SourceBadges sources={sources} />
      </div>

      {/* Body */}
      {loading ? (
        <Empty>{browse ? 'Finding shows…' : `Loading ${artist}…`}</Empty>
      ) : !concerts.length ? (
        <Empty>
          {browse ? (
            <>No shows in this window right now. Try <Link onClick={() => loadBrowse('upcoming')}>Upcoming</Link>.</>
          ) : (
            <>No JamBase/setlist.fm data for <span className="text-zinc-300">{artist}</span>. Some artists return nothing on the trial — <Link onClick={() => loadBrowse('week')}>browse all concerts</Link> instead.</>
          )}
        </Empty>
      ) : mode === 'list' ? (
        <ConcertList rows={visible} selectedId={selectedId} onSelect={setSelectedId} selected={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      ) : mode === 'map' ? (
        <ConcertMap rows={visible} selectedId={selectedId} onSelect={setSelectedId} selected={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      ) : (
        <ConcertCalendar rows={visible} selectedId={selectedId} onSelect={setSelectedId} selected={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      )}
    </div>
  );
}

/* ---------------- List view ---------------- */
function ConcertList({ rows, selectedId, onSelect, selected, onEnterShow, onSyncLive }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <ol className="lg:col-span-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {rows.map((c, i) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                c.id === selectedId ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium text-zinc-100">
                  <span className="w-6 text-right text-xs text-zinc-600 tabular-nums">{i + 1}</span>
                  <WhenDot when={c.when} />
                  {c.venue}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-amber-300">{fmtCapacity(c.capacity)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between pl-8 text-xs text-zinc-500">
                <span>{[c.city, c.country].filter(Boolean).join(', ')}</span>
                <span>{fmtDate(c.date)} · {c.songCount ? `${c.songCount} songs` : 'no setlist'}</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <div className="lg:col-span-2">
        <Detail c={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      </div>
    </div>
  );
}

/* ---------------- Map view ---------------- */
function ConcertMap({ rows, selectedId, onSelect, selected, onEnterShow, onSyncLive }) {
  const mapRef = useRef(null);
  const objs = useRef({ map: null, markers: new Map() });
  const [err, setErr] = useState(hasMapsKey() ? null : 'nokey');

  const mappable = useMemo(() => rows.filter((c) => c.lat != null && c.lng != null), [rows]);

  // Init map once.
  useEffect(() => {
    if (!hasMapsKey()) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;
        objs.current.maps = maps;
        objs.current.map = new maps.Map(mapRef.current, {
          center: { lat: 30, lng: -30 },
          zoom: 2,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          backgroundColor: '#0a0a0a',
          styles: DARK_MAP,
        });
      })
      .catch((e) => !cancelled && setErr(e.message));
    return () => { cancelled = true; };
  }, []);

  // Sync markers whenever the visible set changes.
  useEffect(() => {
    const { map, maps, markers } = objs.current;
    if (!map || !maps) return;
    // Drop stale markers.
    const ids = new Set(mappable.map((c) => c.id));
    for (const [id, mk] of markers) {
      if (!ids.has(id)) { mk.setMap(null); markers.delete(id); }
    }
    const bounds = new maps.LatLngBounds();
    for (const c of mappable) {
      const pos = { lat: c.lat, lng: c.lng };
      bounds.extend(pos);
      let mk = markers.get(c.id);
      const scale = c.capacity ? Math.max(5, Math.min(20, Math.sqrt(c.capacity) / 38)) : 5;
      const color = c.when === 'upcoming' ? '#fb7185' : '#818cf8';
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale: c.id === selectedId ? scale + 4 : scale,
        fillColor: color,
        fillOpacity: c.id === selectedId ? 0.95 : 0.7,
        strokeColor: '#fff',
        strokeWeight: c.id === selectedId ? 2 : 0.6,
      };
      if (!mk) {
        mk = new maps.Marker({ position: pos, map, title: `${c.venue} — ${c.city}` });
        mk.addListener('click', () => onSelect(c.id));
        markers.set(c.id, mk);
      }
      mk.setIcon(icon);
      mk.setZIndex(c.id === selectedId ? 999 : 1);
    }
    if (mappable.length && !markers.__fitted) {
      map.fitBounds(bounds, 60);
      markers.__fitted = true;
    }
  }, [mappable, selectedId, onSelect]);

  // Pan to a selection made elsewhere (list/calendar).
  useEffect(() => {
    const { map } = objs.current;
    if (map && selected?.lat != null) map.panTo({ lat: selected.lat, lng: selected.lng });
  }, [selectedId, selected]);

  if (err) {
    return (
      <Empty>
        {err === 'nokey'
          ? 'Set VITE_GOOGLE_MAPS_KEY in web/.env to embed the map. The List and Calendar views work without it.'
          : `Map error: ${err}`}
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div ref={mapRef} className="h-[460px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40" />
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Dot c="#fb7185" /> upcoming</span>
            <span className="flex items-center gap-1"><Dot c="#818cf8" /> past</span>
            <span>· dot size ∝ venue capacity</span>
          </span>
          {rows.length - mappable.length > 0 && <span>{rows.length - mappable.length} without coordinates</span>}
        </div>
      </div>
      <div className="lg:col-span-2">
        <Detail c={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      </div>
    </div>
  );
}

/* ---------------- Calendar view ---------------- */
function ConcertCalendar({ rows, selectedId, onSelect, selected, onEnterShow, onSyncLive }) {
  // Index shows by yyyy-mm-dd.
  const byDay = useMemo(() => {
    const m = new Map();
    for (const c of rows) {
      if (!c.date) continue;
      if (!m.has(c.date)) m.set(c.date, []);
      m.get(c.date).push(c);
    }
    return m;
  }, [rows]);

  // Start the calendar on the month of the selected show, else the most recent.
  const initial = selected?.date || rows[0]?.date || new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState(() => monthStart(initial));

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => setCursor((c) => addMonths(c, -1))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100">←</button>
          <h4 className="text-sm font-semibold text-zinc-100">{monthLabel}</h4>
          <button onClick={() => setCursor((c) => addMonths(c, 1))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-zinc-600">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((day, i) => {
            const iso = day ? isoOf(day) : null;
            const shows = iso ? byDay.get(iso) || [] : [];
            const inMonth = day && day.getMonth() === cursor.getMonth();
            const hasSel = shows.some((s) => s.id === selectedId);
            return (
              <button
                key={i}
                disabled={!shows.length}
                onClick={() => shows.length && onSelect(shows[0].id)}
                className={`flex aspect-square flex-col rounded-lg border p-1 text-left transition ${
                  !day ? 'border-transparent' :
                  hasSel ? 'border-emerald-400/50 bg-emerald-400/10' :
                  shows.length ? 'border-white/10 bg-white/[0.04] hover:border-white/25 cursor-pointer' :
                  'border-white/5 bg-transparent'
                } ${inMonth ? '' : 'opacity-30'}`}
              >
                {day && <span className="text-[10px] text-zinc-500 tabular-nums">{day.getDate()}</span>}
                {shows.slice(0, 2).map((s) => (
                  <span key={s.id} className={`mt-0.5 truncate text-[9px] leading-tight ${s.when === 'upcoming' ? 'text-rose-300' : 'text-indigo-300'}`}>
                    ● {s.city || s.venue}
                  </span>
                ))}
                {shows.length > 2 && <span className="text-[9px] text-zinc-500">+{shows.length - 2}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          <span className="text-rose-300">● upcoming</span> · <span className="text-indigo-300">● past</span> · click a day to inspect
        </p>
      </div>
      <div className="lg:col-span-2">
        <Detail c={selected} onEnterShow={onEnterShow} onSyncLive={onSyncLive} />
      </div>
    </div>
  );
}

/* ---------------- Shared detail panel ---------------- */
function Detail({ c, onEnterShow, onSyncLive }) {
  const [syncing, setSyncing] = useState(false);
  if (!c) return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">Select a show to see its setlist.</div>;

  async function sync() {
    if (!onSyncLive) return;
    setSyncing(true);
    await onSyncLive(c);
    setSyncing(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <WhenDot when={c.when} />
            <h4 className="text-sm font-semibold text-zinc-100">{c.artist}</h4>
          </div>
          <p className="mt-0.5 text-sm text-zinc-300">{c.venue}</p>
          <p className="text-xs text-zinc-500">
            {[c.city, c.region, c.country].filter(Boolean).join(', ')} · {fmtDate(c.date)}
          </p>
          {c.tour && <p className="mt-0.5 text-[11px] text-zinc-600">{c.tour}</p>}
        </div>
        <span className="shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">{fmtCapacity(c.capacity)} cap</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {onEnterShow && (
          <button onClick={() => onEnterShow(c)} className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            ▶ Relive (Archive)
          </button>
        )}
        {onSyncLive && c.songCount > 0 && (
          <button onClick={sync} disabled={syncing} className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">
            {syncing ? 'Syncing…' : '🔴 Sync in Live room'}
          </button>
        )}
      </div>

      {c.setlist?.length ? (
        <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1 text-sm text-zinc-300">
          {c.setlist.map((song, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 text-right text-xs text-zinc-600 tabular-nums">{i + 1}.</span> {song}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-zinc-600">
          {c.when === 'upcoming' ? 'Setlist not played yet — predicted from recent shows in the Live room.' : 'No setlist logged for this show.'}
        </p>
      )}
    </div>
  );
}

/* ---------------- Small bits ---------------- */
function WhenDot({ when }) {
  const up = when === 'upcoming';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${up ? 'bg-rose-400' : 'bg-indigo-400'}`} title={up ? 'upcoming' : 'past'} />;
}
function Dot({ c }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />;
}
function Empty({ children }) {
  return <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-black/40 px-6 text-center text-sm text-zinc-500">{children}</div>;
}
function Link({ onClick, children }) {
  return <button onClick={onClick} className="text-indigo-400 hover:underline">{children}</button>;
}
function SpotifyChip({ a }) {
  if (!a) return null;
  return (
    <span
      className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200"
      title={`Spotify${a.mode === 'mock' ? ' (demo — add SPOTIFY_CLIENT_SECRET for real data)' : ''}${a.genres?.length ? ` · ${a.genres.slice(0, 2).join(', ')}` : ''}`}
    >
      {a.image && <img src={a.image} alt="" className="h-4 w-4 rounded-full object-cover" />}
      <span className="font-semibold">{a.popularity}</span> popularity
      {a.followers != null && <span className="text-emerald-300/70">· {Intl.NumberFormat(undefined, { notation: 'compact' }).format(a.followers)} followers</span>}
    </span>
  );
}

function SourceBadges({ sources }) {
  const map = { live: ['LIVE', 'text-emerald-300 bg-emerald-500/10'], mock: ['demo', 'text-amber-300 bg-amber-500/10'], nokey: ['no key', 'text-zinc-500 bg-white/5'], error: ['err', 'text-rose-300 bg-rose-500/10'] };
  return (
    <span className="ml-auto flex items-center gap-1.5">
      {['jambase', 'setlistfm'].map((s) => {
        const [txt, cls] = map[sources[s]] || ['—', 'text-zinc-600 bg-white/5'];
        return <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{s === 'jambase' ? 'upcoming' : 'past'}: {txt}</span>;
      })}
    </span>
  );
}

/* ---------------- Date helpers ---------------- */
function monthStart(iso) {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 6-week grid (42 cells) starting on the Sunday on/before the 1st.
function buildMonthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Minimal dark Google Maps style so the map matches the app's palette.
const DARK_MAP = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d22' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1117' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a30' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3a42' }] },
];
