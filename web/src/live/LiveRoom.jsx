import { useEffect, useState } from 'react';
import { getEvent, getWeather } from './liveApi.js';
import { syncClock, syncedNow, nowPlaying, fmtClock, setWarpTo, clearWarp } from './clock.js';
import { usePresence } from './presence.js';
import VenueMap from './VenueMap.jsx';
import NowPlaying from './NowPlaying.jsx';
import MoodBar from './MoodBar.jsx';
import SetlistTimeline from './SetlistTimeline.jsx';
import FanWall from './FanWall.jsx';
import Lyrics from './Lyrics.jsx';

// The shared room. One synchronized clock drives the map, now-playing, timeline,
// fan wall and lyrics. The timeline is a PREDICTION (start time + real track
// lengths + setlist order); for a live show it auto-swaps to tonight's real
// setlist the moment attendees log it on setlist.fm.

export default function LiveRoom({ event: initial, onBack }) {
  const [event, setEvent] = useState(initial);
  const [, tick] = useState(0); // force re-render each second
  const [synced, setSynced] = useState(false);
  const { count: presenceCount } = usePresence(event.id);

  // 1) Clock handshake, once.
  useEffect(() => {
    syncClock().then(() => setSynced(true));
  }, []);

  // 2) Poll the room (live setlist swap + duration refinement + crowd clips).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const fresh = await getEvent(event.id);
      if (alive && fresh) setEvent((prev) => ({ ...prev, ...fresh }));
    };
    poll();
    const t = setInterval(poll, 5000);
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

  function warpToSong(i) {
    const slot = event.timeline[i];
    if (slot) setWarpTo(slot.startMs + 12000);
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

      {/* Accuracy / source bar — honest about prediction vs real setlist */}
      <AccuracyBar event={event} presenceCount={presenceCount} synced={synced} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: map + now playing */}
        <div className="space-y-4 lg:col-span-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10">
            <VenueMap venue={event.venue} city={event.city} lat={event.lat} lng={event.lng} live={isLive} viewers={presenceCount != null ? presenceCount : null} />
          </div>

          <Weather event={event} />


          <NowPlaying np={np} event={event} syncedNow={now} />

          {/* Real mood/energy of the current song (Cyanite) — tints the room */}
          {np.song && <MoodBar artist={event.artist} song={np.song} />}

          {/* Demo time-warp */}
          <DemoWarp event={event} onWarp={warpToSong} />

          {isLive && np.song && <Lyrics artist={event.artist} song={np.song} />}
        </div>

        {/* Right: setlist timeline */}
        <aside className="lg:col-span-2">
          <SetlistTimeline event={event} np={np} />
        </aside>
      </div>

      {/* Crowd-sourced live feed (full width) */}
      <FanWall event={event} np={np} clips={event.clips || []} onClipsChanged={async () => {
        const fresh = await getEvent(event.id);
        if (fresh) setEvent((prev) => ({ ...prev, ...fresh }));
      }} />
    </div>
  );
}

function AccuracyBar({ event, presenceCount, synced }) {
  const replay = event.mode === 'replay';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400">
      {presenceCount != null && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {presenceCount.toLocaleString()} here now
        </span>
      )}

      {/* Setlist source — honest about predicted vs real */}
      {event.exact ? (
        <span className="text-emerald-300">
          {replay ? `🎶 Real setlist · ${event.setlistDate}` : `🎶 Tonight's real setlist (setlist.fm)`}
        </span>
      ) : (
        <span className="text-amber-300/90">
          📋 Predicted order from {event.artist}'s last show{event.setlistDate ? ` (${event.setlistDate})` : ''} — tonight's may differ
        </span>
      )}

      <span className="text-zinc-500">· ⏱ times estimated (start + track lengths)</span>
      {!synced && <span className="text-zinc-600">· syncing clock…</span>}
    </div>
  );
}

// Venue weather — current for a live show, that night's archive for a replay.
// Reinforces "be there": especially for the open-air Rogers Stadium show.
function Weather({ event }) {
  const [wx, setWx] = useState(null);
  useEffect(() => {
    if (event.lat == null || event.lng == null) return;
    const date = event.mode === 'replay' && event.setlistDate ? dmyToIso(event.setlistDate) : null;
    let alive = true;
    getWeather({ lat: event.lat, lng: event.lng, date }).then((r) => alive && setWx(r));
    return () => { alive = false; };
  }, [event.id, event.lat, event.lng, event.mode, event.setlistDate]);

  if (!wx) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400">
      <span className="text-base">{wx.emoji}</span>
      <span className="font-medium text-zinc-200">{Math.round(wx.tempC)}°C</span>
      <span>{wx.label}</span>
      {wx.windKph != null && <span className="text-zinc-500">· 💨 {Math.round(wx.windKph)} km/h</span>}
      {wx.precip > 0 && <span className="text-sky-300/80">· 🌧 {wx.precip} mm</span>}
      <span className="ml-auto text-[11px] text-zinc-600">
        {wx.mode === 'historical' ? `${event.city} · that night` : `${event.city} · now`}
      </span>
    </div>
  );
}
function dmyToIso(dmy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
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
