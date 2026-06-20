import { useEffect, useState } from 'react';
import LiveLanding from './live/LiveLanding.jsx';
import LiveRoom from './live/LiveRoom.jsx';
import { PlayerProvider } from './live/player.jsx';
import BottomPlayer from './live/BottomPlayer.jsx';
import { resolveEvent } from './live/liveApi.js';
import ConcertsView from './components/ConcertsView.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import PassportView from './components/PassportView.jsx';
import CityView from './components/CityView.jsx';
import AccountButton from './components/AccountButton.jsx';
import { readSettings, writeSettings } from './settings.js';
import { recordConcertAction, autoStampOnView } from './account.js';

const NAV = [
  { id: 'discover', label: 'Discover' },
  { id: 'live', label: 'Live Rooms' },
  { id: 'passport', label: 'Passport' },
];

export default function App() {
  const [view, setView] = useState('discover');
  const [liveEvent, setLiveEvent] = useState(null);
  const [cityTarget, setCityTarget] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => readSettings());

  useEffect(() => {
    applyAccent(settings.themeAccent || '#e0662f');
  }, [settings.themeAccent]);

  function openCity(city, country) {
    if (!city) return;
    setCityTarget({ city, country: country || '' });
    setView('city');
  }

  function updateSettings(nextSettings) {
    setSettings((prev) => {
      const next = typeof nextSettings === 'function' ? nextSettings(prev) : nextSettings;
      return writeSettings(next);
    });
  }

  async function syncLive(concert) {
    recordConcertAction(concert, concert.when === 'past' ? 'opened_replay' : 'joined_live', { source: 'discover' });
    const ev = await resolveEvent({
      artist: concert.artist,
      date: concert.date,
      startDate: concert.startDate,
      venue: concert.venue,
      city: concert.city,
      country: concert.country,
      lat: concert.lat,
      lng: concert.lng,
      tz: concert.timeZone,
      mode: concert.when === 'upcoming' ? 'live' : 'replay',
    });
    if (ev) {
      recordConcertAction(ev, ev.mode === 'replay' ? 'opened_replay' : 'joined_live', { source: 'live_room' });
      autoStampOnView(ev); // seeing the room stamps the passport by default
      setLiveEvent(ev);
      setView('live');
    }
  }

  function joinLandingEvent(event) {
    recordConcertAction(event, event.mode === 'replay' ? 'opened_replay' : 'joined_live', { source: 'live_landing' });
    autoStampOnView(event); // seeing the room stamps the passport by default
    setLiveEvent(event);
  }

  return (
    <PlayerProvider>
      <div className="min-h-full bg-cohear text-zinc-100">
        {/* Ambient mesh blobs — colour follows themeAccent via CSS vars */}
        <div aria-hidden="true" className="pointer-events-none select-none">
          <div className="cohear-mesh-blob" style={{ width: 640, height: 640, top: -160, left: -100, opacity: 0.16, animationDuration: '14s' }} />
          <div className="cohear-mesh-blob" style={{ width: 520, height: 520, top: '38%', right: -80, opacity: 0.13, animationDuration: '18s', animationDelay: '-5s' }} />
          <div className="cohear-mesh-blob" style={{ width: 460, height: 460, bottom: -60, left: '42%', opacity: 0.1, animationDuration: '22s', animationDelay: '-10s' }} />
        </div>
        <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-5 pb-28 sm:px-6 lg:px-8">
          <header className="cohear-topbar">
            <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setView('discover')} aria-label="Open Discover">
              <img src="/cohere-logo.png" alt="Cohere" className="h-10 w-10 shrink-0 rounded-lg" />
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight text-white">Cohere</span>
                <span className="block truncate text-xs text-zinc-500">Find the biggest concerts happening now.</span>
              </span>
            </button>

            <nav className="cohear-nav" aria-label="Primary navigation">
              {NAV.map((item) => (
                <button key={item.id} onClick={() => setView(item.id)} className={view === item.id ? 'active' : ''}>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="hidden items-center gap-2 lg:flex">
              <button className="cohear-primary" onClick={() => setView('discover')}>
                Browse concerts
              </button>
            </div>

            <AccountButton />

            <button className="cohear-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Settings">
              <GearIcon />
            </button>
          </header>

          <main className="mt-5 flex-1">
            {view === 'discover' && <ConcertsView onSyncLive={syncLive} settings={settings} onSettingsChange={updateSettings} />}

            {view === 'passport' && <PassportView onOpenCity={openCity} />}

            {view === 'city' && cityTarget && (
              <CityView
                city={cityTarget.city}
                country={cityTarget.country}
                onBack={() => setView('passport')}
                onSyncLive={syncLive}
              />
            )}

            {view === 'live' &&
              (liveEvent ? (
                <LiveRoom event={liveEvent} onBack={() => setLiveEvent(null)} />
              ) : (
                <section className="cohear-panel p-5">
                  <LiveLanding onJoin={joinLandingEvent} />
                </section>
              ))}
          </main>
        </div>
        <BottomPlayer />
        <SettingsDrawer open={settingsOpen} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      </div>
    </PlayerProvider>
  );
}

// Generate the ENTIRE dark monochrome palette from one accent colour — the
// background, text, surfaces and Tailwind colour tokens all share the accent's
// hue so they move "in tandem" (TimeGrid-style). Picking orange → dark
// orange-brown page + warm-cream text; picking blue → dark navy page, etc.
function applyAccent(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const [h, s] = rgbToHsl(r, g, b);
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  set('--accent', hex);
  set('--accent-r', String(r));
  set('--accent-g', String(g));
  set('--accent-b', String(b));
  set('--accent-text', lum > 0.6 ? '#1a1206' : '#fff6ef');
  set('--accent-dim', hslHex(h, s * 0.94, clamp(hslL(r, g, b) - 0.13, 0.04, 1)));

  // Two-shade dark page + cream ink, all tinted by the accent hue.
  const paper = hslHex(h, clamp(s * 0.55, 0, 0.5), 0.066);
  const paper2 = hslHex(h, clamp(s * 0.55, 0, 0.5), 0.04);
  const card = hslHex(h, clamp(s * 0.5, 0, 0.44), 0.105);
  const ink = hslHex(h, clamp(s * 0.4, 0, 0.3), 0.93);
  const ink2 = hslHex(h, clamp(s * 0.32, 0, 0.24), 0.69);
  const ink3 = hslHex(h, clamp(s * 0.26, 0, 0.2), 0.5);
  set('--paper', paper);
  set('--paper-2', paper2);
  set('--paper-card', card);
  set('--ink', ink);
  set('--ink-2', ink2);
  set('--ink-3', ink3);
  set('--line', `rgba(${r}, ${g}, ${b}, 0.2)`);
  set('--line-soft', `rgba(${r}, ${g}, ${b}, 0.1)`);
  const inkRgb = hexRgb(ink);
  set('--surface', `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.05)`);
  set('--surface-2', `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.09)`);

  // Neutral ramp = a straight ink→page interpolation in the accent hue, so every
  // inline text-zinc-*/bg-zinc-* utility lands on the same monochrome.
  const pr = hexRgb(paper2);
  const stops = { 50: -0.04, 100: 0.06, 200: 0.16, 300: 0.3, 400: 0.45, 500: 0.56, 600: 0.67, 700: 0.78, 800: 0.88, 900: 0.94, 950: 1 };
  for (const key in stops) set(`--color-zinc-${key}`, lerpHex(inkRgb, pr, stops[key]));
  set('--color-white', ink);
  set('--color-neutral-100', ink);
  set('--color-neutral-400', lerpHex(inkRgb, pr, 0.45));
  set('--color-neutral-500', lerpHex(inkRgb, pr, 0.56));
  set('--color-gray-400', lerpHex(inkRgb, pr, 0.45));
  set('--color-gray-500', lerpHex(inkRgb, pr, 0.56));

  // The "accent" colour families (indigo/cyan/sky/fuchsia) all collapse onto the
  // chosen accent, lightened toward white for legible text shades on the dark page.
  const accentDim = hslHex(h, s * 0.94, clamp(hslL(r, g, b) - 0.13, 0.04, 1));
  const white = [255, 255, 255];
  for (const fam of ['indigo', 'cyan', 'sky', 'fuchsia']) {
    set(`--color-${fam}-100`, lerpHex([r, g, b], white, 0.58));
    set(`--color-${fam}-200`, lerpHex([r, g, b], white, 0.44));
    set(`--color-${fam}-300`, lerpHex([r, g, b], white, 0.28));
    set(`--color-${fam}-400`, lerpHex([r, g, b], white, 0.12));
    set(`--color-${fam}-500`, hex);
    set(`--color-${fam}-600`, accentDim);
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslL(r, g, b) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

function hslHex(h, s, l) {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return rgbHex([(rp + mm) * 255, (gp + mm) * 255, (bp + mm) * 255]);
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function lerpHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return rgbHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.98 2.98l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.98-2.98l.04-.04A1.8 1.8 0 0 0 4 14.8a1.8 1.8 0 0 0-1.65-1.08H2.3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4 8.34a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.98-2.98l.04.04A1.8 1.8 0 0 0 8.6 4a1.8 1.8 0 0 0 1.08-1.65V2.3a2.1 2.1 0 0 1 4.2 0v.06A1.8 1.8 0 0 0 15.06 4a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.98 2.98l-.04.04A1.8 1.8 0 0 0 19.4 8.6a1.8 1.8 0 0 0 1.65 1.08h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}
