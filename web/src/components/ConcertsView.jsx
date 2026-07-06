import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchConcerts, getCachedConcerts, filterWhen, spotifyArtist, ticketmasterMatch, seatgeekMatch, ticketWebEstimate, C_SORTS, defaultDir } from '../concerts.js';
import { readStubs, readHistory } from '../account.js';
import { fmtCapacity, fmtDate } from '../tour.js';
import { loadGoogleMaps, hasMapsKey } from '../live/maps.js';
import { GOOGLE_PAPER_MAP } from '../live/mapStyle.js';
import { claimStamp, optOutConcert, recordConcertAction, personalStats, backfillStubs, pruneDuplicates, HISTORY_EVENT } from '../account.js';
import { readCalendar, addToCalendar, scheduleReminders } from '../calendar.js';

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

const SORT_KEYS = ['soon', 'capacity', 'popularity', 'date', 'artist', 'venue', 'city'];
const USER_ZONE_KEY = 'cohear_user_timezone';
const DISCOVER_STATE_KEY = 'cohear_discover_state_v4';
const DISCOVER_LAYOUT_KEY = 'cohear_discover_layout_v1';
const DEFAULT_INSPECTOR_WIDTH = 380;
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
    windowKey: 'tonight',
    concerts: getCachedConcerts('', 'live', 'tonight')?.concerts || [],
    sources: getCachedConcerts('', 'live', 'tonight')?.sources || {},
    mode: 'list',
    sortKey: 'soon',
    dir: 'asc',
    when: 'all',
    hideEnded: false,
    showMyArtists: false,
    selectedId: null,
    minCapacity: 0,
    timeLimitHrs: 0,
  };
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DISCOVER_STATE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.concerts)) return fallback;
    return { ...fallback, ...parsed, hideEnded: parsed.hideEnded ?? false };
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

function readInspectorWidth() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISCOVER_LAYOUT_KEY) || 'null');
    return clampInspectorWidth(parsed?.inspectorWidth || DEFAULT_INSPECTOR_WIDTH);
  } catch {
    return DEFAULT_INSPECTOR_WIDTH;
  }
}

function clampInspectorWidth(width) {
  return Math.max(300, Math.min(560, Number(width) || DEFAULT_INSPECTOR_WIDTH));
}

