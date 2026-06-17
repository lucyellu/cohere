import { useEffect, useMemo, useRef, useState } from 'react';
import { liveYoutube } from './liveApi.js';

// The crowd-sourced live feed of the actual event. Fan footage is pulled from
// YouTube (the only platform with a free search API), enriched with view counts
// + upload times, and can be:
//   • mapped onto the SETLIST — pick a song to see footage of just that song
//   • sorted — most recent / most views / A–Z
//   • filtered by platform — All / YouTube / TikTok / IG / X (TikTok/IG/X have
//     no free search API, so those open the platform's own search — honest)

const PLATFORMS = [
  { id: 'all', label: 'All' },
  { id: 'youtube', label: '▶️ YouTube' },
  { id: 'tiktok', label: '🎵 TikTok' },
  { id: 'instagram', label: '📸 Instagram' },
  { id: 'x', label: '𝕏' },
];
const SORTS = [
  { id: 'recent', label: 'Most recent' },
  { id: 'views', label: 'Most views' },
  { id: 'az', label: 'A–Z' },
];

export default function FanWall({ event, np }) {
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('recent');
  const [scope, setScope] = useState('all'); // 'all' | songIndex (maps to a song)
  const [data, setData] = useState({ items: [], error: null, loading: true });
  const cache = useRef({});

  // Query is event-wide for "all", or song-specific when a song is selected.
  const scopeSong = scope !== 'all' ? event.timeline[Number(scope)]?.song : null;
  const query = scopeSong ? `${event.artist} ${scopeSong} live` : `${event.artist} ${event.city}`;

  useEffect(() => {
    let cancelled = false;
    if (cache.current[query]) {
      setData({ ...cache.current[query], loading: false });
      return;
    }
    setData((d) => ({ ...d, loading: true }));
    liveYoutube(query, { live: scope === 'all', hours: scopeSong ? 24 * 30 : 24 }).then((r) => {
      if (cancelled) return;
      const val = { items: r.items || [], error: r.error || null };
      cache.current[query] = val;
      setData({ ...val, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const items = useMemo(() => {
    const list = [...(data.items || [])];
    if (sort === 'views') list.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    else if (sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')); // recent
    // livestreams always float to the top
    list.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
    return list;
  }, [data.items, sort]);

  const showYouTube = platform === 'all' || platform === 'youtube';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Crowd-sourced live feed</h3>
          <p className="text-[11px] text-zinc-500">
            {scopeSong ? <>Footage of <span className="text-fuchsia-300">“{scopeSong}”</span></> : 'Fans’ footage of tonight'} · auto from YouTube
          </p>
        </div>
        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-300 outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>Sort: {s.label}</option>
          ))}
        </select>
      </div>

      {/* Platform filter */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${platform === p.id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Map onto setlist: pick a song */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setScope('all')}
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${scope === 'all' ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
        >
          🎫 Whole show
        </button>
        {event.timeline.map((s) => (
          <button
            key={s.i}
            onClick={() => setScope(String(s.i))}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${String(scope) === String(s.i) ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
            title={s.song}
          >
            {s.i + 1}. {s.song.length > 18 ? s.song.slice(0, 17) + '…' : s.song}
          </button>
        ))}
      </div>

      {/* Body */}
      {!showYouTube ? (
        <SocialSearchPanel platform={platform} query={query} scopeSong={scopeSong} event={event} />
      ) : data.loading ? (
        <p className="py-6 text-center text-sm text-zinc-500">Pulling footage…</p>
      ) : data.error === 'quota' ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300/90">YouTube's daily search quota is used up (resets tomorrow). Try the TikTok/IG/X tabs to search those.</p>
      ) : !items.length ? (
        <p className="py-6 text-center text-sm text-zinc-500">No footage found yet for this {scopeSong ? 'song' : 'show'}.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 12).map((it) => (
            <VideoCard key={it.videoId} it={it} />
          ))}
        </div>
      )}

      {platform === 'all' && <SocialRow query={query} />}
    </div>
  );
}

function VideoCard({ it }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube.com/embed/${it.videoId}`}
        title={it.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] text-zinc-300" title={it.title}>
          {it.live && <span className="mr-1 text-rose-400">🔴 LIVE</span>}
          {it.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="truncate">{it.channel}</span>
          {it.views != null && <span className="shrink-0">· {fmtViews(it.views)} views</span>}
          {it.publishedAt && <span className="shrink-0">· {ago(it.publishedAt)}</span>}
        </p>
      </div>
    </div>
  );
}

function SocialSearchPanel({ platform, query, scopeSong, event }) {
  const url = platformSearchUrl(platform, query, event);
  const name = { tiktok: 'TikTok', instagram: 'Instagram', x: 'X' }[platform];
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-8 text-center">
      <span className="text-3xl">{platformIcon(platform)}</span>
      <p className="max-w-sm text-xs text-zinc-400">
        {name} has no free search API, so footage can't be auto-pulled here. Open {name}'s own search for
        {scopeSong ? <> “{scopeSong}”</> : <> this show</>}:
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
        Search {name} →
      </a>
    </div>
  );
}

function SocialRow({ query }) {
  const kw = encodeURIComponent(query);
  const tag = query.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const links = [
    { label: '🎵 TikTok', url: `https://www.tiktok.com/tag/${tag}` },
    { label: '📸 Instagram', url: `https://www.instagram.com/explore/tags/${tag}/` },
    { label: '𝕏', url: `https://x.com/search?q=${kw}&f=live` },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
      <span className="text-[10px] text-zinc-500">more from fans on</span>
      {links.map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 hover:border-indigo-400/40 hover:text-zinc-100">
          {l.label} →
        </a>
      ))}
    </div>
  );
}

function platformSearchUrl(platform, query, event) {
  const kw = encodeURIComponent(query);
  const tag = query.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (platform === 'tiktok') return `https://www.tiktok.com/search?q=${kw}`;
  if (platform === 'instagram') return `https://www.instagram.com/explore/tags/${tag}/`;
  if (platform === 'x') return `https://x.com/search?q=${kw}&f=live`;
  return `https://www.youtube.com/results?search_query=${kw}`;
}
function platformIcon(p) {
  return { youtube: '▶️', tiktok: '🎵', instagram: '📸', x: '𝕏' }[p] || '🔗';
}
function fmtViews(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
