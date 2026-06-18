import { useEffect, useRef, useState } from 'react';
import { analyzeMood } from './liveApi.js';

// Cyanite mood/energy/BPM for the song the crowd is on right now. Cyanite
// ingests the song's YouTube source on its side (no audio hosting here) and
// returns real analysis, which we use to tint the room and name the mood —
// "what the room feels like" at this moment in the set. Analysis is async +
// credit-metered, so we analyze only the current song and cache per title.

const cache = new Map(); // song -> result (client-side, so revisits are instant)

export default function MoodBar({ artist, song }) {
  const [state, setState] = useState(() =>
    song && cache.has(song) ? { status: 'finished', result: cache.get(song) } : { status: 'idle' }
  );
  const want = useRef(null);

  useEffect(() => {
    if (!song) return;
    if (cache.has(song)) {
      setState({ status: 'finished', result: cache.get(song) });
      return;
    }
    let alive = true;
    want.current = song;
    setState({ status: 'pending' });
    let tries = 0;
    const tick = async () => {
      if (!alive || want.current !== song) return;
      const r = await analyzeMood({ song, artist });
      if (!alive || want.current !== song) return;
      if (r?.status === 'finished' && r.result) {
        cache.set(song, r.result);
        setState({ status: 'finished', result: r.result, mode: r.mode });
      } else if (r?.status === 'error' || tries++ > 12) {
        setState({ status: 'error' });
      } else {
        setTimeout(tick, 6000); // analysis takes ~45s on first sight
      }
    };
    tick();
    return () => { alive = false; };
  }, [song, artist]);

  if (!song || state.status === 'error') return null;

  if (state.status !== 'finished') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-zinc-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        Reading the room — analyzing the mood of “{song}”…
      </div>
    );
  }

  const m = state.result;
  const tags = [...(m.moodTags || []), ...(m.characterTags || [])].slice(0, 4);
  return (
    <div
      className="rounded-2xl border bg-white/[0.03] px-4 py-3"
      style={{ borderColor: `${m.color}55`, boxShadow: `inset 0 0 40px -28px ${m.color}` }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
          Room mood
        </span>
        {tags.map((t) => (
          <span key={t} className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize" style={{ background: `${m.color}22`, color: m.color }}>
            {t}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums text-zinc-500">
          {m.energyLevel && <span>⚡ {m.energyLevel} energy</span>}
          {m.bpm && <span>♩ {m.bpm} BPM</span>}
        </span>
      </div>
      {m.caption && <p className="mt-1.5 text-[11px] italic text-zinc-500">“{m.caption}”</p>}
      <p className="mt-1 text-[10px] text-zinc-600">
        Cyanite audio analysis{state.mode === 'mock' ? ' (demo)' : ''} · valence {fmt(m.valence)} · arousal {fmt(m.arousal)}
      </p>
    </div>
  );
}

function fmt(v) {
  return v == null ? '—' : v.toFixed(2);
}