export default function ConcertsView({ onEnterShow, onSyncLive, settings, onSettingsChange }) {
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
  const [minCapacity, setMinCapacity] = useState(initialState.minCapacity || 0);
  const [timeLimitHrs, setTimeLimitHrs] = useState(initialState.timeLimitHrs || 0);
  const [spotify, setSpotify] = useState(null);
  const [saved, setSaved] = useState(() => new Set(JSON.parse(localStorage.getItem('cohear_saved_shows') || '[]')));
  const [calendared, setCalendared] = useState(() => new Set(readCalendar().map((e) => e.id)));
  const [fallbackUserZone, setFallbackUserZone] = useState(() => settings?.timezone || localStorage.getItem(USER_ZONE_KEY) || DETECTED_TIME_ZONE);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [inspectorWidth, setInspectorWidth] = useState(() => readInspectorWidth());
  const [me, setMe] = useState(() => personalStats());
  const [showMyArtists, setShowMyArtists] = useState(Boolean(initialState.showMyArtists));
  const resizeRef = useRef(null);

  // Build a set of artist names the user has attended (stubs + history)
  const myArtistNames = useMemo(() => {
    const names = new Set();
    for (const s of readStubs()) {
      if (s.artist) names.add(s.artist.toLowerCase());
    }
    for (const h of readHistory()) {
      if (h.status === 'attended' && h.artist) names.add(h.artist.toLowerCase());
    }
    return names;
  }, [me]); // re-derive when personal stats change (stamps added/removed)

  // Personal passport stats for the header — backfill any missing stubs once,
  // then keep the numbers live as you stamp shows.
  useEffect(() => {
    pruneDuplicates(); // collapse any duplicate stubs/stamps from older data or cloud merges
    backfillStubs();
    const refresh = () => setMe(personalStats());
    refresh();
    window.addEventListener(HISTORY_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_EVENT, refresh);
  }, []);

  const browse = !artist;
  const userZone = settings?.timezone || fallbackUserZone;
  const preferredCurrency = settings?.currency || 'USD';

  async function loadBrowse(win = windowKey, { force = false, reset = true } = {}) {
    const cached = !force ? getCachedConcerts('', 'live', win) : null;
    if (cached?.concerts?.length) {
      setArtist('');
      setWindowKey(win);
      setConcerts(cached.concerts);
      setSources(cached.sources || {});
      if (reset) {
        setSortKey('soon');
        setDir('asc');
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
        setSortKey('soon');
        setDir('asc');
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
        setSortKey('soon');
        setDir('asc');
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
        setSortKey('soon');
        setDir('asc');
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
    writeDiscoverState({ query, artist, location, windowKey, concerts, sources, mode, sortKey, dir, when, hideEnded, showMyArtists, selectedId, minCapacity, timeLimitHrs });
  }, [artist, concerts, dir, hideEnded, location, mode, query, selectedId, showMyArtists, sortKey, sources, when, windowKey, minCapacity, timeLimitHrs]);

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

  // Add (or remove) a show from the device calendar: downloads an .ics with
  // built-in reminders and records it locally so the month view highlights it.
  function addCalendar(c) {
    const start = showStartMs(c);
    if (!start) return;
    addToCalendar(c, start, showEndMs(c));
    setCalendared(new Set(readCalendar().map((e) => e.id)));
  }

  useEffect(() => { scheduleReminders(); }, []);

  function setUserZone(zone) {
    setFallbackUserZone(zone);
    localStorage.setItem(USER_ZONE_KEY, zone);
    onSettingsChange?.((prev) => ({ ...prev, timezone: zone }));
  }

  const resetDiscoverLayout = useCallback(() => {
    setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
    setMode('list');
    setSortKey('soon');
    setDir('asc');
    setWhen('all');
    setHideEnded(false);
    setShowMyArtists(false);
    setMinCapacity(0);
    setTimeLimitHrs(0);
    try {
      localStorage.removeItem(DISCOVER_LAYOUT_KEY);
    } catch {
      /* ignore storage failures */
    }
  }, []);

  function beginInspectorResize(e) {
    resizeRef.current = { startX: e.clientX, startWidth: inspectorWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    const graceMs = (settings?.endedGraceHours ?? 2) * 3600_000;
    const base = browse ? concerts : filterWhen(concerts, when);
    const filtered = base.filter((c) => {
      if (minCapacity > 0 && (c.capacity == null || c.capacity < minCapacity)) return false;
      if (timeLimitHrs > 0) {
        const start = showStartMs(c);
        if (!start || start - now > timeLimitHrs * 3600_000) return false;
      }
      const st = showState(c, now);
      // Hide a show only once it's ended AND past the configured grace window.
      if (hideEnded && st.ended && st.end && now - st.end > graceMs) return false;
      const haystack = [c.artist, c.venue, c.city, c.region, c.country].filter(Boolean).join(' ').toLowerCase();
      const locationText = [c.city, c.region, c.country, c.venue].filter(Boolean).join(' ').toLowerCase();
      return (!search || haystack.includes(search)) && (!loc || locationText.includes(loc));
    });
    const sorted = sortVisibleConcerts(filtered, sortKey, dir, userZone, now);
    // When "My Artists" is on, boost concerts by attended artists to the top
    if (showMyArtists && myArtistNames.size > 0) {
      const mine = [];
      const rest = [];
      for (const c of sorted) {
        if (c.artist && myArtistNames.has(c.artist.toLowerCase())) mine.push(c);
        else rest.push(c);
      }
      return [...mine, ...rest];
    }
    return sorted;
  }, [artist, browse, concerts, dir, hideEnded, location, myArtistNames, now, query, settings?.endedGraceHours, showMyArtists, sortKey, userZone, when, minCapacity, timeLimitHrs]);

  // Reset pagination when filters or sort change
  useEffect(() => {
    setPage(1);
  }, [visible]);

  useEffect(() => {
    if (!visible.length) return;
    if (selectedId && !visible.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [selectedId, visible]);

  const paginatedVisible = useMemo(() => visible.slice(0, page * 100), [visible, page]);

  const selected = useMemo(() => visible.find((c) => c.id === selectedId) || null, [selectedId, visible]);
  const biggest = visible[0] || null;
  const stats = useMemo(() => {
    const upcoming = concerts.filter((c) => c.when === 'upcoming').length;
    return { count: visible.length, upcoming, past: concerts.length - upcoming };
  }, [concerts, visible]);

  useEffect(() => {
    try {
      localStorage.setItem(DISCOVER_LAYOUT_KEY, JSON.stringify({ inspectorWidth }));
    } catch {
      /* ignore storage failures */
    }
  }, [inspectorWidth]);

  useEffect(() => {
    function move(e) {
      const active = resizeRef.current;
      if (!active) return;
      const delta = e.clientX - active.startX;
      setInspectorWidth(clampInspectorWidth(active.startWidth - delta));
    }
    function stop() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stop();
    };
  }, []);

  useEffect(() => {
    window.addEventListener('cohear:reset-layout', resetDiscoverLayout);
    return () => window.removeEventListener('cohear:reset-layout', resetDiscoverLayout);
  }, [resetDiscoverLayout]);

  useEffect(() => {
    if (selected) recordConcertAction(selected, 'viewed', { source: 'discover' });
  }, [selected?.id]);

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
        currency={preferredCurrency}
        now={now}
        me={me}
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
        showMyArtists={showMyArtists}
        setShowMyArtists={setShowMyArtists}
        hasMyArtists={myArtistNames.size > 0}
        loading={loading}
        onArtistSearch={() => loadArtist(query)}
        onClearSearch={() => {
          setQuery('');
          setArtist('');
          loadBrowse(windowKey);
        }}
        onRefresh={refreshConcerts}
        onResetLayout={resetDiscoverLayout}
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
        <div className="cohear-resizable-layout" style={{ '--cohear-inspector-width': `${inspectorWidth}px` }}>
          <main className="min-w-0">
            {mode === 'list' && (
              <div className="flex flex-col h-full">
                <ConcertTable
                  rows={paginatedVisible}
                  selectedId={selected?.id}
                  onSelect={setSelectedId}
                  saved={saved}
                  calendared={calendared}
                  onAddCalendar={addCalendar}
                  userZone={userZone}
                  now={now}
                  sortKey={sortKey}
                  dir={dir}
                  onSort={pickSort}
                  onSyncLive={onSyncLive}
                />
                {visible.length > page * 100 && (
                  <div className="flex justify-center p-4 border-t border-white/10 shrink-0">
                    <button 
                      className="cohear-secondary px-6 py-2" 
                      onClick={() => setPage(p => p + 1)}
                    >
                      Load More (Showing {page * 100} of {visible.length})
                    </button>
                  </div>
                )}
              </div>
            )}
            {mode === 'map' && <ConcertMap rows={visible} selectedId={selected?.id} onSelect={setSelectedId} />}
            {mode === 'calendar' && <ConcertCalendar rows={visible} selectedId={selected?.id} onSelect={setSelectedId} calendared={calendared} />}
          </main>

          <button
            type="button"
            className="cohear-resize-handle"
            onPointerDown={beginInspectorResize}
            aria-label="Resize concert detail panel"
            title="Drag to resize details"
          >
            <span />
          </button>

          <ConcertInspector
            concert={selected}
            saved={selected ? saved.has(selected.id) : false}
            calendared={selected ? calendared.has(selected.id) : false}
            sources={sources}
            userZone={userZone}
            currency={preferredCurrency}
            now={now}
            onSave={() => selected && toggleSave(selected.id)}
            onAddCalendar={() => selected && addCalendar(selected)}
            onEnterShow={onEnterShow}
            onSyncLive={onSyncLive}
            minCapacity={minCapacity}
            setMinCapacity={setMinCapacity}
            timeLimitHrs={timeLimitHrs}
            setTimeLimitHrs={setTimeLimitHrs}
          />
        </div>
      )}
    </div>
  );
}

