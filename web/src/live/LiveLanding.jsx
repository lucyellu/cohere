import { useEffect, useMemo, useState } from 'react';
import { fetchConcerts } from '../concerts.js';
import { liveYoutube, resolveEvent, socialSearch } from './liveApi.js';

export default function LiveLanding({ onJoin }) {
  const [tonight, setTonight] = useState([]);
  const [week, setWeek] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [spotlightId, setSpotlightId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchConcerts('', 'live', 'tonight'),
      fetchConcerts('', 'live', 'week'),
      fetchConcerts('', 'live', 'past'),
    ]).then(([t, w, p]) => {
      if (!alive) return;
      setTonight(t.concerts || []);
      setWeek(w.concerts || []);
      setPast(p.concerts || []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const tonightBest = useMemo(() => pickBestTonight(tonight, week), [tonight, week]);
  const recentBest = useMemo(() => pickRecentReplay(past), [past]);
  const candidates = useMemo(() => uniqueCandidates([...tonight, ...week, ...past]), [tonight, week, past]);
  const matches = useMemo(() => fuzzyMatches(query, candidates).slice(0, 6), [query, candidates]);
  const spotlight = useMemo(() => {
    const all = [tonightBest, recentBest, ...candidates].filter(Boolean);
    return all.find((c) => c.id === spotlightId) || tonightBest || recentBest || null;
  }, [candidates, recentBest, spotlightId, tonightBest]);

  async function join(concert) {
    if (!concert) return;
    setBusyId(concert.id);
    setErr(null);
    const ev = await resolveEvent({
      artist: concert.artist,
      date: concert.date,
      startDate: concert.startDate,
      venue: concert.venue,
      city: concert.city,
      country: concert.country,
      lat: concert.lat,
      lng: concert.lng,
      tz: concert.timeZone,
      mode: concert.when === 'past' ? 'replay' : 'live',
    });
    setBusyId(null);
    if (ev) onJoin(ev);
    else setErr(`Could not build a room for ${concert.artist}. Try another result or open it from Discover.`);
  }

  const [customArtist, setCustomArtist] = useState('');
  const [customVenue, setCustomVenue] = useState('My House');

  async function joinCustom() {
    if (!customArtist.trim()) return;
    setBusyId('custom');
    setErr(null);
    const customConcert = {
      artist: customArtist,
      venue: customVenue || 'Unknown',
      city: 'Local',
      country: 'Host',
      when: 'live'
    };
    await join(customConcert);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4">
        <div className="cohear-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="cohear-label text-[var(--lcd-glow)]">Custom Room</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Start your own session</h2>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Artist / DJ Name</label>
              <input
                value={customArtist}
                onChange={(e) => setCustomArtist(e.target.value)}
                placeholder="e.g. DJ User"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Venue</label>
              <input
                value={customVenue}
                onChange={(e) => setCustomVenue(e.target.value)}
                placeholder="e.g. My House"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none"
              />
            </div>
            <button 
              className="mt-4 sm:mt-0 cohear-primary"
              disabled={busyId === 'custom' || !customArtist.trim()} 
              onClick={joinCustom}
            >
              {busyId === 'custom' ? 'Creating...' : 'Start Room'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Find a room</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Fuzzy search across tonight, this week, and recent replays.</p>
            </div>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-500">{candidates.length} candidates</span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try Hary Stles, Wembley, London..."
            className="mt-4 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-300/50"
          />
          <div className="mt-3 grid gap-2">
            {(query.trim() ? matches : [tonightBest, recentBest, ...candidates].filter(Boolean).slice(0, 5)).map((c) => (
              <button
                key={`${c.id}-match`}
                className={`rounded-lg border p-3 text-left transition ${spotlight?.id === c.id ? 'border-cyan-300/40 bg-cyan-300/[0.08]' : 'border-white/10 bg-black/20 hover:border-white/20'}`}
                onClick={() => setSpotlightId(c.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{c.artist}</span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">{c.venue} · {[c.city, c.country].filter(Boolean).join(', ')}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-amber-200">{fmtCapacity(c.capacity)}</span>
                </div>
              </button>
            ))}
            {query.trim() && !matches.length && (
              <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-500">No close match in the live-room pool. Discover still has the full concert search.</p>
            )}
          </div>
          {spotlight && (
            <button className="cohear-primary mt-4 w-full justify-center" disabled={busyId === spotlight.id} onClick={() => join(spotlight)}>
              {busyId === spotlight.id ? 'Opening...' : spotlight.when === 'past' ? 'Open replay room' : 'Join live room'}
            </button>
          )}
          {err && <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">{err}</p>}
        </div>

        <MediaGrid concert={spotlight} />
      </section>
    </div>
  );
}



function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function MediaGrid({ concert }) {
  const [platform, setPlatform] = useState('all');
  const [columns, setColumns] = useState(4);
  const [refreshKey, setRefreshKey] = useState(0);
  const [feed, setFeed] = useState({ loading: false, items: [], error: null });
  const q = concert ? `${concert.artist} ${concert.city || concert.venue} concert` : '';

  useEffect(() => {
    let alive = true;
    if (!concert) return;
    setFeed({ loading: true, items: [], error: null });
    Promise.all([
      liveYoutube(q, { live: concert.when !== 'past', hours: concert.when === 'past' ? 24 * 14 : 48 }),
      socialSearch({ q, artist: concert.artist }),
    ]).then(([yt, social]) => {
      if (!alive) return;
      const ytItems = (yt.items || []).map((v) => ({
        key: `yt-${v.videoId}`,
        source: 'youtube',
        embed: { type: 'youtube', id: v.videoId },
        title: v.title,
        channel: v.channel,
        views: v.views,
        ts: v.publishedAt ? Date.parse(v.publishedAt) : 0,
        live: v.live,
      }));
      const socialItems = (social || []).map((s) => ({
        key: `${s.source}-${s.url}`,
        source: s.source,
        embed: embedFor(s.url),
        url: s.url,
        title: s.title || s.url,
        channel: s.author ? `@${s.author}` : '',
        views: s.views,
        ts: s.ts || 0,
      }));
      const items = [...ytItems, ...socialItems].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || (b.views || 0) - (a.views || 0) || (b.ts || 0) - (a.ts || 0));
      setFeed({ loading: false, items, error: yt.error || null });
    });
    return () => {
      alive = false;
    };
  }, [concert?.id, q, refreshKey]);

  const visible = feed.items.filter((i) => platform === 'all' || i.source === platform).slice(0, 8);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Latest crowd media</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{concert ? `${concert.artist} · ${concert.city || concert.venue}` : 'Pick a room to load media.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap gap-1">
            {['all', 'youtube', 'tiktok', 'instagram', 'x'].map((p) => (
              <button key={p} className={`rounded-md px-2 py-1 text-[11px] font-medium ${platform === p ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`} onClick={() => setPlatform(p)}>
                {p === 'all' ? 'All' : p === 'x' ? 'X/Twitter' : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-400">
            Per row
            <input type="range" min="1" max="12" value={columns} onChange={(e) => setColumns(Number(e.target.value))} className="w-20 accent-cyan-300" />
            <span className="w-4 text-right text-zinc-200">{columns}</span>
          </label>
          <button className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10" onClick={() => setRefreshKey((n) => n + 1)} disabled={!concert || feed.loading}>
            {feed.loading ? 'Refreshing...' : 'Refresh media'}
          </button>
        </div>
      </div>
      {feed.loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">Pulling YouTube, TikTok, Instagram, and X...</p>
      ) : !visible.length ? (
        <p className="py-12 text-center text-sm text-zinc-500">{feed.error === 'quota' ? 'YouTube quota is exhausted. Social search may still fill in when RapidAPI is available.' : 'No fresh media found yet for this spotlight.'}</p>
      ) : (
        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {visible.map((item) => <MediaCard key={item.key} item={item} />)}
        </div>
      )}
    </div>
  );
}

function MediaCard({ item }) {
  const e = item.embed;
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <div className="relative">
        <span className="absolute left-2 top-2 z-10 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">{labelFor(item.source)}{item.live ? ' LIVE' : ''}</span>
        {e?.type === 'youtube' ? (
          <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${e.id}`} title={item.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        ) : e ? (
          <iframe className={`w-full ${e.tall ? 'h-[420px]' : 'h-[260px]'}`} src={e.src} title={item.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen scrolling="no" />
        ) : (
          <a href={item.url} target="_blank" rel="noreferrer" className="flex aspect-video flex-col justify-between bg-zinc-900 p-3 hover:bg-zinc-800">
            <span className="line-clamp-4 text-xs leading-5 text-zinc-200">{item.title}</span>
            <span className="text-[11px] text-cyan-200">Open on {labelFor(item.source)}</span>
          </a>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 truncate text-xs text-zinc-300" title={item.title}>{item.title}</span>
        {item.views != null && <span className="shrink-0 text-[11px] text-zinc-500">{fmtViews(item.views)}</span>}
      </div>
    </div>
  );
}

function pickBestTonight(tonight, week) {
  const pool = tonight.length ? tonight : week.filter((c) => c.when !== 'past').slice(0, 12);
  return [...pool].sort((a, b) => (b.capacity || b.popularity || 0) - (a.capacity || a.popularity || 0))[0] || null;
}

function pickRecentReplay(past) {
  return [...past]
    .filter((c) => c.when === 'past')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.songCount || b.capacity || 0) - (a.songCount || a.capacity || 0))[0] || null;
}

function uniqueCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c?.artist || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.slice(0, 160);
}

function fuzzyMatches(q, list) {
  const needle = norm(q);
  if (needle.length < 2) return [];
  return list
    .map((c) => ({ c, score: fuzzyScore(needle, `${c.artist} ${c.city} ${c.venue}`) + fuzzyScore(needle, c.artist) * 1.8 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.c.capacity || 0) - (a.c.capacity || 0))
    .map((x) => x.c);
}

function fuzzyScore(needle, haystack) {
  const hay = norm(haystack);
  if (!hay) return 0;
  if (hay.includes(needle)) return 100 + needle.length;
  const words = hay.split(' ');
  const closeWord = Math.max(0, ...words.map((w) => 18 - levenshtein(needle, w) * 4));
  const dist = levenshtein(needle, hay.slice(0, Math.max(needle.length, Math.min(hay.length, needle.length + 8))));
  const typo = Math.max(0, 40 - dist * 5);
  const seq = isSubsequence(needle, hay) ? 18 : 0;
  return Math.max(closeWord, typo, seq);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function isSubsequence(a, b) {
  let i = 0;
  for (const ch of b) if (ch === a[i]) i++;
  return i === a.length;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function fmtCapacity(n) {
  return n ? Intl.NumberFormat().format(n) : 'Capacity TBA';
}

function fmtViews(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function labelFor(source) {
  return { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', x: 'X/Twitter' }[source] || 'Link';
}

function formatVenueTime(concert) {
  return formatShowTime(concert, concert.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, concert.city || 'Venue');
}

function formatUserTime(concert) {
  return formatShowTime(concert, Intl.DateTimeFormat().resolvedOptions().timeZone, 'You');
}

function formatShowTime(concert, zone, label) {
  const ms = showStartMs(concert);
  if (!ms) return 'Time TBA';
  const date = new Intl.DateTimeFormat(undefined, { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  return `${date} (${label})`;
}

function showStartMs(concert) {
  const raw = concert?.startDate || '';
  if (raw.includes('T')) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
    if (m) return zonedToUtc(concert.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(concert?.date || '');
  if (!m) return null;
  return zonedToUtc(concert.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, Number(m[1]), Number(m[2]), Number(m[3]), 21, 0);
}

function tzOffsetMs(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour % 24), +parts.minute, +parts.second);
  return asIfUtc - utcMs;
}

function zonedToUtc(tz, y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - tzOffsetMs(tz, guess);
}

function embedFor(url) {
  const u = String(url || '');
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return { type: 'youtube', id: yt[1] };
  const tt = u.match(/tiktok\.com\/.*\/video\/(\d+)/) || u.match(/tiktok\.com\/.*\/(\d{15,})/);
  if (tt) return { type: 'tiktok', src: `https://www.tiktok.com/player/v1/${tt[1]}`, tall: true };
  const ig = u.match(/instagram\.com\/(p|reel|tv|reels)\/([\w-]+)/);
  if (ig) return { type: 'instagram', src: `https://www.instagram.com/${ig[1] === 'reels' ? 'reel' : ig[1]}/${ig[2]}/embed`, tall: true };
  return null;
}
