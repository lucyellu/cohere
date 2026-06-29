import { useEffect, useMemo, useRef, useState } from 'react';
import { getEvent, getWeather } from './liveApi.js';
import { syncClock, syncedNow, nowPlaying, fmtClock, setWarpTo, clearWarp } from './clock.js';
import { usePresence } from './presence.js';
import { roomUrl } from './roomShare.js';
import { usePlayer } from './player.jsx';
import { autoStampOnView, claimTicketStub } from '../account.js';
import VenueMap from './VenueMap.jsx';
import NowPlaying from './NowPlaying.jsx';
import SetlistTimeline from './SetlistTimeline.jsx';
import FanWall from './FanWall.jsx';
import Lyrics from './Lyrics.jsx';
import ChatPanel from './ChatPanel.jsx';
import TranscriptPanel from './TranscriptPanel.jsx';
import { useVoice } from './voiceChannel.js';

// The shared room. One synchronized clock drives the map, now-playing, timeline,
// fan wall and lyrics. The timeline is a PREDICTION (start time + real track
// lengths + setlist order); for a live show it auto-swaps to tonight's real
// setlist the moment attendees log it on setlist.fm.

export default function LiveRoom({ event: initial, onBack }) {
  const [event, setEvent] = useState(initial);
  const [, tick] = useState(0); // force re-render each second
  const [synced, setSynced] = useState(false);
  const [panelOrder, setPanelOrder] = useState(() => readPanelOrder());
  const [resetNonce, setResetNonce] = useState(0);
  const { count: presenceCount } = usePresence(event.id);
  const voice = useVoice(event.id);
  const player = usePlayer();
  const sizeStore = useMemo(() => createSizeStore(), []);

  // 1) Clock handshake, once.
  useEffect(() => {
    syncClock().then(() => setSynced(true));
  }, []);

  // Seeing the room stamps the passport by default (idempotent per show).
  useEffect(() => {
    autoStampOnView(event);
  }, [event.id]);

  // Mint a ticket stub the moment you've heard a song here — either by playing
  // one yourself (the persistent player may hold a track from another room, so
  // match the artist), or just by being present while the synced setlist is
  // mid-song. claimTicketStub is idempotent per show, so both can fire freely.
  useEffect(() => {
    const t = player?.track;
    if (t?.videoId && sameArtist(t.artist, event.artist)) claimTicketStub(event);
  }, [player?.track?.videoId, event.id]);

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

  // Passive listening: a song is playing on the synced clock while you're in the
  // room → that counts as being there for it. Auto-mints the stub, no clicks.
  useEffect(() => {
    if (synced && isLive) claimTicketStub(event);
  }, [synced, isLive, event.id]);

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

  function resetPanels() {
    localStorage.removeItem('cohear_live_panel_order');
    sizeStore.clear();
    setPanelOrder(['chat', 'transcription', 'video', 'lyrics', 'setlist', 'map', 'social']);
    setResetNonce((n) => n + 1); // re-applies default size to every panel
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
        <div className="ml-auto flex items-center gap-3 text-right text-xs">
          <InviteButton event={event} />
          <Clocks event={event} now={now} />
        </div>
      </div>

      {/* Accuracy / source bar — honest about prediction vs real setlist */}
      <AccuracyBar event={event} presenceCount={presenceCount} synced={synced} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-600">Drag any panel's bottom-right corner to resize · use the arrows to reorder.</p>
        <button onClick={resetPanels} className="cohear-secondary min-h-8 px-3 text-xs" title="Restore default panel layout">
          ⤢ Reset panels
        </button>
      </div>

      <div className="cohear-live-grid">
        <RoomPanel
          id="video"
          title="Video"
          subtitle="Shared YouTube surface for the selected song"
          order={panelIndex.video}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <LiveVideoPanel event={event} np={np} />
          <NowPlaying np={np} event={event} syncedNow={now} />

          {/* Demo time-warp */}
          <DemoWarp event={event} onWarp={warpToSong} />
        </RoomPanel>

        <RoomPanel
          id="lyrics"
          title="Lyrics"
          subtitle={np.song ? np.song : 'Current-song lyrics'}
          order={panelIndex.lyrics}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          {np.song ? (
            <Lyrics artist={event.artist} song={np.song} />
          ) : (
            <EmptyPanelText>Lyrics appear when a song is selected or the show reaches a track.</EmptyPanelText>
          )}
        </RoomPanel>

        <RoomPanel
          id="setlist"
          title="Setlist"
          subtitle="Predicted timing, current song, and quick play"
          order={panelIndex.setlist}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <SetlistTimeline event={event} np={np} />
        </RoomPanel>

        <RoomPanel
          id="map"
          title="Venue map"
          subtitle={`${event.venue} · ${event.city}`}
          order={panelIndex.map}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 xl:aspect-square">
            <VenueMap venue={event.venue} city={event.city} lat={event.lat} lng={event.lng} live={isLive} viewers={presenceCount != null ? presenceCount : null} />
          </div>
          <Weather event={event} />
        </RoomPanel>

        <RoomPanel
          id="social"
          title="Social feed"
          subtitle="YouTube, TikTok, Instagram, X, and crowd links"
          order={panelIndex.social}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <FanWall event={event} np={np} clips={event.clips || []} onClipsChanged={async () => {
            const fresh = await getEvent(event.id);
            if (fresh) setEvent((prev) => ({ ...prev, ...fresh }));
          }} compact />
        </RoomPanel>

        <RoomPanel
          id="chat"
          title="Chat & Voice"
          subtitle="Text and voice chat with others in the room"
          order={panelIndex.chat}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <ChatPanel eventId={event.id} voiceProp={voice} />
        </RoomPanel>

        <RoomPanel
          id="transcription"
          title="Transcription"
          subtitle="Live group chat of the voice channel"
          order={panelIndex.transcription || 99}
          onMove={movePanel}
          sizeStore={sizeStore}
          resetNonce={resetNonce}
        >
          <TranscriptPanel eventId={event.id} voice={voice} />
        </RoomPanel>
      </div>
    </div>
  );
}

