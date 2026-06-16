import { useEffect, useMemo, useState } from 'react';
import { liveYoutube, submitClip, voteClip } from './liveApi.js';

// One aggregated, crowd-sourced LIVE FEED of the actual event — every source in
// a single grid:
//   • YouTube  — fresh uploads (last 24h) + active livestreams, fetched live
//   • Crowd    — clips fans paste from ANY platform (YT/TikTok/IG/X), upvoted,
//                each tagged to the setlist song it captured (its live timecode)
//   • Social   — deep-link search buttons into TikTok/IG/X (no free search API,
//                so we open their native hashtag/location feeds — honest)
//
// Why not auto-pull TikTok/IG/X? None offer a free search API. YouTube is the
// only one we can query; the crowd wall + deep-links cover the rest.

export default function FanWall({ event, clips, np, onClipsChanged }) {
  const [yt, setYt] = useState({ fresh: [], live: [], error: null, loading: true });
  const [songFilter, setSongFilter] = useState('all'); // 'all' | songIndex

  const q = `${event.artist} ${event.city}`.trim();

  useEffect(() => {
    let cancelled = false;
    setYt((s) => ({ ...s, loading: true }));
    liveYoutube(q, { live: true }).then((r) => {
      if (!cancelled) setYt({ fresh: r.fresh || [], live: r.live || [], error: r.error || null, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  // Build one unified, deduped item list: livestreams → crowd clips → fresh.
  const items = useMemo(() => {
    const out = [];
    for (const v of yt.live) out.push({ kind: 'yt', videoId: v.id.videoId, title: v.snippet.title, channel: v.snippet.channelTitle, live: true });
    for (const c of clips || []) out.push({ kind: 'crowd', ...c });
    for (const v of yt.fresh) out.push({ kind: 'yt', videoId: v.id.videoId, title: v.snippet.title, channel: v.snippet.channelTitle });
    // de-dupe YouTube ids that also appear as crowd clips
    const seen = new Set();
    return out.filter((it) => {
      const id = it.videoId || it.url;
      if (seen.has(id)) return false;
      seen.add(id);
      if (songFilter !== 'all' && it.kind === 'crowd' && String(it.songIndex) !== String(songFilter)) return false;
      if (songFilter !== 'all' && it.kind === 'yt') return false; // YT clips aren't song-tagged
      return true;
    });
  }, [yt, clips, songFilter]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Crowd-sourced live feed</h3>
          <p className="text-[11px] text-zinc-500">Fans’ footage of tonight — YouTube + anything the crowd drops in.</p>
        </div>
        <SocialSearch event={event} />
      </div>

      {/* Submit + song filter */}
      <SubmitBar event={event} np={np} onClipsChanged={onClipsChanged} />
      <SongFilter event={event} value={songFilter} onChange={setSongFilter} clips={clips} />

      {/* Aggregated grid */}
      {yt.loading && !items.length ? (
        <p className="py-6 text-center text-sm text-zinc-500">Pulling fresh footage…</p>
      ) : !items.length ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {yt.error === 'quota'
            ? "YouTube's search quota is used up (resets tomorrow) — drop clips into the crowd wall above."
            : 'No footage yet. Be the first — paste a clip you find, or open a social search above.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 12).map((it, i) => (
            <FeedCard key={(it.videoId || it.url) + i} it={it} event={event} onVote={onClipsChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCard({ it, event, onVote }) {
  const ytId = it.kind === 'yt' ? it.videoId : ytIdFrom(it.url);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {ytId ? (
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube.com/embed/${ytId}`}
          title={it.title || 'clip'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <a href={it.url} target="_blank" rel="noreferrer" className="flex aspect-video w-full flex-col items-center justify-center gap-1 bg-zinc-900 text-center hover:bg-zinc-800">
          <span className="text-3xl">{platformIcon(it.platform)}</span>
          <span className="px-3 text-[11px] text-zinc-400">Open on {it.platform} →</span>
        </a>
      )}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-[11px]">{it.live ? '🔴' : platformIcon(it.kind === 'yt' ? 'youtube' : it.platform)}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400" title={it.title}>
          {it.song ? <span className="text-fuchsia-300">{it.song} · </span> : null}
          {it.channel || it.title || it.url}
        </span>
        {it.kind === 'crowd' && (
          <button onClick={() => voteClip(event.id, it.id).then(onVote)} className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10">
            ▲ {it.votes}
          </button>
        )}
      </div>
    </div>
  );
}

function SubmitBar({ event, np, onClipsChanged }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  // Default the tag to the song currently playing (its live timecode).
  const defaultIdx = np?.index != null && np.index >= 0 ? np.index : 0;
  const [songIdx, setSongIdx] = useState(defaultIdx);

  useEffect(() => {
    setSongIdx(defaultIdx);
  }, [defaultIdx]);

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true);
    await submitClip(event.id, url.trim(), { songIndex: Number(songIdx) });
    setUrl('');
    setBusy(false);
    onClipsChanged?.();
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="Paste a clip you found (YouTube / TikTok / IG / X)…"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-400/50"
      />
      <select
        value={songIdx}
        onChange={(e) => setSongIdx(e.target.value)}
        className="max-w-[40%] rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs text-zinc-300 outline-none"
        title="Which song does this clip show?"
      >
        {event.timeline.map((s) => (
          <option key={s.i} value={s.i}>
            {s.i + 1}. {s.song}
          </option>
        ))}
      </select>
      <button onClick={add} disabled={busy} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? '…' : 'Add'}
      </button>
    </div>
  );
}

function SongFilter({ event, value, onChange, clips }) {
  const tagged = new Set((clips || []).filter((c) => c.songIndex != null).map((c) => c.songIndex));
  if (!tagged.size) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-zinc-500">Filter by song:</span>
      <button onClick={() => onChange('all')} className={`rounded-md px-2 py-0.5 ${value === 'all' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400'}`}>
        All
      </button>
      {event.timeline.filter((s) => tagged.has(s.i)).map((s) => (
        <button key={s.i} onClick={() => onChange(String(s.i))} className={`rounded-md px-2 py-0.5 ${String(value) === String(s.i) ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400'}`}>
          {s.song}
        </button>
      ))}
    </div>
  );
}

function SocialSearch({ event }) {
  const tag = `${event.artist}${event.city}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const kw = encodeURIComponent(`${event.artist} ${event.city}`);
  const links = [
    { label: 'TikTok', url: `https://www.tiktok.com/tag/${tag}` },
    { label: 'Instagram', url: `https://www.instagram.com/explore/tags/${tag}/` },
    { label: 'X', url: `https://x.com/search?q=${kw}&f=live` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${kw}&sp=CAI%253D` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-zinc-500">search fans on</span>
      {links.map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 hover:border-indigo-400/40 hover:text-zinc-100">
          {l.label} →
        </a>
      ))}
    </div>
  );
}

function ytIdFrom(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m?.[1] || null;
}
function platformIcon(p) {
  return { youtube: '▶️', tiktok: '🎵', instagram: '📸', x: '𝕏' }[p] || '🔗';
}
