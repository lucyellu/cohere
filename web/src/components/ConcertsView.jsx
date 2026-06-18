import { useEffect, useMemo, useState } from 'react';
import { fetchConcerts, sortConcerts, filterWhen, spotifyArtist, C_SORTS, defaultDir } from '../concerts.js';
import { fmtCapacity, fmtDate } from '../tour.js';

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

export default function ConcertsView({ onEnterShow, onSyncLive }) {
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState('');
  const [location, setLocation] = useState('');
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
  const [saved, setSaved] = useState(() => new Set(JSON.parse(localStorage.getItem('cohear_saved_shows') || '[]')));
  const [userZone, setUserZoneState] = useState(() => localStorage.getItem(USER_ZONE_KEY) || DETECTED_TIME_ZONE);
  const [now, setNow] = useState(() => Date.now());

  const browse = !artist;

  async function loadBrowse(win = windowKey) {
    setLoading(true);
    try {
      const out = await fetchConcerts('', 'live', win);
      setArtist('');
      setWindowKey(win);
      setConcerts(out.concerts);
      setSources(out.sources);
      setSortKey('capacity');
      setDir('desc');
      setWhen('all');
      setSelectedId(out.concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadArtist(name) {
    const clean = name.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const out = await fetchConcerts(clean, 'live');
      setArtist(clean);
      setConcerts(out.concerts);
      setSources(out.sources);
      setSortKey('date');
      setDir('desc');
      setWhen('all');
      setSelectedId(out.concerts[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrowse('week');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setSortKey(key);
    setDir(defaultDir(key));
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
      const haystack = [c.artist, c.venue, c.city, c.region, c.country].filter(Boolean).join(' ').toLowerCase();
      const locationText = [c.city, c.region, c.country, c.venue].filter(Boolean).join(' ').toLowerCase();
      return (!search || haystack.includes(search)) && (!loc || locationText.includes(loc));
    });
    return sortConcerts(filtered, sortKey, dir);
  }, [artist, browse, concerts, dir, location, query, sortKey, when]);

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
        loading={loading}
        onArtistSearch={() => loadArtist(query)}
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
            {mode === 'list' && <ConcertTable rows={visible} selectedId={selected?.id} onSelect={setSelectedId} saved={saved} userZone={userZone} now={now} />}
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
            <MetricBlock label="Shows" value={loading ? '...' : stats.count.toLocaleString()} />
            <MetricBlock label="Known seats" value={fmtCapacity(stats.totalCap)} />
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
    mode, setMode, sortKey, pickSort, dir, setDir, when, setWhen, loading, onArtistSearch,
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
      </div>
    </section>
  );
}

function ConcertTable({ rows, selectedId, onSelect, saved, userZone, now }) {
  return (
    <div className="cohear-panel overflow-hidden">
      <div className="grid grid-cols-[56px_minmax(190px,1.15fr)_minmax(180px,1fr)_130px_190px_90px] border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 max-lg:hidden">
        <span>Rank</span>
        <span>Artist</span>
        <span>Venue</span>
        <span>City</span>
        <span>Time</span>
        <span className="text-right">Seats</span>
      </div>
      <ol className="max-h-[660px] overflow-y-auto">
        {rows.map((c, i) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`grid w-full gap-3 border-b border-white/[0.06] px-4 py-4 text-left transition last:border-b-0 lg:grid-cols-[56px_minmax(190px,1.15fr)_minmax(180px,1fr)_130px_190px_90px] lg:items-center ${
                c.id === selectedId ? 'bg-cyan-300/[0.08]' : 'hover:bg-white/[0.035]'
              }`}
            >
              <span className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
                <span className="w-7 tabular-nums text-zinc-500">{String(i + 1).padStart(2, '0')}</span>
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
          </li>
        ))}
      </ol>
    </div>
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
            <button className="cohear-icon-button" onClick={onSave} title={saved ? 'Remove saved concert' : 'Save concert'}>
              <BookmarkIcon filled={saved} />
            </button>
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
          {onSyncLive && (
            <button className="cohear-primary w-full justify-center" onClick={sync} disabled={syncing}>
              {syncing ? 'Opening live room...' : 'Join live room'}
            </button>
          )}
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
  const mappable = rows.filter((c) => c.lat != null && c.lng != null);
  return (
    <div className="cohear-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Concert map</h3>
          <p className="mt-1 text-xs text-zinc-500">Dot size follows known attendance capacity.</p>
        </div>
        <span className="text-xs text-zinc-500">{mappable.length} mapped</span>
      </div>
      <div className="relative h-[620px] overflow-hidden bg-[linear-gradient(135deg,#0a0d12,#111827_45%,#07110f)]">
        <div className="absolute inset-6 rounded-lg border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.08),transparent_20%),radial-gradient(circle_at_70%_45%,rgba(245,158,11,.09),transparent_24%)]" />
        {mappable.map((c) => {
          const x = ((Number(c.lng) + 180) / 360) * 100;
          const y = ((90 - Number(c.lat)) / 180) * 100;
          const size = Math.max(8, Math.min(30, Math.sqrt(c.capacity || 3000) / 18));
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition hover:scale-125 ${
                c.id === selectedId ? 'border-white bg-cyan-300 shadow-[0_0_24px_rgba(34,211,238,.45)]' : 'border-amber-100/70 bg-amber-300/80'
              }`}
              style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
              title={`${c.artist} at ${c.venue}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConcertCalendar({ rows, selectedId, onSelect }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of rows) {
      const key = c.date || 'Unknown date';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="cohear-panel overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Calendar</h3>
        <p className="mt-1 text-xs text-zinc-500">Grouped by show date, biggest shows listed first within each day.</p>
      </div>
      <div className="max-h-[660px] divide-y divide-white/[0.06] overflow-y-auto">
        {grouped.map(([date, shows]) => (
          <section key={date} className="grid gap-3 p-4 md:grid-cols-[120px_1fr]">
            <div className="text-sm font-semibold text-zinc-300">{fmtDate(date)}</div>
            <div className="grid gap-2">
              {shows.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`grid gap-2 rounded-lg border p-3 text-left transition md:grid-cols-[1fr_auto] ${
                    c.id === selectedId ? 'border-cyan-300/40 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{c.artist}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">{c.venue} · {c.city}</span>
                  </span>
                  <span className="text-sm font-semibold text-amber-200">{fmtCapacity(c.capacity)}</span>
                </button>
              ))}
            </div>
          </section>
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

function MetricBlock({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
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
      <span className={`block truncate font-semibold ${cd.tone === 'rose' ? 'text-rose-200' : cd.tone === 'amber' ? 'text-amber-200' : 'text-zinc-500'}`}>
        {cd.text}
      </span>
    </span>
  );
}

function metricTone(tone) {
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
  if (diff > 0) return { text: `Starts in ${durationShort(diff)}`, tone: diff < 6 * 3600_000 ? 'rose' : 'amber' };
  if (diff > -4 * 3600_000) return { text: `Started ${durationShort(Math.abs(diff))} ago`, tone: 'rose' };
  return { text: concert.when === 'past' ? 'Past show' : 'Started earlier', tone: 'zinc' };
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
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(concert.date);
  if (!m) return null;
  return zonedToUtc(venueTimeZone(concert), Number(m[1]), Number(m[2]), Number(m[3]), 20, 0);
}

function venueTimeZone(concert) {
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
  if (/sweden/.test(country)) return 'Europe/Stockholm';
  if (/japan/.test(country)) return 'Asia/Tokyo';
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
