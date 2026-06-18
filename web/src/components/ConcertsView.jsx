import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchConcerts, getCachedConcerts, sortConcerts, filterWhen, spotifyArtist, C_SORTS, defaultDir } from '../concerts.js';
import { fmtCapacity, fmtDate } from '../tour.js';
import { loadGoogleMaps, hasMapsKey } from '../live/maps.js';

const VIEW_MODES = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
  { id: 'calendar', label: 'Calendar' },
];

const WINDOWS = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past 60 days' },
];

const WHEN = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
];

const SORT_KEYS = ['capacity', 'popularity', 'date', 'artist', 'venue', 'city'];
const USER_ZONE_KEY = 'cohear_user_timezone';
const DISCOVER_STATE_KEY = 'cohear_discover_state_v1';
const DETECTED_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver';
const USER_TIME_ZONES = withDetectedZone([
  { zone: 'America/Vancouver', city: 'Vancouver', label: 'Vancouver / Pacific' },
  { zone: 'America/Los_Angeles', city: 'Los Angeles', label: 'Los Angeles / Pacific' },
  { zone: 'America/Denver', city: 'Denver', label: 'Denver / Mountain' },
  { zone: 'America/Chicago', city: 'Chicago', label: 'Chicago / Central' },
  { zone: 'America/New_York', city: 'New York', label: 'New York / Eastern' },
  { zone: 'America/Toronto', city: 'Toronto', label: 'Toronto / Eastern' },
  { zone: 'Europe/London', city: 'London', label: 'London' },
  { zone: 'Europe/Paris', city: 'Paris', label: 'Paris' },
  { zone: 'Asia/Tokyo', city: 'Tokyo', label: 'Tokyo' },
  { zone: 'Australia/Sydney', city: 'Sydney', label: 'Sydney' },
]);

function readDiscoverState() {
  const fallback = {
    query: '',
    artist: '',
    location: '',
    windowKey: 'week',
    concerts: getCachedConcerts('', 'live', 'week')?.concerts || [],
    sources: getCachedConcerts('', 'live', 'week')?.sources || {},
    mode: 'list',
    sortKey: 'capacity',
    dir: 'desc',
    when: 'all',
    hideEnded: false,
    selectedId: null,
  };
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DISCOVER_STATE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.concerts)) return fallback;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeDiscoverState(state) {
  try {
    sessionStorage.setItem(DISCOVER_STATE_KEY, JSON.stringify(state));
  } catch {
    /* session storage can be unavailable */
  }
}

