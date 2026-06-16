import { useEffect, useRef, useState, useMemo } from 'react';
import { fmtClock } from './clock.js';
import { usePlayer } from './player.jsx';

// The synced setlist: played songs dim, the current song glows, upcoming songs
// show their predicted start time in BOTH the venue's timezone and yours (toggle
// Venue / You / Both). Each song shows how many crowd clips are tagged to it.
// Click a song to play it in the bottom player; in "I'm here" mode, a tap sends
// the crowd beacon instead.

export default function SetlistTimeline({ event, np, onBeacon, beaconMode }) {
  const tl = event?.timeline || [];
  const correction = event?.correctionMs || 0;
  const activeRef = useRef(null);
  const player = usePlayer();
  const [tzView, setTzView] = useState('both'); // 'venue' | 'you' | 'both'

  // crowd clips tagged to each song -> count
  const clipCounts = useMemo(() => {
    const m = {};
    for (const c of event?.clips || []) if (c.songIndex != null) m[c.songIndex] = (m[c.songIndex] || 0) + 1;
    return m;
  }, [event?.clips]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [np?.index]);

  function onSongClick(slot) {
    if (beaconMode) return onBeacon(slot.i);
    player?.playSong(event.artist, slot.song);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Setlist {event.songsSource === 'fallback' ? '(typical)' : '· setlist.fm'}
        </h3>
        {beaconMode ? (
          <span className="text-[10px] text-rose-300">tap the song they just started ↓</span>
        ) : (
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-[10px]">
            {[['venue', event.city || 'Venue'], ['you', 'You'], ['both', 'Both']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTzView(v)}
                className={`rounded px-1.5 py-0.5 font-medium transition ${tzView === v ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ol className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {tl.map((slot) => {
          const isCurrent = np?.index === slot.i && np?.status === 'live' && np?.phase === 'song';
          const isPast = np?.index != null && slot.i < np.index;
          const startMs = slot.startMs + correction;
          const clips = clipCounts[slot.i] || 0;
          return (
            <li key={slot.i} ref={isCurrent ? activeRef : null}>
              <button
                onClick={() => onSongClick(slot)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  isCurrent
                    ? 'border-rose-400/50 bg-rose-500/15 text-zinc-50'
                    : isPast
                      ? 'border-transparent bg-white/[0.02] text-zinc-500'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300'
                } ${beaconMode ? 'cursor-pointer hover:border-rose-400/60' : 'hover:border-indigo-400/40'}`}
              >
                <span className="w-5 text-xs tabular-nums text-zinc-600">{slot.i + 1}</span>
                <span className="flex-1 truncate">
                  {slot.song}
                  {clips > 0 && <span className="ml-1.5 text-[10px] text-fuchsia-300">🎥 {clips}</span>}
                </span>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                    NOW
                  </span>
                ) : (
                  <SongTime startMs={startMs} tz={event.tz} view={beaconMode ? 'venue' : tzView} />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SongTime({ startMs, tz, view }) {
  const venue = fmtClock(startMs, tz);
  const you = fmtClock(startMs);
  if (view === 'venue') return <span className="text-[10px] tabular-nums text-zinc-600">{venue}</span>;
  if (view === 'you') return <span className="text-[10px] tabular-nums text-zinc-600">{you}</span>;
  return (
    <span className="text-right text-[10px] leading-tight tabular-nums text-zinc-600">
      <span className="block">{venue}<span className="text-zinc-700"> · venue</span></span>
      {you !== venue && <span className="block text-zinc-500">{you}<span className="text-zinc-700"> · you</span></span>}
    </span>
  );
}