function DiscoverHeader({ artist, browse, biggest, loading, stats, spotify, userZone, currency, now, me, onBrowse }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="cohear-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="cohear-label">{browse ? 'Discover' : 'Artist timeline'}</p>
            <h2 className="mt-2 max-w-3xl text-4xl italic tracking-tight text-[var(--accent)] md:text-5xl">
              {browse ? 'Concerts happening tonight.' : artist}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              {browse
                ? 'Ordered by most recent show time, with quick filters for city, venue, artist, date, and live-room readiness.'
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
          <p className="cohear-label">Your live passport</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MetricBlock
              label="Concerts attended"
              value={me.attended.toLocaleString()}
              title="Shows you've been in the room for — stamped automatically when you open a live room."
            />
            <MetricBlock
              label="Miles travelled"
              value={`${Math.round(me.miles).toLocaleString()} mi`}
              tone="amber"
              title="Great-circle distance of your concert-hopping itinerary, as if you'd flown to each city. Set a home city on your passport to count the round-trip."
            />
            <MetricBlock
              label="Ticket $ saved"
              value={`${fmtUsd(me.savedUsd)} est.`}
              tone="green"
              title="Estimated total face value of tickets for every show you attended virtually instead of buying in."
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
    mode, setMode, sortKey, pickSort, dir, setDir, when, setWhen, hideEnded, setHideEnded,
    showMyArtists, setShowMyArtists, hasMyArtists,
    loading, onArtistSearch, onClearSearch, onRefresh, onResetLayout,
  } = props;

  return (
    <section className="cohear-panel p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.1fr)_minmax(160px,.55fr)_minmax(180px,.55fr)_auto]">
        <label className="cohear-field relative flex-1">
          <SearchIcon />
          <input
            className="w-full pr-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && onArtistSearch()}
            placeholder="Artist, city, venue"
          />
          {(!browse || query) && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
              onClick={onClearSearch}
              title="Clear search and return to Discover"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
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

        {hasMyArtists && (
          <button
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${showMyArtists ? 'border-amber-300/40 bg-amber-300/[0.12] text-amber-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100'}`}
            onClick={() => setShowMyArtists((v) => !v)}
            title="Boost concerts by artists you've attended to the top"
          >
            {showMyArtists ? '★ My Artists' : '☆ My Artists'}
          </button>
        )}

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
        <button
          className="cohear-icon-button"
          onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={dir === 'asc' ? 'Sort ascending. Click to reverse.' : 'Sort descending. Click to reverse.'}
          title={dir === 'asc' ? 'Ascending. Click to reverse.' : 'Descending. Click to reverse.'}
        >
          <SortFlipIcon dir={dir} />
        </button>
        <button
          className="cohear-icon-button"
          onClick={onRefresh}
          disabled={loading}
          aria-label={loading ? 'Refreshing concerts' : 'Refresh concerts'}
          title="Bypass the 8-hour concert cache and reload this view"
        >
          <RefreshIcon spinning={loading} />
        </button>
        <button className="cohear-secondary min-h-9 px-3 text-xs" onClick={onResetLayout} title="Reset Discover to the default list view and panel sizing">
          Reset layout
        </button>
      </div>
    </section>
  );
}

const COLS_KEY = 'cohear_discover_cols_v1';
const DEFAULT_COLS = { artist: 1.05, venue: 0.9, city: 1.05, time: 0.95 };

function readCols() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLS_KEY) || 'null');
    if (!parsed) return { ...DEFAULT_COLS };
    return {
      artist: clampFr(parsed.artist, DEFAULT_COLS.artist),
      venue: clampFr(parsed.venue, DEFAULT_COLS.venue),
      city: clampFr(parsed.city, DEFAULT_COLS.city),
      time: clampFr(parsed.time, DEFAULT_COLS.time),
    };
  } catch {
    return { ...DEFAULT_COLS };
  }
}

function clampFr(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0.45, Math.min(3, n));
}

// 56px rank · flexible artist/venue/city/time · 88px seats · 88px live. The
// flexible tracks keep a sane min width (so a city never clips to a couple of
// letters) and otherwise split the leftover space by the user's fr ratios.
function colsTemplate(c) {
  return `56px minmax(150px, ${c.artist}fr) minmax(130px, ${c.venue}fr) minmax(160px, ${c.city}fr) minmax(150px, ${c.time}fr) 88px 140px`;
}

function ConcertTable({ rows, selectedId, onSelect, saved, calendared, onAddCalendar, userZone, now, sortKey, dir, onSort, onSyncLive }) {
  const [syncingId, setSyncingId] = useState(null);
  const [cols, setCols] = useState(() => readCols());
  const headerRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(cols));
    } catch {
      /* ignore storage failures */
    }
  }, [cols]);

  useEffect(() => {
    function move(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaFr = (e.clientX - drag.startX) / drag.pxPerFr;
      setCols((prev) => ({ ...prev, [drag.key]: clampFr(drag.startFr + deltaFr, prev[drag.key]) }));
    }
    function stop() {
      if (!dragRef.current) return;
      dragRef.current.handle?.classList.remove('dragging');
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  function beginColResize(key, e) {
    const headerWidth = headerRef.current?.getBoundingClientRect().width || 900;
    const flexWidth = Math.max(200, headerWidth - 232); // minus the three fixed tracks
    const sumFr = cols.artist + cols.venue + cols.city + cols.time;
    dragRef.current = { key, startX: e.clientX, startFr: cols[key], pxPerFr: flexWidth / sumFr, handle: e.currentTarget };
    e.currentTarget.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  }

  async function join(c) {
    if (!onSyncLive || syncingId) return;
    setSyncingId(c.id);
    try {
      await onSyncLive(c);
    } finally {
      setSyncingId(null);
    }
  }

  const template = colsTemplate(cols);

  return (
    <div className="cohear-panel overflow-hidden" style={{ '--cohear-cols': template }}>
      <div ref={headerRef} className="cohear-concert-row grid border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 max-lg:hidden">
        <span>Rank</span>
        <div className="cohear-col-cell">
          <SortHeader id="artist" label="Artist" sortKey={sortKey} dir={dir} onSort={onSort} />
          <button type="button" className="cohear-col-resize" aria-label="Resize artist column" onPointerDown={(e) => beginColResize('artist', e)} />
        </div>
        <div className="cohear-col-cell">
          <SortHeader id="venue" label="Venue" sortKey={sortKey} dir={dir} onSort={onSort} />
          <button type="button" className="cohear-col-resize" aria-label="Resize venue column" onPointerDown={(e) => beginColResize('venue', e)} />
        </div>
        <div className="cohear-col-cell">
          <SortHeader id="city" label="City" sortKey={sortKey} dir={dir} onSort={onSort} />
          <button type="button" className="cohear-col-resize" aria-label="Resize city column" onPointerDown={(e) => beginColResize('city', e)} />
        </div>
        <SortHeader id="date" label="Time" sortKey={sortKey} dir={dir} onSort={onSort} />
        <SortHeader id="capacity" label="Seats" align="right" sortKey={sortKey} dir={dir} onSort={onSort} />
        <span className="text-right">Live</span>
      </div>
      <ol className="max-h-[660px] overflow-y-auto">
        {rows.map((c, i) => {
          const state = showState(c, now);
          const tint = c.id === selectedId
            ? 'ct-row-sel'
            : state.current
              ? 'ct-row-live'
              : state.recentlyEnded
                ? 'ct-row-ended'
                : 'hover:bg-white/[0.035]';
          return (
            <li
              key={c.id}
              className={`cohear-concert-row grid gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0 lg:items-center ${tint}`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className="contents text-left"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
                  <span className="w-7 tabular-nums text-zinc-500">{String(i + 1).padStart(2, '0')}</span>
                  {state.current && <span className="ct-dot-live h-2 w-2 rounded-full" title="Happening now" />}
                  {saved.has(c.id) && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" title="Saved" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{c.artist || 'Unknown artist'}</span>
                  <span className="mt-1 block text-xs text-zinc-500 lg:hidden">
                    {c.venue} · {[c.city, c.country].filter(Boolean).join(', ')}
                  </span>
                </span>
                <span className="hidden min-w-0 truncate text-sm text-zinc-300 lg:block">{c.venue}</span>
                <span className="hidden min-w-0 truncate text-sm text-zinc-400 lg:block">{[c.city, c.country].filter(Boolean).join(', ')}</span>
                <TimeStack concert={c} userZone={userZone} now={now} />
                <span className="text-left text-sm font-semibold tabular-nums text-amber-200 lg:text-right">{fmtCapacity(c.capacity)}</span>
              </button>
              <span className="flex items-center gap-1.5 lg:justify-self-end">
                {showStartMs(c) && (
                  <button
                    type="button"
                    className={`cohear-icon-button h-9 w-9 shrink-0 ${calendared?.has(c.id) ? 'text-cyan-300' : ''}`}
                    onClick={() => onAddCalendar?.(c)}
                    title={calendared?.has(c.id) ? 'On your calendar — click to remove' : 'Add to calendar (downloads an .ics with reminders)'}
                    aria-pressed={calendared?.has(c.id) || false}
                  >
                    <CalendarPlusIcon added={calendared?.has(c.id)} />
                  </button>
                )}
                <button
                  className="cohear-primary min-h-9 justify-center px-3 text-xs"
                  onClick={() => join(c)}
                  disabled={syncingId === c.id}
                >
                  {syncingId === c.id ? 'Opening' : 'Join'}
                </button>
              </span>
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

function ConcertInspector({ concert, saved, calendared, sources, userZone, currency, now, onSave, onAddCalendar, onEnterShow, onSyncLive, minCapacity, setMinCapacity, timeLimitHrs, setTimeLimitHrs }) {
  const [syncing, setSyncing] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [sgTicket, setSgTicket] = useState(null);
  const [webTicket, setWebTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [sgTicketLoading, setSgTicketLoading] = useState(false);
  const [webTicketLoading, setWebTicketLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setTicket(null);
    setWebTicket(null);
    if (!concert || concert.when === 'past') {
      setTicketLoading(false);
      setWebTicketLoading(false);
      return () => {
        alive = false;
      };
    }
    setTicketLoading(true);
    setSgTicketLoading(true);
    
    ticketmasterMatch(concert)
      .then((res) => {
        if (alive) setTicket(res);
        const ticketInfo = res?.ok ? res.ticket : null;
        if (alive && !hasTicketPrice(ticketInfo)) {
          setWebTicketLoading(true);
          return ticketWebEstimate(concert, currency)
            .then((webRes) => {
              if (alive) setWebTicket(webRes);
            })
            .finally(() => {
              if (alive) setWebTicketLoading(false);
            });
        }
        return null;
      })
      .finally(() => {
        if (alive) setTicketLoading(false);
      });

    seatgeekMatch(concert)
      .then((res) => {
        if (alive) setSgTicket(res);
      })
      .finally(() => {
        if (alive) setSgTicketLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [concert, currency]);

  if (!concert) {
    return (
      <aside className="cohear-panel sticky top-5 self-start overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-semibold text-white">Filter Concerts</h3>
          <p className="mt-1 text-xs text-zinc-500">Refine the current list of concerts. Select a concert from the list to view its details here.</p>
        </div>
        <div className="space-y-6 p-5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Minimum Capacity</label>
            <div className="mt-3 grid gap-2">
              {[
                { id: 0, label: 'All Capacities' },
                { id: 10000, label: '10,000+ Seats (Arenas)' },
                { id: 20000, label: '20,000+ Seats' },
                { id: 50000, label: '50,000+ Seats (Stadiums)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMinCapacity(opt.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${
                    minCapacity === opt.id
                      ? 'border-amber-300/50 bg-amber-300/[0.1] text-amber-100'
                      : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  {minCapacity === opt.id && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Time Window</label>
            <div className="mt-3 grid gap-2">
              {[
                { id: 0, label: 'Any Time' },
                { id: 24, label: 'Next 24 Hours' },
                { id: 48, label: 'Next 48 Hours' },
                { id: 168, label: 'Next 7 Days' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTimeLimitHrs(opt.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${
                    timeLimitHrs === opt.id
                      ? 'border-cyan-300/50 bg-cyan-300/[0.1] text-cyan-100'
                      : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  {timeLimitHrs === opt.id && <span className="h-2 w-2 rounded-full bg-cyan-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  async function sync() {
    if (!onSyncLive) return;
    setSyncing(true);
    await onSyncLive(concert);
    setSyncing(false);
  }

  const ticketInfo = ticket?.ok ? ticket.ticket : null;
  const sgTicketInfo = sgTicket?.ok ? sgTicket.ticket : null;
  const webEstimate = webTicket?.ok ? webTicket.estimate : null;
  const priceLoading = ticketLoading || webTicketLoading || sgTicketLoading;

  return (
    <aside className="cohear-panel sticky top-5 self-start overflow-hidden">
      <div className="cohear-detail-hero h-40 p-4">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <StatusPill when={concert.when} />
            <div className="flex items-center gap-2">
              {onSyncLive && (
                <button className="cohear-primary min-h-9 px-3 text-xs" onClick={sync} disabled={syncing}>
                  {syncing ? 'Opening' : 'Join live'}
                </button>
              )}
              {concert.when !== 'past' && onAddCalendar && (
                <button
                  className={`cohear-icon-button ${calendared ? 'text-cyan-300' : ''}`}
                  onClick={onAddCalendar}
                  title={calendared ? 'On your calendar — click to remove' : 'Add to calendar (downloads an .ics with reminders)'}
                  aria-pressed={calendared || false}
                >
                  <CalendarPlusIcon added={calendared} />
                </button>
              )}
              <button className="cohear-icon-button" onClick={onSave} title={saved ? 'Remove saved concert' : 'Save concert'}>
                <BookmarkIcon filled={saved} />
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-[#c9bba9]">Selected concert</div>
            <h3 className="mt-2 line-clamp-2 text-2xl font-semibold text-[#fdf7ee]">{concert.artist || concert.venue}</h3>
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
          <MetricBlock
            label={ticketPriceLabel(ticketInfo, webEstimate)}
            value={priceLoading ? 'Checking' : ticketPriceDisplay(ticketInfo, webEstimate, concert, currency)}
            tone="green"
            title={ticketPriceTitle(ticketInfo, webEstimate)}
          />
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

        <TicketCard ticket={ticketInfo} sgTicket={sgTicketInfo} webEstimate={webEstimate} loading={priceLoading} concert={concert} currency={currency} />

        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button className="cohear-secondary w-full justify-center" onClick={() => claimStamp(concert)}>
              Claim stamp
            </button>
            <button className="cohear-secondary w-full justify-center" onClick={() => optOutConcert(concert)} title="Remove this show from your passport">
              I was never here
            </button>
          </div>
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
  const stateRef = useRef({ map: null, maps: null, markers: new Map(), trails: [], fittedKey: '' });
  const [err, setErr] = useState(hasMapsKey() ? null : 'missing-key');
  const [mapReady, setMapReady] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [trailArtist, setTrailArtist] = useState('');
  const [mapType, setMapType] = useState('paper');
  const mappable = rows.filter((c) => c.lat != null && c.lng != null);
  const artists = useMemo(() => [...new Set(mappable.map((c) => c.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [mappable]);
  const trailRows = useMemo(() => {
    if (!trailArtist) return [];
    return mappable.filter((c) => c.artist === trailArtist).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [mappable, trailArtist]);
  const routeSegments = useMemo(() => routeTrailSegments(trailRows), [trailRows]);

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
          backgroundColor: '#a9c4cc',
          styles: GOOGLE_PAPER_MAP,
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

  // Switch between the paper-styled roadmap, satellite, and terrain views.
  useEffect(() => {
    const { map } = stateRef.current;
    if (!map) return;
    if (mapType === 'satellite') { map.setMapTypeId('hybrid'); map.setOptions({ styles: [] }); }
    else if (mapType === 'terrain') { map.setMapTypeId('terrain'); map.setOptions({ styles: [] }); }
    else { map.setMapTypeId('roadmap'); map.setOptions({ styles: GOOGLE_PAPER_MAP }); }
  }, [mapType, mapReady]);

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
        fillColor: c.id === selectedId ? '#0ea5b7' : '#e0922b',
        fillOpacity: c.id === selectedId ? 0.95 : 0.85,
        strokeColor: mapType === 'paper' ? '#5b4a2a' : '#ffffff',
        strokeWeight: c.id === selectedId ? 2 : 1,
      };
      let marker = markers.get(c.id);
      if (!marker) {
        marker = new maps.Marker({ position, map, title: `${c.artist} - ${c.venue}` });
        marker.addListener('click', () => onSelect(c.id));
        markers.set(c.id, marker);
      }
      marker.setPosition(position);
      marker.setIcon(icon);
      marker.setLabel(showLabels ? { text: shortLabel(c.artist || c.venue), color: mapType === 'paper' ? '#3a2e16' : '#f4f4f5', fontSize: '11px', fontWeight: '700' } : null);
      marker.setZIndex(c.id === selectedId ? 1000 : 1);
    }
    for (const trail of stateRef.current.trails) trail.setMap(null);
    stateRef.current.trails = [];
    for (const segment of routeSegments) {
      const dashedIcon = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: '#67e8f9',
        scale: 2.4,
      };
      const trail = new maps.Polyline({
        path: [
          { lat: Number(segment.from.lat), lng: Number(segment.from.lng) },
          { lat: Number(segment.to.lat), lng: Number(segment.to.lng) },
        ],
        geodesic: true,
        strokeColor: segment.done ? '#34d399' : '#67e8f9',
        strokeOpacity: segment.done ? 0.86 : 0,
        strokeWeight: segment.done ? 3 : 2,
        icons: segment.done ? [] : [{ icon: dashedIcon, offset: '0', repeat: '14px' }],
        map,
      });
      stateRef.current.trails.push(trail);
    }
    const fittedKey = mappable.map((c) => c.id).join('|');
    if (mappable.length && stateRef.current.fittedKey !== fittedKey) {
      map.fitBounds(bounds, 72);
      stateRef.current.fittedKey = fittedKey;
    }
  }, [mappable, onSelect, routeSegments, selectedId, showLabels, mapType]);

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
        mapType={mapType}
        setMapType={setMapType}
        fallbackReason={err}
      >
        <FallbackMap rows={mappable} selectedId={selectedId} onSelect={onSelect} showLabels={showLabels} trailRows={trailRows} routeSegments={routeSegments} />
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
      mapType={mapType}
      setMapType={setMapType}
    >
      <div className="relative">
        <div ref={mapRef} aria-label="Concert location map" className="h-[620px] w-full bg-[#e9ddc0]" />
        {!mapReady && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f1e7d0]/80 text-sm text-black/60">
            Unrolling the map…
          </div>
        )}
      </div>
    </MapShell>
  );
}

const MAP_TYPES = [{ id: 'paper', label: 'Paper' }, { id: 'satellite', label: 'Satellite' }, { id: 'terrain', label: 'Terrain' }];

function MapShell({ children, count, showLabels, setShowLabels, trailArtist, setTrailArtist, artists, mapType, setMapType, fallbackReason }) {
  const reasonText = fallbackReason
    ? fallbackReason === 'missing-key'
      ? 'Google Maps key is missing, so Cohere is showing its built-in coordinate map.'
      : `Google Maps did not finish loading (${fallbackReason}), so Cohere is showing its built-in coordinate map.`
    : 'Google Maps markers sized by known attendance capacity. Tour trails use solid completed legs and dashed future legs.';
  return (
    <div className="cohear-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Concert map</h3>
          <p className="mt-1 text-xs text-zinc-500">{reasonText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {setMapType && !fallbackReason && (
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              {MAP_TYPES.map((t) => (
                <button
                  key={t.id}
                  className={`px-3 py-2 text-xs font-semibold ${mapType === t.id ? 'bg-amber-300/[0.16] text-amber-100' : 'bg-black/20 text-zinc-400 hover:text-zinc-100'}`}
                  onClick={() => setMapType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
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

function FallbackMap({ rows, selectedId, onSelect, showLabels, trailRows, routeSegments }) {
  const plotted = rows.slice(0, 80).map((c) => ({
    ...c,
    point: projectMapPoint(Number(c.lat), Number(c.lng)),
    size: Math.max(12, Math.min(34, Math.sqrt(c.capacity || 4000) / 12)),
  }));
  const trailPoints = trailRows.map((c) => projectMapPoint(Number(c.lat), Number(c.lng)));

  return (
    <div
      aria-label="Concert location map"
      className="relative h-[620px] overflow-hidden bg-[var(--paper)]"
    >
      <div className="absolute inset-x-8 top-1/2 border-t border-white/10" />
      <div className="absolute inset-y-8 left-1/2 border-l border-white/10" />
      {trailPoints.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {routeSegments.map((segment) => {
            const a = projectMapPoint(Number(segment.from.lat), Number(segment.from.lng));
            const b = projectMapPoint(Number(segment.to.lat), Number(segment.to.lng));
            return (
              <line
                key={`${segment.from.id}-${segment.to.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                vectorEffect="non-scaling-stroke"
                stroke={segment.done ? '#34d399' : '#67e8f9'}
                strokeOpacity="0.86"
                strokeWidth="0.7"
                strokeDasharray={segment.done ? undefined : '2 1.6'}
              />
            );
          })}
        </svg>
      )}
      {plotted.map((c) => (
        <div key={c.id} className="absolute" style={{ left: `${c.point.x}%`, top: `${c.point.y}%` }}>
          <button
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${
              c.id === selectedId ? 'z-20 border-white bg-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-r),var(--accent-g),var(--accent-b),.55)]' : 'z-10 border-white/70 bg-zinc-400/80 hover:bg-zinc-300'
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

function ConcertCalendar({ rows, selectedId, onSelect, calendared }) {
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
                {shows.slice(0, 3).map((c) => {
                  const onCal = calendared?.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className={`rounded border px-2 py-1 text-left transition ${
                        c.id === selectedId ? 'border-cyan-300/50 bg-cyan-300/[0.1]' : onCal ? 'border-cyan-300/30 bg-cyan-300/[0.05]' : 'border-white/10 bg-black/20 hover:border-white/25'
                      }`}
                      title={`${c.artist} at ${c.venue}${onCal ? ' · on your calendar' : ''}`}
                    >
                      <span className="flex items-center gap-1">
                        {onCal && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" title="On your calendar" />}
                        <span className="block truncate text-[11px] font-semibold text-white">{c.artist}</span>
                      </span>
                      <span className="block truncate text-[10px] text-zinc-500">{fmtCapacity(c.capacity)}</span>
                    </button>
                  );
                })}
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
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-[var(--paper-card)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_42%,rgba(var(--accent-r),var(--accent-g),var(--accent-b),.28),transparent_18%),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]" />
      <div className="absolute left-4 top-4 rounded bg-black/45 px-2 py-1 text-xs font-medium text-zinc-300">
        {[concert.city, concert.country].filter(Boolean).join(', ') || 'Venue location'}
      </div>
      <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--accent)] shadow-[0_0_28px_rgba(var(--accent-r),var(--accent-g),var(--accent-b),.55)]" />
    </div>
  );
}

