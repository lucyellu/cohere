import { useEffect, useState } from 'react';
import { liveYoutube, submitClip, voteClip } from './liveApi.js';

// Fan footage of THE ACTUAL EVENT — not old concerts:
//   • Fresh  — uploads in the last 24h (publishedAfter + order=date)
//   • Live   — active livestreams (eventType=live), the true real-time window
//   • Crowd  — viewers paste clips they find; everyone upvotes; top ones embed
//   • Social — deep-links into TikTok / Instagram hashtag + location searches
//
// (Only YouTube has a usable free search API; TikTok/IG are deep-links + the
//  crowd wall, which is honest about the platform limits.)

const TABS = [
  { id: 'fresh', label: '🆕 Fresh' },
  { id: 'live', label: '🔴 Live' },
  { id: 'crowd', label: '👥 Crowd wall' },
  { id: 'social', label: '📱 Social' },
];

export default function FanWall({ event, clips, onClipsChanged }) {
  const [tab, setTab] = useState('fresh');
  const [yt, setYt] = useState({ fresh: [], live: [], error: null, loading: true });

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

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">Fan footage · tonight</h3>
        <div className="inline-flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                tab === t.id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'fresh' && <VideoGrid items={yt.fresh} loading={yt.loading} error={yt.error} emptyLabel="No uploads in the last 24h yet — be the first, or check the Crowd wall." />}
      {tab === 'live' && <VideoGrid items={yt.live} loading={yt.loading} error={yt.error} emptyLabel="No active livestreams right now. The moment someone goes live from the venue, it shows here." />}
      {tab === 'crowd' && <CrowdWall event={event} clips={clips} onClipsChanged={onClipsChanged} />}
      {tab === 'social' && <SocialLinks event={event} />}
    </div>
  );
}

function VideoGrid({ items, loading, error, emptyLabel }) {
  if (loading) return <p className="py-6 text-center text-sm text-zinc-500">Searching YouTube…</p>;
  if (error === 'quota')
    return <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300/90">YouTube's daily search quota is used up (resets tomorrow). Try the Crowd wall or Social tabs.</p>;
  if (!items?.length) return <p className="py-6 text-center text-sm text-zinc-500">{emptyLabel}</p>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.slice(0, 6).map((v) => (
        <div key={v.id.videoId} className="overflow-hidden rounded-xl border border-white/10 bg-black">
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube.com/embed/${v.id.videoId}`}
            title={v.snippet.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <p className="truncate px-2 py-1.5 text-[11px] text-zinc-400" title={v.snippet.title}>
            {v.snippet.channelTitle}
          </p>
        </div>
      ))}
    </div>
  );
}

function CrowdWall({ event, clips, onClipsChanged }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true);
    await submitClip(event.id, url.trim());
    setUrl('');
    setBusy(false);
    onClipsChanged?.();
  }
  async function up(clipId) {
    await voteClip(event.id, clipId);
    onClipsChanged?.();
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Paste a clip URL you found (YouTube, TikTok, IG…)"
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-400/50"
        />
        <button onClick={add} disabled={busy} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? '…' : 'Add'}
        </button>
      </div>
      {!clips?.length ? (
        <p className="py-4 text-center text-sm text-zinc-500">No crowd clips yet. Drop the first one — the crowd builds the live feed together.</p>
      ) : (
        <ul className="space-y-2">
          {clips.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <button onClick={() => up(c.id)} className="flex flex-col items-center rounded-lg bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10">
                <span>▲</span>
                <span className="tabular-nums">{c.votes}</span>
              </button>
              <ClipEmbed clip={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClipEmbed({ clip }) {
  const ytId = ytIdFrom(clip.url);
  if (ytId) {
    return (
      <div className="flex-1 overflow-hidden rounded-lg border border-white/10 bg-black">
        <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${ytId}`} title={clip.title || 'clip'} allowFullScreen />
      </div>
    );
  }
  return (
    <a
      href={clip.url}
      target="_blank"
      rel="noreferrer"
      className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 hover:border-white/20"
    >
      <span>{platformIcon(clip.platform)}</span>
      <span className="truncate">{clip.title || clip.url}</span>
    </a>
  );
}

function SocialLinks({ event }) {
  const tag = `${event.artist}${event.city}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const artistTag = event.artist.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const links = [
    { label: 'TikTok', icon: '🎵', items: [
      { t: `#${tag}`, url: `https://www.tiktok.com/tag/${tag}` },
      { t: `#${artistTag}`, url: `https://www.tiktok.com/tag/${artistTag}` },
    ]},
    { label: 'Instagram', icon: '📸', items: [
      { t: `#${tag}`, url: `https://www.instagram.com/explore/tags/${tag}/` },
      { t: `${event.venue}`, url: `https://www.instagram.com/explore/locations/?q=${encodeURIComponent(event.venue)}` },
    ]},
    { label: 'X', icon: '𝕏', items: [
      { t: `${event.artist} ${event.city}`, url: `https://x.com/search?q=${encodeURIComponent(event.artist + ' ' + event.city)}&f=live` },
    ]},
  ];
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        TikTok &amp; Instagram don't offer a free search API, so these open the native app's hashtag &amp; location feeds — paste the best ones back into the Crowd wall.
      </p>
      {links.map((g) => (
        <div key={g.label}>
          <div className="mb-1 text-xs font-semibold text-zinc-300">{g.icon} {g.label}</div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((it) => (
              <a key={it.url} href={it.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 hover:border-indigo-400/40 hover:text-zinc-100">
                {it.t} →
              </a>
            ))}
          </div>
        </div>
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