export default function ConcertsView({ onEnterShow, onSyncLive }) {
  const initialState = useMemo(() => readDiscoverState(), []);
  const [query, setQuery] = useState(initialState.query);
  const [artist, setArtist] = useState(initialState.artist);
  const [location, setLocation] = useState(initialState.location);
  const [windowKey, setWindowKey] = useState(initialState.windowKey);
  const [concerts, setConcerts] = useState(initialState.concerts);
  const [sources, setSources] = useState(initialState.sources);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(initialState.mode);
  const [sortKey, setSortKey] = useState(initialState.sortKey);
  const [dir, setDir] = useState(initialState.dir);
  const [when, setWhen] = useState(initialState.when);
  const [hideEnded, setHideEnded] = useState(Boolean(initialState.hideEnded));
  const [selectedId, setSelectedId] = useState(initialState.selectedId);
  const [spotify, setSpotify] = useState(null);
  const [saved, setSaved] = useState(() => new Set(JSON.parse(localStorage.getItem('cohear_saved_shows') || '[]')));
  const [userZone, setUserZoneState] = useState(() => localStorage.getItem(USER_ZONE_KEY) || DETECTED_TIME_ZONE);
  const [now, setNow] = useState(() => Date.now());

  const browse = !artist;

  async function loadBrowse(win = windowKey, { force = false, reset = true } = {}) {
    const cached = !force ? getCachedConcerts('', 'live', win) : null;
    if (cached?.concerts?.length) {
      setArtist('');
      setWindowKey(win);
      setConcerts(cached.concerts);
      setSources(cached.sources || {});
      if (reset) {
        setSortKey('capacity');
        setDir('desc');
        setWhen('all');
      }
      setSelectedId(cached.concerts[0]?.id || null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const out = await fetchConcerts('', 'live', win, { force });
      setArtist('');
      setWindowKey(win);
      setConcerts(out.concerts);
      setSources(out.sources);
      if (reset) {
        setSortKey('capacity');
        setDir('desc');
        setWhen('all');
      }
      setSelectedId(out.concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadArtist(name, { force = false, reset = true } = {}) {
    const clean = name.trim();
    if (!clean) return;
    const cached = !force ? getCachedConcerts(clean, 'live') : null;
    if (cached?.concerts?.length) {
      setArtist(clean);
      setConcerts(cached.concerts);
      setSources(cached.sources || {});
      if (reset) {
        setSortKey('date');
        setDir('desc');
        setWhen('all');
      }
      setSelectedId(cached.concerts[0]?.id || null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const out = await fetchConcerts(clean, 'live', undefined, { force });
      setArtist(clean);
      setConcerts(out.concerts);
      setSources(out.sources);
      if (reset) {
        setSortKey('date');
        setDir('desc');
        setWhen('all');
      }
      setSelectedId(out.concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!concerts.length) loadBrowse(windowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeDiscoverState({ query, artist, location, windowKey, concerts, sources, mode, sortKey, dir, when, hideEnded, selectedId });
  }, [artist, concerts, dir, hideEnded, location, mode, query, selectedId, sortKey, sources, when, windowKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!artist) {
      setSpotify(null);
      return;
    }
    let alive = true;
    setSpotify(null);
    spotifyArtist(artist).then((a) => alive && setSpotify(a));
    return () => {
      alive = false;
    };
  }, [artist]);

  function pickSort(key) {
    if (sortKey === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDir(defaultDir(key));
  }

  function refreshConcerts() {
    if (artist) loadArtist(artist, { force: true, reset: false });
    else loadBrowse(windowKey, { force: true, reset: false });
  }

  function toggleSave(id) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('cohear_saved_shows', JSON.stringify([...next]));
      return next;
    });
  }

  function setUserZone(zone) {
    setUserZoneState(zone);
    localStorage.setItem(USER_ZONE_KEY, zone);
  }

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    const base = browse ? concerts : filterWhen(concerts, when);
    const filtered = base.filter((c) => {
      if (hideEnded && showState(c, now).ended) return false;
      const haystack = [c.artist, c.venue, c.city, c.region, c.country].filter(Boolean).join(' ').toLowerCase();
      const locationText = [c.city, c.region, c.country, c.venue].filter(Boolean).join(' ').toLowerCase();
      return (!search || haystack.includes(search)) && (!loc || locationText.includes(loc));
    });
    return sortConcerts(filtered, sortKey, dir);
  }, [artist, browse, concerts, dir, hideEnded, location, now, query, sortKey, when]);

  useEffect(() => {
    if (!visible.length) return;
    if (!visible.some((c) => c.id === selectedId)) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  const selected = useMemo(() => visible.find((c) => c.id === selectedId) || visible[0] || null, [selectedId, visible]);
  const biggest = visible[0] || null;
  const stats = useMemo(() => {
    const totalCap = visible.reduce((n, c) => n + (c.capacity || 0), 0);
    const upcoming = concerts.filter((c) => c.when === 'upcoming').length;
    return { count: visible.length, totalCap, upcoming, past: concerts.length - upcoming };
  }, [concerts, visible]);

  return (
    <div className="space-y-5">
      <DiscoverHeader
        artist={artist}
        browse={browse}
        biggest={biggest}
        loading={loading}
        stats={stats}
        spotify={spotify}
        userZone={userZone}
        now={now}
        onBrowse={() => loadBrowse(windowKey)}
      />

      <ControlSurface
        browse={browse}
        query={query}
        setQuery={setQuery}
        location={location}
        setLocation={setLocation}
        userZone={userZone}
        setUserZone={setUserZone}
        windowKey={windowKey}
        setWindowKey={loadBrowse}
        mode={mode}
        setMode={setMode}
        sortKey={sortKey}
        pickSort={pickSort}
        dir={dir}
        setDir={setDir}
        when={when}
        setWhen={setWhen}
        hideEnded={hideEnded}
        setHideEnded={setHideEnded}
        loading={loading}
        onArtistSearch={() => loadArtist(query)}
        onRefresh={refreshConcerts}
      />

      {loading ? (
        <EmptyState title="Finding concerts" body="Loading the current concert window from the gateway." />
      ) : !visible.length ? (
        <EmptyState
          title="No matching concerts"
          body={browse ? 'Try a wider time window, clear the location filter, or load an artist timeline.' : 'This artist has no matching shows in the current filter.'}
          action={browse ? <button className="cohear-link" onClick={() => loadBrowse('upcoming')}>Show upcoming</button> : <button className="cohear-link" onClick={() => loadBrowse(windowKey)}>Back to Discover</button>}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0">
            {mode === 'list' && (
              <ConcertTable
                rows={visible}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                saved={saved}
                userZone={userZone}
                now={now}
                sortKey={sortKey}
                dir={dir}
                onSort={pickSort}
                onSyncLive={onSyncLive}
              />
            )}
            {mode === 'map' && <ConcertMap rows={visible} selectedId={selected?.id} onSelect={setSelectedId} />}
            {mode === 'calendar' && <ConcertCalendar rows={visible} selectedId={selected?.id} onSelect={setSelectedId} />}
          </main>

          <ConcertInspector
            concert={selected}
            saved={selected ? saved.has(selected.id) : false}
            sources={sources}
            userZone={userZone}
            now={now}
            onSave={() => selected && toggleSave(selected.id)}
            onEnterShow={onEnterShow}
            onSyncLive={onSyncLive}
          />
        </div>
      )}
    </div>
  );
}

function DiscoverHeader({ artist, browse, biggest, loading, stats, spotify, userZone, now, onBrowse }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="cohear-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="cohear-label">{browse ? 'Discover' : 'Artist timeline'}</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {browse ? 'Biggest concerts happening now and soon.' : artist}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              {browse
                ? 'Ranked by venue capacity first, with quick filters for city, venue, artist, date, and live-room readiness.'
                : `${stats.upcoming} upcoming and ${stats.past} past shows from the available concert sources.`}
            </p>
          </div>
          {!browse && (
            <button className="cohear-secondary" onClick={onBrowse}>
              All concerts
            </button>
          )}
        </div>

        {biggest && (
          <button
            type="button"
            className="mt-5 grid w-full gap-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-4 text-left transition hover:border-amber-200/50 md:grid-cols-[1fr_auto]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                Biggest in view
              </div>
              <div className="mt-2 truncate text-xl font-semibold text-white">{biggest.artist || biggest.venue}</div>
              <div className="mt-1 truncate text-sm text-zinc-300">
                {biggest.venue} · {[biggest.city, biggest.country].filter(Boolean).join(', ')}
              </div>
            </div>
            <div className="flex items-end gap-6 md:text-right">
              <Metric label="Capacity" value={fmtCapacity(biggest.capacity)} tone="amber" />
              <Metric label="Starts" value={countdownLabel(biggest, now).text} />
              <Metric label="Your time" value={formatUserShowTime(biggest, userZone)} />
            </div>
          </button>
        )}
      </div>

      <div className="cohear-panel grid content-between gap-4 p-5">
        <div>
          <p className="cohear-label">Coverage</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MetricBlock label="Visible shows" value={loading ? '...' : stats.count.toLocaleString()} />
            <MetricBlock
              label="Known capacity"
              value={fmtCapacity(stats.totalCap)}
              title="Sum of venue capacity for the currently visible shows. It is not confirmed attendance or tickets sold."
            />
          </div>
        </div>
        {spotify && (
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
            <div className="flex items-center gap-3">
              {spotify.image && <img className="h-9 w-9 rounded object-cover" src={spotify.image} alt="" />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-100">{spotify.popularity} Spotify popularity</div>
                <div className="truncate text-xs text-emerald-200/65">
                  {spotify.followers != null ? `${Intl.NumberFormat(undefined, { notation: 'compact' }).format(spotify.followers)} followers` : 'Artist signal'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ControlSurface(props) {
  const {
    browse, query, setQuery, location, setLocation, userZone, setUserZone, windowKey, setWindowKey,
    mode, setMode, sortKey, pickSort, dir, setDir, when, setWhen, hideEnded, setHideEnded, loading, onArtistSearch, onRefresh,
  } = props;

  return (
    <section className="cohear-panel p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.1fr)_minmax(160px,.55fr)_minmax(180px,.55fr)_auto]">
        <label className="cohear-field">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && onArtistSearch()}
            placeholder="Artist, city, venue"
          />
        </label>
        <label className="cohear-field">
          <MapPinIcon />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location filter" />
        </label>
        <label className="cohear-field">
          <ClockIcon />
          <select value={userZone} onChange={(e) => setUserZone(e.target.value)} aria-label="Your city">
            {USER_TIME_ZONES.map((tz) => (
              <option key={tz.zone} value={tz.zone}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
        <button className="cohear-primary whitespace-nowrap" onClick={onArtistSearch} disabled={!query.trim() || loading}>
          Artist timeline
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {browse ? (
          <SegmentedControl value={windowKey} options={WINDOWS} onChange={setWindowKey} />
        ) : (
          <SegmentedControl value={when} options={WHEN} onChange={setWhen} />
        )}
        <SegmentedControl value={mode} options={VIEW_MODES} onChange={setMode} />

        <button
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${hideEnded ? 'border-cyan-300/40 bg-cyan-300/[0.12] text-cyan-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100'}`}
          onClick={() => setHideEnded((v) => !v)}
          title="Hide shows whose estimated end time has passed"
        >
          {hideEnded ? 'Ended hidden' : 'Show ended'}
        </button>

        <label className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-zinc-400">
          Sort
          <select value={sortKey} onChange={(e) => pickSort(e.target.value)} className="bg-transparent text-zinc-100 outline-none">
            {SORT_KEYS.map((key) => (
              <option key={key} value={key} className="bg-zinc-950">
                {C_SORTS[key].label}
              </option>
            ))}
          </select>
        </label>
        <button className="cohear-icon-button w-auto px-3 text-xs" onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {dir === 'asc' ? 'Ascending' : 'Descending'}
        </button>
        <button className="cohear-secondary min-h-9 px-3 text-xs" onClick={onRefresh} disabled={loading} title="Bypass the 8-hour concert cache and reload this view">
          {loading ? 'Refreshing...' : 'Refresh concerts'}
        </button>
      </div>
    </section>
  );
}

function ConcertTable({ rows, selectedId, onSelect, saved, userZone, now, sortKey, dir, onSort, onSyncLive }) {
  const [syncingId, setSyncingId] = useState(null);
  async function join(c) {
    if (!onSyncLive || syncingId) return;
    setSyncingId(c.id);
    try {
      await onSyncLive(c);
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="cohear-panel overflow-hidden">
      <div className="grid grid-cols-[56px_minmax(170px,1.05fr)_minmax(170px,1fr)_120px_190px_90px_92px] border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 max-lg:hidden">
        <span>Rank</span>
        <SortHeader id="artist" label="Artist" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader id="venue" label="Venue" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader id="city" label="City" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader id="date" label="Time" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader id="capacity" label="Seats" align="right" sortKey={sortKey} dir={dir} onSort={onSort} />
        <span className="text-right">Live</span>
      </div>
      <ol className="max-h-[660px] overflow-y-auto">
        {rows.map((c, i) => {
          const state = showState(c, now);
          return (
            <li
              key={c.id}
              className={`grid gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0 lg:grid-cols-[56px_minmax(170px,1.05fr)_minmax(170px,1fr)_120px_190px_90px_92px] lg:items-center ${
                c.id === selectedId
                  ? 'bg-cyan-300/[0.08]'
                  : state.current
                    ? 'bg-emerald-300/[0.055] hover:bg-emerald-300/[0.09]'
                    : state.recentlyEnded
                      ? 'bg-rose-400/[0.04] hover:bg-rose-400/[0.07]'
                      : 'hover:bg-white/[0.035]'
              }`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className="contents text-left"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
                  <span className="w-7 tabular-nums text-zinc-500">{String(i + 1).padStart(2, '0')}</span>
                  {state.current && <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.8)]" title="Happening now" />}
                  {saved.has(c.id) && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" title="Saved" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{c.artist || 'Unknown artist'}</span>
                  <span className="mt-1 block text-xs text-zinc-500 lg:hidden">
                    {c.venue} · {[c.city, c.country].filter(Boolean).join(', ')}
                  </span>
                </span>
                <span className="hidden min-w-0 truncate text-sm text-zinc-300 lg:block">{c.venue}</span>
                <span className="hidden truncate text-sm text-zinc-400 lg:block">{[c.city, c.country].filter(Boolean).join(', ')}</span>
                <TimeStack concert={c} userZone={userZone} now={now} />
                <span className="text-left text-sm font-semibold tabular-nums text-amber-200 lg:text-right">{fmtCapacity(c.capacity)}</span>
              </button>
              <button
                className="cohear-primary min-h-9 justify-center px-3 text-xs lg:justify-self-end"
                onClick={() => join(c)}
                disabled={syncingId === c.id}
              >
                {syncingId === c.id ? 'Opening' : 'Join'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SortHeader({ id, label, sortKey, dir, onSort, align = 'left' }) {
  const active = sortKey === id;
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      className={`min-w-0 text-xs font-semibold uppercase tracking-[0.12em] transition hover:text-zinc-200 ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-white' : 'text-zinc-500'}`}
      title={`Sort by ${label}`}
    >
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        {active && <span className="text-[10px] text-cyan-200">{dir === 'asc' ? 'up' : 'down'}</span>}
      </span>
    </button>
  );
}

function ConcertInspector({ concert, saved, sources, userZone, now, onSave, onEnterShow, onSyncLive }) {
  const [syncing, setSyncing] = useState(false);
  if (!concert) {
    return <aside className="cohear-panel p-5 text-sm text-zinc-500">Select a concert to inspect it.</aside>;
  }

  async function sync() {
    if (!onSyncLive) return;
    setSyncing(true);
    await onSyncLive(concert);
    setSyncing(false);
  }

  return (
    <aside className="cohear-panel sticky top-5 self-start overflow-hidden">
      <div className="h-40 border-b border-white/10 bg-[radial-gradient(circle_at_65%_35%,rgba(34,211,238,.22),transparent_28%),linear-gradient(135deg,#15171c,#090a0d)] p-4">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <StatusPill when={concert.when} />
            <div className="flex items-center gap-2">
              {onSyncLive && (
                <button className="cohear-primary min-h-9 px-3 text-xs" onClick={sync} disabled={syncing}>
                  {syncing ? 'Opening' : 'Join live'}
                </button>
              )}
              <button className="cohear-icon-button" onClick={onSave} title={saved ? 'Remove saved concert' : 'Save concert'}>
                <BookmarkIcon filled={saved} />
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Selected concert</div>
            <h3 className="mt-2 line-clamp-2 text-2xl font-semibold text-white">{concert.artist || concert.venue}</h3>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="text-sm font-medium text-zinc-200">{concert.venue}</p>
          <p className="mt-1 text-sm text-zinc-500">{[concert.city, concert.region, concert.country].filter(Boolean).join(', ')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricBlock label="Capacity" value={fmtCapacity(concert.capacity)} tone="amber" />
          <MetricBlock label="Countdown" value={countdownLabel(concert, now).text} tone={countdownLabel(concert, now).tone} />
          <MetricBlock label="Concert city" value={formatVenueShowTime(concert)} />
          <MetricBlock label="Your city" value={formatUserShowTime(concert, userZone)} />
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Setlist</div>
              <div className="mt-1 text-sm font-semibold text-white">{concert.songCount ? `${concert.songCount} songs` : 'Pending'}</div>
            </div>
            <div className="text-right text-xs leading-5 text-zinc-500">
              <div>{venueZoneLabel(concert)}</div>
              <div>{userZoneLabel(userZone)}</div>
            </div>
          </div>
        </div>

        <MiniMap concert={concert} />

        <div className="grid gap-2">
          {onEnterShow && (
            <button className="cohear-secondary w-full justify-center" onClick={() => onEnterShow(concert)}>
              Open archive replay
            </button>
          )}
        </div>

        <SourceBadges sources={sources} />

        {concert.setlist?.length ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Known setlist</h4>
              <span className="text-xs text-zinc-600">{concert.setlist.length} tracks</span>
            </div>
            <ol className="max-h-52 space-y-1 overflow-y-auto pr-1 text-sm text-zinc-300">
              {concert.setlist.slice(0, 18).map((song, i) => (
                <li key={`${song}-${i}`} className="flex gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-zinc-600">{i + 1}</span>
                  <span className="min-w-0 truncate">{song}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-zinc-500">
            {concert.when === 'upcoming'
              ? 'Setlist has not been played yet. The live room can use the artist timeline when available.'
              : 'No setlist is logged for this show yet.'}
          </p>
        )}
      </div>
    </aside>
  );
}

function ConcertMap({ rows, selectedId, onSelect }) {
  const mapRef = useRef(null);
  const stateRef = useRef({ map: null, maps: null, markers: new Map(), trail: null, fittedKey: '' });
  const [err, setErr] = useState(hasMapsKey() ? null : 'missing-key');
  const [mapReady, setMapReady] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [trailArtist, setTrailArtist] = useState('');
  const mappable = rows.filter((c) => c.lat != null && c.lng != null);
  const artists = useMemo(() => [...new Set(mappable.map((c) => c.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [mappable]);
  const trailRows = useMemo(() => {
    if (!trailArtist) return [];
    return mappable.filter((c) => c.artist === trailArtist).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [mappable, trailArtist]);

  useEffect(() => {
    if (!hasMapsKey()) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;
        stateRef.current.maps = maps;
        const map = new maps.Map(mapRef.current, {
          center: { lat: 25, lng: 0 },
          zoom: 2,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          backgroundColor: '#09090b',
          styles: GOOGLE_DARK_MAP,
        });
        stateRef.current.map = map;
        setMapReady(true);
        setErr(null);
        window.setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          const rendered = mapRef.current.querySelector('.gm-style, img, canvas');
          if (!rendered) {
            setMapReady(false);
            setErr('maps render timed out');
          }
        }, 4000);
      })
      .catch((e) => {
        setMapReady(false);
        setErr(e.message || 'map failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { map, maps, markers } = stateRef.current;
    if (!map || !maps) return;
    const ids = new Set(mappable.map((c) => c.id));
    for (const [id, marker] of markers) {
      if (!ids.has(id)) {
        marker.setMap(null);
        markers.delete(id);
      }
    }
    const bounds = new maps.LatLngBounds();
    for (const c of mappable) {
      const position = { lat: Number(c.lat), lng: Number(c.lng) };
      bounds.extend(position);
      const scale = Math.max(6, Math.min(24, Math.sqrt(c.capacity || 4000) / 28));
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale: c.id === selectedId ? scale + 4 : scale,
        fillColor: c.id === selectedId ? '#67e8f9' : '#fbbf24',
        fillOpacity: c.id === selectedId ? 0.95 : 0.74,
        strokeColor: '#ffffff',
        strokeWeight: c.id === selectedId ? 2 : 0.8,
      };
      let marker = markers.get(c.id);
      if (!marker) {
        marker = new maps.Marker({ position, map, title: `${c.artist} - ${c.venue}` });
        marker.addListener('click', () => onSelect(c.id));
        markers.set(c.id, marker);
      }
      marker.setPosition(position);
      marker.setIcon(icon);
      marker.setLabel(showLabels ? { text: shortLabel(c.artist || c.venue), color: '#f4f4f5', fontSize: '11px', fontWeight: '700' } : null);
      marker.setZIndex(c.id === selectedId ? 1000 : 1);
    }
    if (stateRef.current.trail) {
      stateRef.current.trail.setMap(null);
      stateRef.current.trail = null;
    }
    if (trailRows.length > 1) {
      stateRef.current.trail = new maps.Polyline({
        path: trailRows.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) })),
        geodesic: true,
        strokeColor: '#67e8f9',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map,
      });
    }
    const fittedKey = mappable.map((c) => c.id).join('|');
    if (mappable.length && stateRef.current.fittedKey !== fittedKey) {
      map.fitBounds(bounds, 72);
      stateRef.current.fittedKey = fittedKey;
    }
  }, [mappable, onSelect, selectedId, showLabels, trailRows]);

  useEffect(() => {
    const { map } = stateRef.current;
    const selected = rows.find((c) => c.id === selectedId);
    if (map && selected?.lat != null && selected?.lng != null) {
      map.panTo({ lat: Number(selected.lat), lng: Number(selected.lng) });
    }
  }, [rows, selectedId]);

  if (err) {
    return (
      <MapShell
        count={mappable.length}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        trailArtist={trailArtist}
        setTrailArtist={setTrailArtist}
        artists={artists}
        fallbackReason={err}
      >
        <FallbackMap rows={mappable} selectedId={selectedId} onSelect={onSelect} showLabels={showLabels} trailRows={trailRows} />
      </MapShell>
    );
  }

  return (
    <MapShell
      count={mappable.length}
      showLabels={showLabels}
      setShowLabels={setShowLabels}
      trailArtist={trailArtist}
      setTrailArtist={setTrailArtist}
      artists={artists}
    >
      <div className="relative">
        <div ref={mapRef} aria-label="Concert location map" className="h-[620px] w-full bg-zinc-950" />
        {!mapReady && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-zinc-950/80 text-sm text-zinc-400">
            Loading Google Maps...
          </div>
        )}
      </div>
    </MapShell>
  );
}

function MapShell({ children, count, showLabels, setShowLabels, trailArtist, setTrailArtist, artists, fallbackReason }) {
  const reasonText = fallbackReason
    ? fallbackReason === 'missing-key'
      ? 'Google Maps key is missing, so Cohear is showing its built-in coordinate map.'
      : `Google Maps did not finish loading (${fallbackReason}), so Cohear is showing its built-in coordinate map.`
    : 'Google Maps markers sized by known attendance capacity.';
  return (
    <div className="cohear-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Concert map</h3>
          <p className="mt-1 text-xs text-zinc-500">{reasonText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${showLabels ? 'border-cyan-300/40 bg-cyan-300/[0.12] text-cyan-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100'}`}
            onClick={() => setShowLabels((v) => !v)}
          >
            {showLabels ? 'Hide labels' : 'Show labels'}
          </button>
          <select value={trailArtist} onChange={(e) => setTrailArtist(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-300 outline-none">
            <option value="">Tour trail: off</option>
            {artists.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-xs text-zinc-500">{count} mapped</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function FallbackMap({ rows, selectedId, onSelect, showLabels, trailRows }) {
  const plotted = rows.slice(0, 80).map((c) => ({
    ...c,
    point: projectMapPoint(Number(c.lat), Number(c.lng)),
    size: Math.max(12, Math.min(34, Math.sqrt(c.capacity || 4000) / 12)),
  }));
  const trailPoints = trailRows.map((c) => projectMapPoint(Number(c.lat), Number(c.lng)));

  return (
    <div
      aria-label="Concert location map"
      className="relative h-[620px] overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,.18),transparent_30%),linear-gradient(145deg,#09090b,#101216)]"
    >
      <div className="absolute inset-x-8 top-1/2 border-t border-white/10" />
      <div className="absolute inset-y-8 left-1/2 border-l border-white/10" />
      {trailPoints.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={trailPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
            fill="none"
            stroke="#67e8f9"
            strokeOpacity="0.85"
            strokeWidth="0.7"
          />
        </svg>
      )}
      {plotted.map((c) => (
        <div key={c.id} className="absolute" style={{ left: `${c.point.x}%`, top: `${c.point.y}%` }}>
          <button
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${
              c.id === selectedId ? 'z-20 border-white bg-cyan-300 shadow-[0_0_24px_rgba(103,232,249,.5)]' : 'z-10 border-white/70 bg-amber-300/80 hover:bg-amber-200'
            }`}
            style={{
              left: `${c.point.x}%`,
              top: `${c.point.y}%`,
              width: c.size,
              height: c.size,
            }}
            onClick={() => onSelect(c.id)}
            title={`${c.artist} - ${c.venue}`}
          />
          {showLabels && (
            <button
              onClick={() => onSelect(c.id)}
              className="absolute left-2 top-1 z-20 max-w-28 truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              title={`${c.artist} - ${c.venue}`}
            >
              {shortLabel(c.artist || c.venue)}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ConcertCalendar({ rows, selectedId, onSelect }) {
  const firstIso = rows.map((c) => c.date).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
  const [monthAnchor, setMonthAnchor] = useState(() => firstIso.slice(0, 7));

  useEffect(() => {
    if (firstIso) setMonthAnchor(firstIso.slice(0, 7));
  }, [firstIso]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of rows) {
      const key = c.date || 'Unknown date';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    for (const shows of map.values()) shows.sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
    return map;
  }, [rows]);

  const days = useMemo(() => monthGrid(monthAnchor), [monthAnchor]);
  const monthShows = rows.filter((c) => c.date?.startsWith(monthAnchor)).length;

  return (
    <div className="cohear-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{monthLabel(monthAnchor)}</h3>
          <p className="mt-1 text-xs text-zinc-500">Month view with the biggest shows inside each date.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{monthShows} shows</span>
          <button className="cohear-icon-button h-8 w-8" onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))} title="Previous month">‹</button>
          <button className="cohear-icon-button h-8 w-8" onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))} title="Next month">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-white/10 bg-black/20 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.iso.startsWith(monthAnchor);
          const shows = grouped.get(day.iso) || [];
          return (
            <section key={day.iso} className={`min-h-32 border-b border-r border-white/[0.06] p-2 ${inMonth ? 'bg-white/[0.015]' : 'bg-black/25 opacity-45'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold tabular-nums ${day.iso === new Date().toISOString().slice(0, 10) ? 'rounded bg-cyan-300 px-1.5 py-0.5 text-zinc-950' : 'text-zinc-500'}`}>
                  {Number(day.iso.slice(8, 10))}
                </span>
                {shows.length > 3 && <span className="text-[10px] text-zinc-600">+{shows.length - 3}</span>}
              </div>
              <div className="mt-2 grid gap-1">
                {shows.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`rounded border px-2 py-1 text-left transition ${
                      c.id === selectedId ? 'border-cyan-300/50 bg-cyan-300/[0.1]' : 'border-white/10 bg-black/20 hover:border-white/25'
                    }`}
                    title={`${c.artist} at ${c.venue}`}
                  >
                    <span className="block truncate text-[11px] font-semibold text-white">{c.artist}</span>
                    <span className="block truncate text-[10px] text-zinc-500">{fmtCapacity(c.capacity)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="max-h-48 overflow-y-auto border-t border-white/10 p-3">
        {rows.filter((c) => c.date?.startsWith(monthAnchor)).slice(0, 12).map((c) => (
          <button
            key={`${c.id}-month-list`}
            onClick={() => onSelect(c.id)}
            className={`mb-2 grid w-full gap-2 rounded-lg border p-3 text-left transition md:grid-cols-[110px_1fr_auto] ${
              c.id === selectedId ? 'border-cyan-300/40 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'
            }`}
          >
            <span className="text-xs font-semibold text-zinc-500">{fmtDate(c.date)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{c.artist}</span>
              <span className="mt-1 block truncate text-xs text-zinc-500">{c.venue} · {c.city}</span>
            </span>
            <span className="text-sm font-semibold text-amber-200">{fmtCapacity(c.capacity)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniMap({ concert }) {
  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,#0c1117,#111827)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_42%,rgba(34,211,238,.28),transparent_18%),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]" />
      <div className="absolute left-4 top-4 rounded bg-black/45 px-2 py-1 text-xs font-medium text-zinc-300">
        {[concert.city, concert.country].filter(Boolean).join(', ') || 'Venue location'}
      </div>
      <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.55)]" />
    </div>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === option.id ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ when }) {
  const upcoming = when === 'upcoming';
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold ${upcoming ? 'border-rose-300/30 bg-rose-400/10 text-rose-100' : 'border-indigo-300/25 bg-indigo-400/10 text-indigo-100'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${upcoming ? 'bg-rose-300' : 'bg-indigo-300'}`} />
      {upcoming ? 'Soon' : 'Past'}
    </span>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${tone === 'amber' ? 'text-amber-200' : 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

function MetricBlock({ label, value, tone, title }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3" title={title}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className={`mt-2 truncate text-base font-semibold tabular-nums ${metricTone(tone)}`}>{value}</div>
    </div>
  );
}

function TimeStack({ concert, userZone, now }) {
  const cd = countdownLabel(concert, now);
  return (
    <span className="min-w-0 text-xs leading-5">
      <span className="block truncate font-semibold text-zinc-200">{formatVenueShowTime(concert)}</span>
      <span className="block truncate text-zinc-500">{formatUserShowTime(concert, userZone)}</span>
      <span className={`block truncate font-semibold ${countdownClass(cd.tone)}`}>
        {cd.text}
      </span>
    </span>
  );
}

function metricTone(tone) {
  if (tone?.startsWith?.('green') || tone?.startsWith?.('red')) return countdownClass(tone);
  if (tone === 'amber') return 'text-amber-200';
  if (tone === 'rose') return 'text-rose-200';
  if (tone === 'cyan') return 'text-cyan-200';
  return 'text-white';
}

function withDetectedZone(zones) {
  if (zones.some((z) => z.zone === DETECTED_TIME_ZONE)) return zones;
  return [{ zone: DETECTED_TIME_ZONE, city: 'Local', label: `Local (${DETECTED_TIME_ZONE})` }, ...zones];
}

function userZoneLabel(zone) {
  const found = USER_TIME_ZONES.find((z) => z.zone === zone);
  return `Your city: ${found?.city || zone}`;
}

function venueZoneLabel(concert) {
  return `Concert city: ${zoneAbbr(venueTimeZone(concert), showStartMs(concert))}`;
}

function formatVenueShowTime(concert) {
  const zone = venueTimeZone(concert);
  return formatShowTime(concert, zone, concert.city || 'Venue');
}

function formatUserShowTime(concert, userZone) {
  const label = USER_TIME_ZONES.find((z) => z.zone === userZone)?.city || 'You';
  return formatShowTime(concert, userZone, label);
}

function formatShowTime(concert, zone, label) {
  const ms = showStartMs(concert);
  if (!ms) return 'Time TBA';
  const date = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
  return `${date} ${zoneAbbr(zone, ms)} (${label})`;
}

function countdownLabel(concert, now) {
  const ms = showStartMs(concert);
  if (!ms) return { text: 'Time TBA', tone: 'zinc' };
  const diff = ms - now;
  if (diff > 0) {
    if (diff < 2 * 3600_000) return { text: `Starts in ${durationShort(diff)}`, tone: 'green-hot' };
    if (diff < 24 * 3600_000) return { text: `Starts in ${durationShort(diff)}`, tone: 'green' };
    return { text: `Starts in ${durationShort(diff)}`, tone: 'green-soft' };
  }
  const elapsed = Math.abs(diff);
  const end = showEndMs(concert);
  if (end && now <= end) return { text: `Started ${durationShort(elapsed)} ago`, tone: elapsed < 2 * 3600_000 ? 'red-hot' : 'red' };
  if (elapsed < 12 * 3600_000) return { text: `Ended ${durationShort(now - (end || ms))} ago`, tone: 'red-soft' };
  return { text: concert.when === 'past' ? 'Past show' : 'Started earlier', tone: 'zinc' };
}

function countdownClass(tone) {
  if (tone === 'green-hot') return 'text-emerald-200';
  if (tone === 'green') return 'text-green-300';
  if (tone === 'green-soft') return 'text-lime-200';
  if (tone === 'red-hot') return 'text-rose-200';
  if (tone === 'red') return 'text-red-300';
  if (tone === 'red-soft') return 'text-red-500';
  if (tone === 'amber') return 'text-amber-200';
  return 'text-zinc-500';
}

function showState(concert, now) {
  const start = showStartMs(concert);
  if (!start) return { current: false, ended: false, recentlyEnded: false };
  const end = showEndMs(concert);
  const nearStart = Math.abs(start - now) <= 2 * 3600_000;
  const current = Boolean(end && now >= start && now <= end) || nearStart;
  const ended = Boolean(end && now > end);
  const recentlyEnded = Boolean(end && now > end && now - end <= 4 * 3600_000);
  return { current, ended, recentlyEnded, start, end };
}

function showEndMs(concert) {
  const start = showStartMs(concert);
  if (!start) return null;
  return start + estimatedShowMs(concert);
}

function estimatedShowMs(concert) {
  const songs = concert?.songCount || concert?.setlist?.length || 0;
  if (songs > 0) return Math.max(75, songs * 4.5 + (songs - 1) * 0.6) * 60_000;
  return 3 * 3600_000;
}

function durationShort(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function showStartMs(concert) {
  if (!concert?.date) return null;
  const raw = concert.startDate || '';
  if (raw.includes('T')) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
    if (m) {
      return zonedToUtc(venueTimeZone(concert), Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
    }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(concert.date);
  if (!m) return null;
  return zonedToUtc(venueTimeZone(concert), Number(m[1]), Number(m[2]), Number(m[3]), 20, 0);
}

function venueTimeZone(concert) {
  if (concert?.timeZone) return concert.timeZone;
  const country = String(concert?.country || '').toLowerCase();
  const region = String(concert?.region || '').toUpperCase();
  const city = String(concert?.city || '').toLowerCase();
  if (/canada/.test(country)) {
    if (region === 'BC' || city.includes('vancouver')) return 'America/Vancouver';
    if (['AB', 'NT'].includes(region)) return 'America/Edmonton';
    if (['MB', 'SK'].includes(region)) return 'America/Winnipeg';
    if (['ON', 'QC'].includes(region) || city.includes('toronto') || city.includes('montreal')) return 'America/Toronto';
    if (['NS', 'NB', 'PE'].includes(region)) return 'America/Halifax';
    if (region === 'NL') return 'America/St_Johns';
    return 'America/Toronto';
  }
  if (/united states|usa|us/.test(country)) {
    if (['CA', 'WA', 'OR', 'NV'].includes(region) || city.includes('los angeles') || city.includes('san diego') || city.includes('seattle')) return 'America/Los_Angeles';
    if (region === 'AZ') return 'America/Phoenix';
    if (['CO', 'UT', 'NM', 'WY', 'MT', 'ID'].includes(region)) return 'America/Denver';
    if (['IL', 'TX', 'TN', 'MO', 'MN', 'WI', 'LA', 'OK', 'AR', 'KS', 'NE', 'IA', 'AL', 'MS'].includes(region)) return 'America/Chicago';
    return 'America/New_York';
  }
  if (/united kingdom|england|scotland|wales|ireland/.test(country)) return 'Europe/London';
  if (/france/.test(country)) return 'Europe/Paris';
  if (/italy/.test(country)) return 'Europe/Rome';
  if (/germany/.test(country)) return 'Europe/Berlin';
  if (/spain/.test(country)) return 'Europe/Madrid';
  if (/netherlands/.test(country)) return 'Europe/Amsterdam';
  if (/belgium/.test(country)) return 'Europe/Brussels';
  if (/switzerland/.test(country)) return 'Europe/Zurich';
  if (/austria/.test(country)) return 'Europe/Vienna';
  if (/poland/.test(country)) return 'Europe/Warsaw';
  if (/czech/.test(country)) return 'Europe/Prague';
  if (/hungary/.test(country)) return 'Europe/Budapest';
  if (/lithuania/.test(country)) return 'Europe/Vilnius';
  if (/latvia/.test(country)) return 'Europe/Riga';
  if (/estonia/.test(country)) return 'Europe/Tallinn';
  if (/denmark/.test(country)) return 'Europe/Copenhagen';
  if (/norway/.test(country)) return 'Europe/Oslo';
  if (/finland/.test(country)) return 'Europe/Helsinki';
  if (/sweden/.test(country)) return 'Europe/Stockholm';
  if (/portugal/.test(country)) return 'Europe/Lisbon';
  if (/greece/.test(country)) return 'Europe/Athens';
  if (/turkey/.test(country)) return 'Europe/Istanbul';
  if (/japan/.test(country)) return 'Asia/Tokyo';
  if (/south korea|korea/.test(country)) return 'Asia/Seoul';
  if (/china/.test(country)) return 'Asia/Shanghai';
  if (/singapore/.test(country)) return 'Asia/Singapore';
  if (/india/.test(country)) return 'Asia/Kolkata';
  if (/united arab emirates|uae/.test(country)) return 'Asia/Dubai';
  if (/australia/.test(country)) return city.includes('perth') ? 'Australia/Perth' : 'Australia/Sydney';
  if (/new zealand/.test(country)) return 'Pacific/Auckland';
  if (/mexico/.test(country)) return 'America/Mexico_City';
  if (/brazil/.test(country)) return 'America/Sao_Paulo';
  return DETECTED_TIME_ZONE;
}

function zoneAbbr(zone, ms) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(ms || Date.now()));
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch {
    return zone;
  }
}

function tzOffsetMs(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour % 24), +parts.minute, +parts.second);
  return asIfUtc - utcMs;
}

function zonedToUtc(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - tzOffsetMs(tz, guess);
}

function projectMapPoint(lat, lng) {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * 100;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 100;
  return {
    x: Math.max(4, Math.min(96, x)),
    y: Math.max(5, Math.min(95, y)),
  };
}

function shortLabel(value) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).join(' ');
  return String(value || '').slice(0, 14);
}

function monthGrid(anchor) {
  const [y, m] = anchor.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { iso: d.toISOString().slice(0, 10) };
  });
}

function addMonths(anchor, delta) {
  const [y, m] = anchor.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(anchor) {
  const [y, m] = anchor.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function SourceBadges({ sources }) {
  const sourceLabel = (value) => {
    if (value === 'live') return ['Live', 'text-emerald-200 border-emerald-300/20 bg-emerald-300/10'];
    if (value === 'mock') return ['Demo', 'text-amber-200 border-amber-300/20 bg-amber-300/10'];
    if (value === 'error') return ['Error', 'text-rose-200 border-rose-300/20 bg-rose-300/10'];
    if (value === 'nokey') return ['No key', 'text-zinc-400 border-white/10 bg-white/5'];
    return ['N/A', 'text-zinc-500 border-white/10 bg-white/5'];
  };
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ['Upcoming', sources.jambase],
        ['Past', sources.setlistfm],
      ].map(([label, value]) => {
        const [txt, cls] = sourceLabel(value);
        return (
          <span key={label} className={`rounded-md border px-2 py-1 text-xs font-medium ${cls}`}>
            {label}: {txt}
          </span>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div className="cohear-panel flex min-h-80 flex-col items-center justify-center px-6 text-center">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function MapPinIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>;
}
function ClockIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>;
}
function BookmarkIcon({ filled }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.4L6 21V4.8Z" /></svg>;
}

const GOOGLE_DARK_MAP = [
  { elementType: 'geometry', stylers: [{ color: '#17191f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a1a1aa' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#09090b' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3f3f46' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
];