function readPanelOrder() {
  const fallback = ['chat', 'transcription', 'video', 'lyrics', 'setlist', 'map', 'social'];
  try {
    const parsed = JSON.parse(localStorage.getItem('cohear_live_panel_order') || 'null');
    if (Array.isArray(parsed) && parsed.includes('chat')) {
      // If transcription is missing from a saved layout, insert it after chat
      if (!parsed.includes('transcription')) {
        const chatIdx = parsed.indexOf('chat');
        parsed.splice(chatIdx + 1, 0, 'transcription');
      }
      // Ensure all fallback items exist
      for (const f of fallback) {
        if (!parsed.includes(f)) parsed.push(f);
      }
      return parsed;
    }
  } catch {
    /* ignore bad saved layout */
  }
  return fallback;
}

// Copy a shareable link to THIS room — friends who open it land right here.
function InviteButton({ event }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = roomUrl(event);
    const text = `Join me in the crowd for ${event.artist} on Cohere →`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cohere', text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }
  return (
    <button
      onClick={share}
      className="cohear-primary min-h-8 shrink-0 px-3 text-xs"
      title="Copy a link that drops your friends into this exact room"
    >
      {copied ? '✓ Link copied' : '🎟 Invite'}
    </button>
  );
}

function EmptyPanelText({ children }) {
  return <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-500">{children}</p>;
}

// Per-panel saved widths/heights, persisted to localStorage. Applied
// imperatively (not via React state) so the 1/sec clock re-render never
// snaps a panel back while the user is dragging its corner.
const PANEL_DEFAULT_SIZE = {
  video: { w: 600, h: 560 },
  lyrics: { w: 430, h: 560 },
  setlist: { w: 430, h: 560 },
  map: { w: 430, h: 560 },
  social: { w: 470, h: 560 },
  chat: { w: 380, h: 560 },
};

function createSizeStore() {
  const KEY = 'cohear_live_panel_sizes';
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  return {
    get(id) {
      return read()[id] || PANEL_DEFAULT_SIZE[id] || { w: 440, h: 540 };
    },
    save(id, w, h) {
      const all = read();
      const prev = all[id];
      if (prev && Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2) return;
      all[id] = { w, h };
      localStorage.setItem(KEY, JSON.stringify(all));
    },
    clear() {
      localStorage.removeItem(KEY);
    },
  };
}

function sameArtist(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function RoomPanel({ id, title, subtitle, order, onMove, sizeStore, resetNonce, children }) {
  const ref = useRef(null);

  // Apply the saved (or default) size on mount and whenever the layout is reset,
  // then persist any user drag via a ResizeObserver.
  useEffect(() => {
    const el = ref.current;
    if (!el || !sizeStore) return undefined;
    const { w, h } = sizeStore.get(id);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => sizeStore.save(id, Math.round(el.offsetWidth), Math.round(el.offsetHeight)));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [id, sizeStore, resetNonce]);

  return (
    <section ref={ref} className="cohear-panel cohear-room-panel min-w-0 p-3" style={{ order }}>
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
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--paper-2)] p-6 text-center">
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
