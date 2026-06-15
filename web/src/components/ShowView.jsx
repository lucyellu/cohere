import { useEffect, useRef, useState } from 'react';
import { youtubeSearch, getLyrics } from '../api.js';
import { fmtDate, fmtCapacity } from '../tour.js';

// The Show: relive one concert. Per setlist song we pull real fan clips
// (YouTube) as multi-angle footage + real lyrics (Musixmatch). Songs nobody
// filmed get the BYOC "synthesize" path (wired in the next phase).

export default function ShowView({ show, onBack }) {
  const [activeSong, setActiveSong] = useState(show?.setlist?.[0] || null);
  const [angle, setAngle] = useState(0);
  const [clips, setClips] = useState({}); // song -> [videos] | 'none'
  const [lyrics, setLyrics] = useState({}); // song -> text | 'none'
  const [loading, setLoading] = useState(false);
  const cache = useRef({ clips: {}, lyrics: {} });

  async function selectSong(song) {
    setActiveSong(song);
    setAngle(0);
    if (cache.current.clips[song] !== undefined) {
      setClips((c) => ({ ...c, [song]: cache.current.clips[song] }));
      setLyrics((l) => ({ ...l, [song]: cache.current.lyrics[song] }));
      return;
    }
    setLoading(true);
    const [yt, lyr] = await Promise.all([
      youtubeSearch(`${show.artist} ${song} ${show.venue} live`).catch(() => null),
      getLyrics(song, show.artist).catch(() => null),
    ]);
    const items = (yt?.data?.items || []).filter((i) => i?.id?.videoId);
    const clipVal = items.length ? items.slice(0, 4) : 'none';
    const body = yt && parseLyrics(lyr);
    cache.current.clips[song] = clipVal;
    cache.current.lyrics[song] = body || 'none';
    setClips((c) => ({ ...c, [song]: clipVal }));
    setLyrics((l) => ({ ...l, [song]: body || 'none' }));
    setLoading(false);
  }

  useEffect(() => {
    if (activeSong) selectSong(activeSong);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id]);

  if (!show) return null;
  const songClips = clips[activeSong];
  const hasFootage = Array.isArray(songClips) && songClips.length > 0;
  const current = hasFootage ? songClips[Math.min(angle, songClips.length - 1)] : null;

  return (
    <div>
      {/* Show header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
          ← Globe
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-zinc-100">{show.artist}</h2>
          <p className="text-sm text-zinc-500">
            {show.venue} · {[show.city, show.country].filter(Boolean).join(', ')} · {fmtDate(show.date)}
          </p>
        </div>
        <span className="ml-auto rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300">
          {fmtCapacity(show.capacity)} capacity
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Setlist */}
        <aside className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Setlist</h3>
          {show.setlist?.length ? (
            <ol className="space-y-1.5">
              {show.setlist.map((song, i) => {
                const c = clips[song];
                const state = c === undefined ? '' : c === 'none' ? 'gap' : 'footage';
                return (
                  <li key={i}>
                    <button
                      onClick={() => selectSong(song)}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        song === activeSong
                          ? 'border-indigo-400/50 bg-indigo-500/10 text-zinc-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <span className="w-5 text-xs tabular-nums text-zinc-600">{i + 1}</span>
                      <span className="flex-1 truncate">{song}</span>
                      {state === 'footage' && <span title="Crowd footage found">🎥</span>}
                      {state === 'gap' && <span title="No footage — synthesize">✨</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-zinc-600">
              No setlist for this stop. (Live JamBase Data omits setlists — the curated tour includes them.)
            </p>
          )}
        </aside>

        {/* Stage */}
        <main className="lg:col-span-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Finding footage…</div>
            ) : current ? (
              <iframe
                key={current.id.videoId}
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${current.id.videoId}`}
                title={current.snippet.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : songClips === 'none' ? (
              <GapPanel song={activeSong} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Select a song to begin.
              </div>
            )}
          </div>

          {/* Angle switcher (multi-angle crowd footage) */}
          {hasFootage && songClips.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {songClips.map((v, i) => (
                <button
                  key={v.id.videoId}
                  onClick={() => setAngle(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    i === angle ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                  title={v.snippet.title}
                >
                  Angle {i + 1} · {v.snippet.channelTitle.slice(0, 18)}
                </button>
              ))}
            </div>
          )}

          {/* Lyrics */}
          {activeSong && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-100">{activeSong} — lyrics</h4>
              {lyrics[activeSong] && lyrics[activeSong] !== 'none' ? (
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-400">
                  {lyrics[activeSong]}
                </pre>
              ) : (
                <p className="text-xs text-zinc-600">{loading ? 'Loading lyrics…' : 'Lyrics unavailable for this track.'}</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function GapPanel({ song }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-3xl">✨</div>
      <p className="text-sm text-zinc-300">No crowd footage found for "{song}".</p>
      <p className="max-w-sm text-xs text-zinc-600">
        This is where BYOC comes in — bring your own compute to synthesize the missing performance from the
        song's lyrics &amp; mood. (Generation wires up next.)
      </p>
      <button
        disabled
        className="cursor-not-allowed rounded-xl bg-indigo-500/40 px-4 py-2 text-sm font-semibold text-white/70"
      >
        Synthesize performance →
      </button>
    </div>
  );
}

// Pull lyric text out of a Musixmatch matcher.lyrics.get payload and strip the
// non-commercial tracking footer.
function parseLyrics(payload) {
  const body = payload?.data?.message?.body?.lyrics?.lyrics_body;
  if (!body) return null;
  return body.replace(/\*+.*?\*+/gs, '').replace(/\n{3,}/g, '\n\n').trim();
}
