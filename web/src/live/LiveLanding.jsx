import { useEffect, useState } from 'react';
import { getFeaturedList, resolveEvent } from './liveApi.js';

// The door into Cohear. A featured live show (Post Malone @ Rogers Stadium) you
// can join in one tap, plus a search to summon any artist as a live room or a
// synced replay of their most recent show.

export default function LiveLanding({ onJoin }) {
  const [featured, setFeatured] = useState([]);
  const [artist, setArtist] = useState('');
  const [mode, setMode] = useState('live'); // 'live' | 'replay'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getFeaturedList().then(setFeatured);
  }, []);

  async function summon() {
    if (!artist.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const ev = await resolveEvent({ artist: artist.trim(), mode });
    setBusy(false);
    if (ev) onJoin(ev);
    else setErr(`No setlist found for “${artist.trim()}”. Try a touring artist (setlist.fm needs a recent show).`);
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-zinc-50">Be in the crowd, from anywhere.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
          Cohear locks you to the same moment as everyone at the show — same song, same second.
          50,000 people in the stadium and you on your couch, in sync.
        </p>
      </div>

      {/* Featured shows */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {featured.map((ev) => {
          const replay = ev.mode === 'replay';
          return (
            <button
              key={ev.id}
              onClick={() => onJoin(ev)}
              className={`group block w-full overflow-hidden rounded-2xl border p-6 text-left transition ${
                replay
                  ? 'border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/5 to-transparent hover:border-indigo-400/60'
                  : 'border-rose-400/30 bg-gradient-to-br from-rose-500/15 via-fuchsia-500/5 to-transparent hover:border-rose-400/60'
              }`}
            >
              <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ${replay ? 'text-indigo-300' : 'text-rose-300'}`}>
                {replay ? (
                  <>📼 Replay · {ev.setlistDate || 'past show'}</>
                ) : (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Live tonight
                  </>
                )}
              </div>
              <h3 className="mt-2 text-2xl font-bold text-zinc-50">{ev.artist}</h3>
              <p className="text-sm text-zinc-300">
                {ev.venue} · {ev.city} · {ev.timeline.length} songs
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                {replay
                  ? 'Press play together — synced to the real setlist, with fans’ uploaded footage.'
                  : ev.songsSource === 'setlistfm'
                    ? `Setlist from their latest show (setlist.fm) · doors then 9pm ${ev.city} time`
                    : 'Typical current setlist · doors then 9pm local'}
              </p>
              <span className={`mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white group-hover:opacity-90 ${replay ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500' : 'bg-gradient-to-r from-rose-500 to-fuchsia-500'}`}>
                {replay ? 'Replay together →' : 'Join the crowd →'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Summon any artist */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Sync to any artist</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Build a synced room from their real setlist — as if it's happening tonight, or replay their most recent show together.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && summon()}
            placeholder="e.g. Bruno Mars, Olivia Rodrigo, Coldplay…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-400/50"
          />
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {['live', 'replay'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${mode === m ? 'bg-indigo-500 text-white' : 'text-zinc-400'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button onClick={summon} disabled={busy} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Summoning…' : 'Go →'}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-amber-300">{err}</p>}
      </div>
    </div>
  );
}
