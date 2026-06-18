import { usePlayer } from './player.jsx';

// Persistent bottom bar. It stays as a regular music-style player instead of
// popping a large video over the app.

export default function BottomPlayer() {
  const player = usePlayer();
  if (!player?.track) return null;
  const { track, mode, loading, switchMode, close } = player;
  const hasVideo = Boolean(track.videoId);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="border-t border-white/10 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          {hasVideo ? (
            <iframe
              key={track.videoId}
              className="h-12 w-20 shrink-0 rounded bg-black"
              src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1`}
              title={track.title}
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          ) : (
            <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-black text-zinc-500">
              {loading ? <span className="animate-pulse">♪</span> : '—'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{track.song}</p>
            <p className="truncate text-[11px] text-zinc-500">
              {loading
                ? 'Finding a video…'
                : track.notFound
                  ? <a className="text-indigo-400 hover:underline" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.song} ${mode === 'live' ? 'live' : ''}`)}`} target="_blank" rel="noreferrer">No embeddable result — search YouTube →</a>
                  : `${track.artist} · ${track.channel}`}
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {['live', 'music'].map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${mode === m ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title={m === 'live' ? 'Live concert footage' : 'Studio / music video'}
              >
                {m === 'live' ? '🔴 Live' : '🎵 Music'}
              </button>
            ))}
          </div>

          {hasVideo && (
            <a
              href={`https://www.youtube.com/watch?v=${track.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              YouTube
            </a>
          )}
          <button onClick={close} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/10" title="Close player">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
