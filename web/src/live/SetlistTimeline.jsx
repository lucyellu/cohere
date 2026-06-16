import { useEffect, useRef } from 'react';
import { fmtClock } from './clock.js';

// The synced setlist: played songs dim, the current song glows, upcoming songs
// show their predicted local start time. Auto-scrolls to keep "now" in view.
// Tapping a song = "they just started this" (crowd beacon) when you're at the show.

export default function SetlistTimeline({ event, np, onBeacon, beaconMode }) {
  const tl = event?.timeline || [];
  const correction = event?.correctionMs || 0;
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [np?.index]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Setlist {event.songsSource === 'fallback' ? '(typical)' : '· via setlist.fm'}
        </h3>
        {beaconMode && <span className="text-[10px] text-rose-300">tap the song they just started ↓</span>}
      </div>
      <ol className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {tl.map((slot) => {
          const isCurrent = np?.index === slot.i && np?.status === 'live' && np?.phase === 'song';
          const isPast = np?.index != null && slot.i < np.index;
          const startMs = slot.startMs + correction;
          return (
            <li key={slot.i} ref={isCurrent ? activeRef : null}>
              <button
                disabled={!beaconMode}
                onClick={() => beaconMode && onBeacon(slot.i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  isCurrent
                    ? 'border-rose-400/50 bg-rose-500/15 text-zinc-50'
                    : isPast
                      ? 'border-transparent bg-white/[0.02] text-zinc-600'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300'
                } ${beaconMode ? 'cursor-pointer hover:border-rose-400/60' : ''}`}
              >
                <span className="w-5 text-xs tabular-nums text-zinc-600">{slot.i + 1}</span>
                <span className="flex-1 truncate">{slot.song}</span>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                    NOW
                  </span>
                ) : (
                  <span className="text-[10px] tabular-nums text-zinc-600">{fmtClock(startMs, event.tz)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
