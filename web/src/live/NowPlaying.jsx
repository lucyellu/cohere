import { fmtCountdown, fmtDur, fmtClock } from './clock.js';
import { usePlayer } from './player.jsx';

// The heartbeat of the room: what the crowd is on RIGHT NOW. Renders pre-show
// countdown, the current song with a live progress bar, the between-songs
// transition, or the after-show state.

export default function NowPlaying({ np, event, syncedNow }) {
  if (!np || np.status === 'empty') {
    return <Shell sub="Setlist loading…">—</Shell>;
  }

  if (np.status === 'pre') {
    return (
      <Shell
        kicker="DOORS OPEN · SHOW STARTS IN"
        sub={`First up: ${np.nextSong}`}
        big={fmtCountdown(np.startsInSec)}
        tone="amber"
      />
    );
  }

  if (np.status === 'ended') {
    return <Shell kicker="ENCORE DONE" sub={`Last song: ${np.song}`} big="Show's over 🎆" tone="zinc" />;
  }

  if (np.phase === 'between') {
    return (
      <Shell
        kicker="BETWEEN SONGS"
        sub={np.nextSong ? `Next: ${np.nextSong} · in ${fmtCountdown(np.startsInSec)}` : 'Wrapping up…'}
        big="🎤 …"
        tone="indigo"
      />
    );
  }

  // Live, mid-song.
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-500/10 via-fuchsia-500/5 to-transparent p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-rose-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
        Now playing · song {np.index + 1} of {event.timeline.length}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h2 className="text-3xl font-bold leading-tight text-zinc-50">{np.song}</h2>
        <PlayButton artist={event.artist} song={np.song} />
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-fuchsia-400 transition-all duration-1000 ease-linear"
            style={{ width: `${Math.round(np.progress * 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-zinc-400">
          <span>{fmtDur(np.elapsedSec)}</span>
          <span>{fmtDur(np.durSec)}</span>
        </div>
      </div>

      {np.nextSong && (
        <p className="mt-3 text-sm text-zinc-400">
          Up next · <span className="text-zinc-200">{np.nextSong}</span>
        </p>
      )}
    </div>
  );
}

function PlayButton({ artist, song }) {
  const player = usePlayer();
  return (
    <button
      onClick={() => player?.playSong(artist, song)}
      className="mt-1 shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/20"
      title="Play this song in the bottom player"
    >
      ▶ Play
    </button>
  );
}

function Shell({ kicker, big, sub, tone = 'indigo', children }) {
  const tones = {
    amber: 'border-amber-400/30 from-amber-500/10',
    indigo: 'border-indigo-400/30 from-indigo-500/10',
    rose: 'border-rose-400/30 from-rose-500/10',
    zinc: 'border-white/10 from-white/5',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br to-transparent p-5 ${tones[tone]}`}>
      {kicker && <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{kicker}</div>}
      <div className="mt-2 text-3xl font-bold text-zinc-50">{big || children}</div>
      {sub && <p className="mt-2 text-sm text-zinc-400">{sub}</p>}
    </div>
  );
}
