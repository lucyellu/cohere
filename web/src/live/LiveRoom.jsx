import { useEffect, useRef, useState } from 'react';
import { getEvent, sendBeacon } from './liveApi.js';
import { syncClock, syncedNow, nowPlaying, fmtClock, fmtCountdown, setWarpTo, clearWarp, isWarped } from './clock.js';
import { usePresence } from './presence.js';
import VenueMap from './VenueMap.jsx';
import NowPlaying from './NowPlaying.jsx';
import SetlistTimeline from './SetlistTimeline.jsx';
import FanWall from './FanWall.jsx';
import Lyrics from './Lyrics.jsx';

// The shared room. One synchronized clock; the map, now-playing, timeline, fan
// wall and lyrics all render off it. Polls the gateway for the crowd-corrected
// offset + clips; ticks once a second so the progress bar moves.

export default function LiveRoom({ event: initial, onBack }) {
  const [event, setEvent] = useState(initial);
  const [, tick] = useState(0); // force re-render each second
  const [beaconMode, setBeaconMode] = useState(false);
  const [synced, setSynced] = useState(false);
  const [beaconAck, setBeaconAck] = useState(null);
  const { count: presenceCount } = usePresence(event.id);

  // 1) Clock handshake, once.
  useEffect(() => {
    syncClock().then(() => setSynced(true));
  }, []);

  // 2) Poll the room for live correction + crowd clips.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const fresh = await getEvent(event.id);
      if (alive && fresh) setEvent((prev) => ({ ...prev, ...fresh }));
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [event.id]);

  // 3) Tick the clock so the progress bar + countdowns move.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = syncedNow();
  const np = nowPlaying(event, now);
  const isLive = np.status === 'live';

  // The crowd-syncers count (honest fallback when Supabase presence is off).
  const here = presenceCount != null ? presenceCount : event.beaconPeople || 0;
  const driftSec = Math.round((event.correctionMs || 0) / 1000);

  async function beacon(idx) {
    const i = idx != null ? idx : np.index;
    if (i == null || i < 0) return;
    const res = await sendBeacon(event.id, i);
    if (res?.ok) {
      setBeaconAck(`Synced “${event.timeline[i]?.song}” — ${res.beaconPeople} ${res.beaconPeople === 1 ? 'person' : 'people'} agree`);
      setTimeout(() => setBeaconAck(null), 4000);
      const fresh = await getEvent(event.id);
      if (fresh) setEvent((prev) => ({ ...prev, ...fresh }));
    }
  }

  // Demo time-warp: jump the shared clock to any song so the synced experience
  // is visible regardless of the real wall-clock time.
  function warpToSong(i) {
    const slot = event.timeline[i];
    if (slot) setWarpTo(slot.startMs + (event.correctionMs || 0) + 12000);
    tick((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
          ← Shows
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-zinc-50">
            {event.artist} {isLive && <span className="ml-1 align-middle text-xs font-semibold text-rose-400">● LIVE</span>}
          </h2>
          <p className="text-sm text-zinc-500">
            {event.venue} · {event.city} · {event.mode === 'replay' ? `replay of ${event.setlistDate || 'a past show'}` : 'tonight'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-right text-xs">
          <Clocks event={event} now={now} />
        </div>
      </div>

      {/* Crowd-sync status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {here.toLocaleString()} {presenceCount != null ? 'here now' : 'syncing the crowd'}
        </span>
        <span>·</span>
        <span>
          crowd drift{' '}
          <span className={driftSec ? 'text-amber-300' : 'text-zinc-500'}>
            {driftSec > 0 ? `+${driftSec}s late` : driftSec < 0 ? `${driftSec}s early` : 'on schedule'}
          </span>{' '}
          {event.beaconCount ? `(${event.beaconCount} taps)` : ''}
        </span>
        {!synced && <span className="text-zinc-600">· syncing clock…</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: map + now playing + sync */}
        <div className="space-y-4 lg:col-span-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10">
            <VenueMap venue={event.venue} city={event.city} lat={event.lat} lng={event.lng} live={isLive} viewers={presenceCount != null ? here : null} />
          </div>

          <NowPlaying np={np} event={event} syncedNow={now} />

          {/* Tap-to-sync (for people actually at the show) */}
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-100">📍 At the show?</p>
                <p className="text-[11px] text-zinc-500">Tap when a song starts — your taps sync the clock for everyone watching from home.</p>
              </div>
              <button
                onClick={() => setBeaconMode((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${beaconMode ? 'bg-rose-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                {beaconMode ? 'Done' : "I'm here"}
              </button>
            </div>
            {beaconMode && isLive && (
              <button
                onClick={() => beacon(np.index)}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-500 px-4 py-3 text-sm font-bold text-white hover:opacity-90"
              >
                👏 “{np.song || event.timeline[np.index]?.song}” just started
              </button>
            )}
            {beaconAck && <p className="mt-2 text-center text-[11px] text-emerald-300">{beaconAck}</p>}
          </div>

          {/* Demo time-warp */}
          <DemoWarp event={event} onWarp={warpToSong} />

          {isLive && np.song && <Lyrics artist={event.artist} song={np.song} />}
        </div>

        {/* Right: setlist timeline */}
        <aside className="lg:col-span-2">
          <SetlistTimeline event={event} np={np} beaconMode={beaconMode} onBeacon={beacon} />
        </aside>
      </div>

      {/* Fan footage wall (full width) */}
      <FanWall event={event} clips={event.clips || []} onClipsChanged={async () => {
        const fresh = await getEvent(event.id);
        if (fresh) setEvent((prev) => ({ ...prev, ...fresh }));
      }} />
    </div>
  );
}

function Clocks({ event, now }) {
  return (
    <>
      <div>
        <div className="text-zinc-500">{event.city || 'Venue'}</div>
        <div className="tabular-nums text-zinc-200">{fmtClock(now, event.tz)}</div>
      </div>
      <div>
        <div className="text-zinc-500">You</div>
        <div className="tabular-nums text-zinc-200">{fmtClock(now)}</div>
      </div>
    </>
  );
}

function DemoWarp({ event, onWarp }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-semibold text-zinc-300">🎬 Demo: jump into the show</span>
        <span className="text-xs text-zinc-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-zinc-500">Simulate being mid-concert at any real time. Jump the shared clock to a song:</p>
          <div className="flex flex-wrap gap-1.5">
            {event.timeline.map((s) => (
              <button key={s.i} onClick={() => onWarp(s.i)} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-indigo-500/30" title={s.song}>
                {s.i + 1}
              </button>
            ))}
          </div>
          <button onClick={() => { clearWarp(); onWarp(-1); }} className="text-[11px] text-zinc-500 hover:text-zinc-300">
            ↺ back to real time
          </button>
        </div>
      )}
    </div>
  );
}
