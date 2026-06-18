import { useEffect, useMemo, useState } from 'react';
import { getEvent, getWeather } from './liveApi.js';
import { syncClock, syncedNow, nowPlaying, fmtClock, setWarpTo, clearWarp } from './clock.js';
import { usePresence } from './presence.js';
import { usePlayer } from './player.jsx';
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
  const [panelOrder, setPanelOrder] = useState(() => readPanelOrder());
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

  function movePanel(id, delta) {
    setPanelOrder((current) => {
      const next = [...current];
      const i = next.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= next.length) return current;
      [next[i], next[j]] = [next[j], next[i]];
      localStorage.setItem('cohear_live_panel_order', JSON.stringify(next));
      return next;
    });
  }

  const panelIndex = useMemo(() => Object.fromEntries(panelOrder.map((id, i) => [id, i])), [panelOrder]);

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.9fr)_minmax(280px,.85fr)]">
        <RoomPanel
          id="video"
          title="Video"
          subtitle="Shared YouTube surface for the selected song"
          order={panelIndex.video}
          onMove={movePanel}
        >
          <LiveVideoPanel event={event} np={np} />
          <NowPlaying np={np} event={event} syncedNow={now} />

          {/* Real mood/energy of the current song (Cyanite) — tints the room */}
          {np.song && <MoodBar artist={event.artist} song={np.song} />}

          {/* Demo time-warp */}
          <DemoWarp event={event} onWarp={warpToSong} />

          {isLive && np.song && <Lyrics artist={event.artist} song={np.song} />}
        </RoomPanel>

        <RoomPanel
          id="setlist"
          title="Setlist"
          subtitle="Predicted timing, current song, and quick play"
          order={panelIndex.setlist}
          onMove={movePanel}
        >
          <SetlistTimeline event={event} np={np} />
        </RoomPanel>

        <RoomPanel
          id="map"
          title="Venue map"
          subtitle={`${event.venue} · ${event.city}`}
          order={panelIndex.map}
          onMove={movePanel}
        >
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 xl:aspect-square">
            <VenueMap venue={event.venue} city={event.city} lat={event.lat} lng={event.lng} live={isLive} viewers={presenceCount != null ? presenceCount : null} />
          </div>
          <Weather event={event} />
        </RoomPanel>
      </div>

      {/* Crowd-sourced live feed (full width) */}
      <FanWall event={event} np={np} clips={event.clips || []} onClipsChanged={async () => {
        const fresh = await getEvent(event.id);
        if (fresh) setEvent((prev) => ({ ...prev, ...fresh }));
      }} />
    </div>
  );
}

function readPanelOrder() {
  const fallback = ['video', 'setlist', 'map'];
  try {
    const parsed = JSON.parse(localStorage.getItem('cohear_live_panel_order') || 'null');
    if (Array.isArray(parsed) && fallback.every((id) => parsed.includes(id))) {
      return fallback
        .map((id) => ({ id, index: parsed.indexOf(id) }))
        .sort((a, b) => a.index - b.index)
        .map((item) => item.id);
    }
  } catch {
    /* ignore bad saved layout */
  }
  return fallback;
}

function RoomPanel({ id, title, subtitle, order, onMove, children }) {
  return (
    <section className="cohear-panel h-fit min-w-0 p-3" style={{ order }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className="cohear-icon-button h-8 w-8" onClick={() => onMove(id, -1)} title="Move panel left" aria-label={`Move ${title} panel left`}>
            <ArrowIcon dir="left" />
          </button>
          <button className="cohear-icon-button h-8 w-8" onClick={() => onMove(id, 1)} title="Move panel right" aria-label={`Move ${title} panel right`}>
            <ArrowIcon dir="right" />
          </button>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function LiveVideoPanel({ event, np }) {
  const player = usePlayer();
  const track = player?.track;
  const canPlayCurrent = Boolean(np?.song);

  function playCurrent() {
    if (canPlayCurrent) player?.playSong(event.artist, np.song);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="aspect-video w-full">
        {track?.videoId ? (
          <iframe
            key={track.videoId}
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1&rel=0`}
            title={track.title || `${track.artist} ${track.song}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_25%,rgba(244,63,94,.18),transparent_35%),#050505] p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">Video surface</div>
            <div className="max-w-sm text-sm text-zinc-400">
              {canPlayCurrent ? `Play the current song to load the shared video here.` : 'The video panel will load once the show reaches a song.'}
            </div>
            {canPlayCurrent && (
              <button className="cohear-primary min-h-9 px-3 text-xs" onClick={playCurrent}>
                Play current song
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-xs">
        <div className="min-w-0">
          <div className="truncate font-semibold text-zinc-200">{track?.song || np?.song || 'No song selected'}</div>
          <div className="truncate text-zinc-500">{track?.channel || event.artist}</div>
        </div>
        {track?.videoId && (
          <a className="shrink-0 rounded-lg bg-white/5 px-2.5 py-1.5 text-zinc-300 hover:bg-white/10" href={`https://www.youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noreferrer">
            YouTube
          </a>
        )}
      </div>
    </div>
  );
}

function ArrowIcon({ dir }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
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
