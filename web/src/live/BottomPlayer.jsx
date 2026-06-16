import { usePlayer } from './player.jsx';

// The persistent bottom bar. Collapsed = a slim now-playing strip with controls;
// expanded = the video pops up above it. Stays mounted across tab/page changes.

export default function BottomPlayer() {
  const player = usePlayer();
  if (!player?.track) return null;
  const { track, mode, expanded, loading, switchMode, setExpanded, close } = player;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      {/* Expanded video */}
      {expanded && (
        <div className="mx-auto max-w-3xl px-3 pb-1">
          <div className="overflow-hidden rounded-t-xl border border-white/10 bg-black shadow-2xl">
            <iframe
              key={track.videoId}
              className="aspect-video w-full"
              src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1`}
              title={track.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Slim bar */}
      <div className="border-t border-white/10 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          {/* Hidden audio iframe keeps playback alive when collapsed. */}
          {!expanded && (
            <iframe
              key={track.videoId}
              className="h-10 w-16 shrink-0 rounded bg-black"
              src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1`}
              title={track.title}
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">
              {loading ? 'Loading…' : track.song}
            </p>
            <p className="truncate text-[11px] text-zinc-500">
              {track.artist} · {track.channel}
            </p>
          </div>

          {/* Music / Live source toggle */}
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

          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            title={expanded ? 'Collapse' : 'Show video'}
          >
            {expanded ? '▾' : '▴'}
          </button>
          <button onClick={close} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/10" title="Close player">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