function TicketCard({ ticket, sgTicket, webEstimate, loading, concert, currency }) {
  if (concert.when === 'past') return null;
  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-400">
        Checking ticket sources...
      </div>
    );
  }
  if (!ticket && !sgTicket && !webEstimate) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Tickets</div>
        <div className="mt-1 text-sm font-semibold text-white">{estimatedTicketLabel(concert)}</div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Estimated single-ticket value. Add Ticketmaster, SeatGeek, and Google Search keys in Settings for live ranges and buy links.
        </p>
      </div>
    );
  }
  
  const shown = hasTicketPrice(ticket) ? ticket : webEstimate;
  
  return (
    <div className="grid gap-3">
      {(shown || ticket?.url) && (
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/70">Ticketmaster (Official)</div>
              <div className="mt-1 text-sm font-semibold text-white">{ticketRangeLabel(shown, currency)}</div>
              <div className="mt-1 truncate text-xs text-emerald-100/65">
                {ticket?.venue || concert.venue} {ticket?.date ? `- ${fmtDate(ticket.date)}` : ''}
              </div>
              {webEstimate && !hasTicketPrice(ticket) && (
                <div className="mt-2 text-xs leading-5 text-emerald-100/70">
                  Web estimate from {webEstimate.sourceCount || 0} source{webEstimate.sourceCount === 1 ? '' : 's'}.
                  {webEstimate.confidence ? ` Confidence: ${webEstimate.confidence.replace('_', ' ')}.` : ''}
                </div>
              )}
            </div>
            {ticket?.url && (
              <a className="cohear-primary min-h-9 shrink-0 px-3 text-xs" href={ticket.url} target="_blank" rel="noreferrer">
                Buy
              </a>
            )}
          </div>
          {webEstimate?.results?.length ? (
            <div className="mt-3 grid gap-1 border-t border-emerald-300/10 pt-3">
              {webEstimate.results.slice(0, 3).map((result) => (
                <a key={result.link || result.title} className="truncate text-xs text-emerald-100/70 hover:text-white" href={result.link} target="_blank" rel="noreferrer">
                  {result.title || result.link}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}
      
      {sgTicket && (
        <div className="rounded-lg border border-purple-300/20 bg-purple-300/[0.06] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-purple-200/70">SeatGeek (Resale)</div>
              <div className="mt-1 text-sm font-semibold text-white">{ticketRangeLabel(sgTicket, currency)}</div>
            </div>
            {sgTicket.url && (
              <a className="cohear-secondary min-h-9 shrink-0 px-3 text-xs border-purple-300/20 text-purple-200 hover:bg-purple-300/10 hover:border-purple-300/40" href={sgTicket.url} target="_blank" rel="noreferrer">
                Buy
              </a>
            )}
          </div>
        </div>
      )}
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
    <span className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold ${upcoming ? 'ct-pill-up' : 'ct-pill-down'}`}>
      <span className="ct-dot h-1.5 w-1.5 rounded-full" />
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

function sortVisibleConcerts(list, key, dir, userZone, now = Date.now()) {
  const sort = C_SORTS[key] || C_SORTS.date;
  const direction = (dir || sort.dir) === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = key === 'soon' ? timeProximityValue(a, now) : key === 'date' ? userLocalSortValue(a, userZone) : sort.get(a);
    const bv = key === 'soon' ? timeProximityValue(b, now) : key === 'date' ? userLocalSortValue(b, userZone) : sort.get(b);
    const aMissing = av == null || av === '';
    const bMissing = bv == null || bv === '';
    if (aMissing && !bMissing) return 1;
    if (!aMissing && bMissing) return -1;
    if (av < bv) return -1 * direction;
    if (av > bv) return 1 * direction;

    const tieA = `${showStartMs(a) || ''}|${a.artist || ''}|${a.venue || ''}`.toLowerCase();
    const tieB = `${showStartMs(b) || ''}|${b.artist || ''}|${b.venue || ''}`.toLowerCase();
    if (tieA < tieB) return -1;
    if (tieA > tieB) return 1;
    return 0;
  });
}

// Closeness-to-now ranking for the default "Happening soon" sort. Ascending, so
// the smallest value sits at the top: shows live right now first, then the
// soonest-upcoming, then the most-recently ended, with timeless shows last.
function timeProximityValue(concert, now) {
  const start = showStartMs(concert);
  if (!start) return Number.POSITIVE_INFINITY;
  const end = showEndMs(concert);
  const live = now >= start && (end ? now <= end : now - start <= 3 * 3600_000);
  if (live) return -1e13 + start; // live now → very top, ordered by start
  if (start > now) return start - now; // upcoming → soonest first
  return 1e13 + (now - start); // already started/ended → most recent first
}

function userLocalSortValue(concert, userZone) {
  const ms = showStartMs(concert);
  if (!ms) return null;
  try {
    const parts = {};
    for (const p of new Intl.DateTimeFormat('en-US', {
      timeZone: userZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(ms))) {
      parts[p.type] = p.value;
    }
    return Number(`${parts.year}${parts.month}${parts.day}${String(Number(parts.hour) % 24).padStart(2, '0')}${parts.minute}`);
  } catch {
    return ms;
  }
}

function metricTone(tone) {
  // Only the countdown's time-tones (green-*/red-*) carry real colour; every
  // other "tone" collapses to the monochrome ink so the page stays one colour.
  if (tone?.startsWith?.('green') || tone?.startsWith?.('red')) return countdownClass(tone);
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
  if (tone === 'green-hot') return 'ct-up-hot';
  if (tone === 'green') return 'ct-up';
  if (tone === 'green-soft') return 'ct-up-soft';
  if (tone === 'red-hot') return 'ct-down-hot';
  if (tone === 'red') return 'ct-down';
  if (tone === 'red-soft') return 'ct-down-soft';
  return 'ct-muted';
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

function estimatedTicketUsd(concert) {
  if (concert?.avgTicketUsd) return Math.round(concert.avgTicketUsd);
  const rawPopularity = Number(concert?.spotifyPopularity ?? concert?.artistPopularity ?? concert?.popularity ?? 55);
  const popularity = rawPopularity > 100 ? Math.min(100, 48 + Math.log10(Math.max(10, rawPopularity)) * 10) : rawPopularity;
  const capacity = Number(concert?.capacity || 12000);
  const arenaPremium = capacity >= 60000 ? 80 : capacity >= 25000 ? 45 : capacity >= 15000 ? 25 : 0;
  return Math.max(35, Math.round(45 + popularity * 1.15 + arenaPremium));
}

function estimatedTicketLabel(concert) {
  return `${fmtUsd(estimatedTicketUsd(concert))} typical est.`;
}

function hasTicketPrice(ticket) {
  return ticket?.priceLow != null || ticket?.priceHigh != null || ticket?.priceTypical != null;
}

function ticketPriceLabel(ticket, webEstimate) {
  if (hasTicketPrice(ticket)) return 'Ticket range';
  if (webEstimate) return 'Web estimate';
  return 'Est. ticket';
}

function ticketPriceDisplay(ticket, webEstimate, concert, currency) {
  if (hasTicketPrice(ticket)) return ticketRangeLabel(ticket, currency);
  if (webEstimate) return ticketRangeLabel(webEstimate, currency);
  return estimatedTicketLabel(concert);
}

function ticketPriceTitle(ticket, webEstimate) {
  if (hasTicketPrice(ticket)) return 'Ticketmaster single-ticket price range when supplied by the event.';
  if (webEstimate) return 'Estimated from top web search result snippets. Use as directional market pricing, not official inventory.';
  return 'Estimated single-ticket value, not live market pricing.';
}

function ticketRangeLabel(ticket, fallbackCurrency = 'USD') {
  const currency = ticket?.currency || fallbackCurrency || 'USD';
  const low = ticket?.priceLow;
  const high = ticket?.priceHigh;
  if (low != null && high != null && low !== high) return `${fmtMoney(low, currency)}-${fmtMoney(high, currency)}`;
  if (low != null || high != null) return fmtMoney(low ?? high, currency);
  if (ticket?.priceTypical != null) return `${fmtMoney(ticket.priceTypical, currency)} typical`;
  return 'Price unavailable';
}

function fmtUsd(value) {
  return fmtMoney(value, 'USD');
}

function fmtMoney(value, currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(value || 0);
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

function routeTrailSegments(rows) {
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const from = rows[i];
    const to = rows[i + 1];
    out.push({
      from,
      to,
      done: from.when === 'past' && to.when === 'past',
    });
  }
  return out;
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
    if (value === 'demo') return ['Demo', 'text-cyan-200 border-cyan-300/20 bg-cyan-300/10'];
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
function CalendarPlusIcon({ added }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      {added ? <path d="m9 14.5 2 2 4-4" /> : <path d="M12 12.5v5M9.5 15h5" />}
    </svg>
  );
}
function SortFlipIcon({ dir }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4v14" />
      <path d={dir === 'asc' ? 'm4 8 4-4 4 4' : 'm4 14 4 4 4-4'} />
      <path d="M16 20V6" />
      <path d={dir === 'asc' ? 'm20 16-4 4-4-4' : 'm20 10-4-4-4 4'} />
    </svg>
  );
}
function RefreshIcon({ spinning }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.8-4.2" />
      <path d="M5 3v4h4" />
      <path d="M4 13a8 8 0 0 0 14.8 4.2" />
      <path d="M19 21v-4h-4" />
    </svg>
  );
}

