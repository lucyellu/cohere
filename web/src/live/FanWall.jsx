import { useEffect, useMemo, useRef, useState } from 'react';
import { liveYoutube, submitClip, voteClip } from './liveApi.js';

// The crowd-sourced live feed of the actual event — ONE grid, every platform,
// each clip embedded inline with a SOURCE BADGE (YouTube / TikTok / IG / X):
//   • YouTube  — auto-pulled (the only platform with a free search API),
//                enriched with view counts + upload times
//   • TikTok / Instagram / X — embedded from URLs the crowd drops in (no free
//                search API exists for these, so they can't be auto-discovered,
//                but a pasted link embeds + plays inline like the rest)
// Controls: sort (recent / views / A–Z), platform filter, and a setlist-song
// selector so the feed maps onto individual songs.

const PLATFORMS = [
  { id: 'all', label: 'All' },
  { id: 'youtube', label: '▶️ YouTube' },
  { id: 'tiktok', label: '🎵 TikTok' },
  { id: 'instagram', label: '📸 Instagram' },
  { id: 'x', label: '𝕏 X' },
];
const SORTS = [
  { id: 'recent', label: 'Most recent' },
  { id: 'views', label: 'Most views' },
  { id: 'az', label: 'A–Z' },
];

export default function FanWall({ event, np, clips, onClipsChanged }) {
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('recent');
  const [scope, setScope] = useState('all'); // 'all' | songIndex
  const [yt, setYt] = useState({ items: [], error: null, loading: true });
  const cache = useRef({});

  const scopeSong = scope !== 'all' ? event.timeline[Number(scope)]?.song : null;
  const query = scopeSong ? `${event.artist} ${scopeSong} live` : `${event.artist} ${event.city}`;

  // YouTube auto-feed (per-song when a song is selected).
  useEffect(() => {
    let cancelled = false;
    if (cache.current[query]) {
      setYt({ ...cache.current[query], loading: false });
      return;
    }
    setYt((d) => ({ ...d, loading: true }));
    liveYoutube(query, { live: scope === 'all', hours: scopeSong ? 24 * 30 : 24 }).then((r) => {
      if (cancelled) return;
      const val = { items: r.items || [], error: r.error || null };
      cache.current[query] = val;
      setYt({ ...val, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Unified list: YouTube auto items + crowd-submitted clips, normalized.
  const items = useMemo(() => {
    const ytItems = (yt.items || []).map((v) => ({
      key: 'yt-' + v.videoId,
      source: 'youtube',
      embed: { type: 'youtube', id: v.videoId },
      title: v.title,
      channel: v.channel,
      views: v.views,
      ts: v.publishedAt ? Date.parse(v.publishedAt) : 0,
      live: v.live,
      song: scopeSong,
    }));
    const crowd = (clips || [])
      .filter((c) => scope === 'all' || String(c.songIndex) === String(scope))
      .map((c) => ({
        key: 'cw-' + c.id,
        source: c.platform || 'link',
        embed: embedFor(c.url),
        url: c.url,
        title: c.title || c.song || c.url,
        channel: 'crowd',
        votes: c.votes,
        ts: c.ts || 0,
        song: c.song,
        clipId: c.id,
      }));

    let list = [...crowd, ...ytItems];
    if (platform !== 'all') list = list.filter((i) => i.source === platform);

    if (sort === 'views') list.sort((a, b) => (b.views ?? b.votes ?? -1) - (a.views ?? a.votes ?? -1));
    else if (sort === 'az') list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    else list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    list.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0)); // livestreams first
    return list;
  }, [yt.items, clips, platform, sort, scope, scopeSong]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Crowd-sourced live feed</h3>
          <p className="text-[11px] text-zinc-500">
            {scopeSong ? <>Footage of <span className="text-fuchsia-300">“{scopeSong}”</span></> : 'Every platform, one feed'}
          </p>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-300 outline-none">
          {SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
      </div>

      {/* Platform filter */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => (
          <button key={p.id} onClick={() => setPlatform(p.id)} className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${platform === p.id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Map onto setlist */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setScope('all')} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${scope === 'all' ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>
          🎫 Whole show
        </button>
        {event.timeline.map((s) => (
          <button key={s.i} onClick={() => setScope(String(s.i))} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${String(scope) === String(s.i) ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`} title={s.song}>
            {s.i + 1}. {s.song.length > 16 ? s.song.slice(0, 15) + '…' : s.song}
          </button>
        ))}
      </div>

      {/* Add any clip (the only way to pull TikTok/IG/X in — no free search API) */}
      <PasteBar event={event} np={np} onClipsChanged={onClipsChanged} />

      {/* Unified embedded grid */}
      {yt.loading && !items.length ? (
        <p className="py-6 text-center text-sm text-zinc-500">Pulling footage…</p>
      ) : !items.length ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {platform !== 'all' && platform !== 'youtube'
            ? `No ${platform} clips yet — paste one above and it'll embed here with a badge.`
            : yt.error === 'quota'
              ? "YouTube's search quota is used up (resets tomorrow). Paste clips above to keep the feed going."
              : 'No footage yet for this ' + (scopeSong ? 'song.' : 'show.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 15).map((it) => (
            <FeedCard key={it.key} it={it} event={event} onVote={onClipsChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCard({ it, event, onVote }) {
  const e = it.embed;
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <SourceBadge source={it.source} live={it.live} />
      {e?.type === 'youtube' ? (
        <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${e.id}`} title={it.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : e ? (
        <iframe className={`w-full ${e.tall ? 'h-[460px]' : 'h-[280px]'}`} src={e.src} title={it.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen scrolling="no" />
      ) : (
        <a href={it.url} target="_blank" rel="noreferrer" className="flex aspect-video w-full flex-col items-center justify-center gap-1 bg-zinc-900 text-center hover:bg-zinc-800">
          <span className="text-3xl">{ICON[it.source] || '🔗'}</span>
          <span className="px-3 text-[11px] text-zinc-400">Open clip →</span>
        </a>
      )}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300" title={it.title}>
          {it.song ? <span className="text-fuchsia-300">{it.song} · </span> : null}
          {it.title}
        </span>
        {it.views != null && <span className="shrink-0 text-[10px] text-zinc-500">{fmtViews(it.views)} views</span>}
        {it.clipId && (
          <button onClick={() => voteClip(event.id, it.clipId).then(onVote)} className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10">
            ▲ {it.votes}
          </button>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source, live }) {
  const map = {
    youtube: { label: 'YouTube', cls: 'bg-red-600/90' },
    tiktok: { label: 'TikTok', cls: 'bg-black/90' },
    instagram: { label: 'Instagram', cls: 'bg-gradient-to-r from-fuchsia-600/90 to-amber-500/90' },
    x: { label: 'X', cls: 'bg-zinc-900/90' },
    link: { label: 'Link', cls: 'bg-zinc-700/90' },
  };
  const m = map[source] || map.link;
  return (
    <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white ${m.cls}`}>{ICON[source]} {m.label}</span>
      {live && <span className="rounded-md bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">🔴 LIVE</span>}
    </div>
  );
}

function PasteBar({ event, np, onClipsChanged }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const defaultIdx = np?.index != null && np.index >= 0 ? np.index : 0;
  const [songIdx, setSongIdx] = useState(defaultIdx);
  useEffect(() => setSongIdx(defaultIdx), [defaultIdx]);

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true);
    await submitClip(event.id, url.trim(), { songIndex: Number(songIdx) });
    setUrl('');
    setBusy(false);
    onClipsChanged?.();
  }
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="Add a TikTok / IG / X / YouTube clip → embeds here with its badge"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-400/50"
      />
      <select value={songIdx} onChange={(e) => setSongIdx(e.target.value)} className="max-w-[38%] rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs text-zinc-300 outline-none" title="Which song?">
        {event.timeline.map((s) => <option key={s.i} value={s.i}>{s.i + 1}. {s.song}</option>)}
      </select>
      <button onClick={add} disabled={busy} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '…' : 'Add'}</button>
    </div>
  );
}

// Inline embed players for a pasted URL (the platforms' own public endpoints).
function embedFor(url) {
  const u = String(url);
  if (ytIdFrom(u)) return { type: 'youtube', id: ytIdFrom(u) };
  const tt = u.match(/tiktok\.com\/.*\/video\/(\d+)/) || u.match(/tiktok\.com\/.*\/(\d{15,})/);
  if (tt) return { type: 'tiktok', src: `https://www.tiktok.com/player/v1/${tt[1]}`, tall: true };
  const ig = u.match(/instagram\.com\/(p|reel|tv|reels)\/([\w-]+)/);
  if (ig) return { type: 'instagram', src: `https://www.instagram.com/${ig[1] === 'reels' ? 'reel' : ig[1]}/${ig[2]}/embed`, tall: true };
  const tw = u.match(/(?:twitter|x)\.com\/.+\/status\/(\d+)/);
  if (tw) return { type: 'x', src: `https://twitframe.com/show?url=${encodeURIComponent(u)}`, tall: false };
  return null;
}
function ytIdFrom(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m?.[1] || null;
}
const ICON = { youtube: '▶️', tiktok: '🎵', instagram: '📸', x: '𝕏', link: '🔗' };
function fmtViews(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
