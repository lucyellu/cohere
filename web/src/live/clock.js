// Cohere's shared clock.
//
// Everything anchors to one absolute UTC instant per song, so the stadium and
// the bedroom are on the same moment. Two jobs:
//   1. syncClock()    — measure our offset from server time (handles skewed
//                       laptop clocks; the venue could be in any timezone).
//   2. nowPlaying()   — pure function: given the timeline + crowd correction +
//                       synced now, what song is the crowd on right now?
//
// A demo "time-warp" lets a judge jump into the middle of the show at any real
// clock time, so the synchronized experience is always visible.

let offsetMs = 0; // serverNow - clientNow (estimated, latency-compensated)
let warpMs = 0; // demo: shift the synced clock to simulate being mid-show

// Handshake: hit /live/time a few times, keep the lowest-latency sample.
export async function syncClock() {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch('/api/live/time').then((r) => r.json()).catch(() => null);
    const t1 = Date.now();
    if (!res?.now) continue;
    const rtt = t1 - t0;
    if (rtt < best) {
      best = rtt;
      offsetMs = res.now + rtt / 2 - t1; // server time at t1, minus our t1
    }
  }
  return offsetMs;
}

// The current shared instant (ms): real synced time + any demo warp.
export function syncedNow() {
  return Date.now() + offsetMs + warpMs;
}

// --- Demo time-warp ------------------------------------------------------
// Jump the shared clock to a target real instant (e.g. "song 8 just started").
export function setWarpTo(targetMs) {
  warpMs = targetMs - (Date.now() + offsetMs);
}
export function clearWarp() {
  warpMs = 0;
}
export function isWarped() {
  return warpMs !== 0;
}

// --- The core: what's playing now ----------------------------------------
// Returns a rich status the whole Live Room renders from.
export function nowPlaying(event, now = syncedNow()) {
  const tl = event?.timeline || [];
  const correction = event?.correctionMs || 0;
  if (!tl.length) return { status: 'empty' };

  const startOf = (i) => tl[i].startMs + correction;
  const endOf = (i) => startOf(i) + tl[i].durSec * 1000;
  const showStart = startOf(0);
  const showEnd = endOf(tl.length - 1);

  if (now < showStart) {
    return {
      status: 'pre',
      startsInSec: Math.round((showStart - now) / 1000),
      nextSong: tl[0].song,
      index: -1,
    };
  }
  if (now >= showEnd) {
    return { status: 'ended', index: tl.length - 1, song: tl[tl.length - 1].song };
  }

  // Find the last song whose start has passed.
  let idx = 0;
  for (let i = 0; i < tl.length; i++) {
    if (startOf(i) <= now) idx = i;
    else break;
  }

  const inSong = now < endOf(idx);
  if (inSong) {
    const elapsed = (now - startOf(idx)) / 1000;
    const dur = tl[idx].durSec;
    return {
      status: 'live',
      phase: 'song',
      index: idx,
      song: tl[idx].song,
      elapsedSec: Math.round(elapsed),
      durSec: dur,
      progress: Math.min(1, elapsed / dur),
      nextSong: tl[idx + 1]?.song || null,
      nextIndex: idx + 1 < tl.length ? idx + 1 : null,
    };
  }
  // Between songs (banter / transition) before the next one.
  const next = idx + 1;
  return {
    status: 'live',
    phase: 'between',
    index: idx, // just-finished
    song: tl[idx].song,
    nextSong: tl[next]?.song || null,
    nextIndex: next < tl.length ? next : null,
    startsInSec: next < tl.length ? Math.round((startOf(next) - now) / 1000) : 0,
  };
}

// --- Formatting helpers --------------------------------------------------
export function fmtClock(ms, tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  }
}

export function fmtCountdown(sec) {
  if (sec == null || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
