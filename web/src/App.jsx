import { lazy, Suspense, useEffect, useState } from 'react';
import { PlayerProvider } from './live/player.jsx';
import BottomPlayer from './live/BottomPlayer.jsx';
import { resolveEvent } from './live/liveApi.js';
import { eventFromRoomCode, fastEventFromRoomCode, syncRoomUrl, currentRoomCode } from './live/roomShare.js';
import ConcertsView from './components/ConcertsView.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import AccountButton from './components/AccountButton.jsx';
import BackToTop from './components/BackToTop.jsx';
import { readSettings, writeSettings } from './settings.js';
import { recordConcertAction, autoStampOnView } from './account.js';
import { consumeInviteFromUrl } from './friends.js';
import { trackView } from './analytics.js';
import { applyTheme } from './theme.js';
import { initSfx, sfxEnabled, setSfxEnabled } from './sfx.js';
import Onboarding, { shouldOnboard } from './components/Onboarding.jsx';
import { fetchConcerts } from './concerts.js';

import LandingView from './components/LandingView.jsx';

// Non-landing views are split into their own chunks so the initial
// view ships minimal JavaScript. They fetch on demand when navigated to.
const LiveLanding = lazy(() => import('./live/LiveLanding.jsx'));
const LiveRoom = lazy(() => import('./live/LiveRoom.jsx'));
const PassportView = lazy(() => import('./components/PassportView.jsx'));
const CityView = lazy(() => import('./components/CityView.jsx'));

const NAV = [
  { id: 'home', label: 'Home' },
  { id: 'discover', label: 'Discover' },
  { id: 'live', label: 'Live Rooms' },
  { id: 'passport', label: 'Passport' },
];

// Read straight off the URL — consumeInviteFromUrl() runs later (in an effect)
// and strips the param, so the first render has to look for itself.
function hasInviteParam() {
  try {
    return Boolean(new URLSearchParams(window.location.search).get('friend'));
  } catch {
    return false;
  }
}

import { useIsMobile } from './useIsMobile.js';

export default function App() {
  const isMobile = useIsMobile(1024);
  const initialSharedEvent = currentRoomCode() ? fastEventFromRoomCode(currentRoomCode()) : null;
  const [view, setView] = useState(() => (currentRoomCode() ? 'live' : 'home'));
  const [liveEvent, setLiveEvent] = useState(() => initialSharedEvent);
  const [cityTarget, setCityTarget] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => readSettings());
  const [roomLoading, setRoomLoading] = useState(false);
  // First-run welcome — but not when arriving via a share link (let friends land
  // straight in the room instead of hitting a wall of onboarding).
  // …same for a ?friend= invite: land them on the passport, not a wall of onboarding.
  const [onboarding, setOnboarding] = useState(() => shouldOnboard() && !currentRoomCode() && !hasInviteParam());

  useEffect(() => {
    applyTheme(settings.themeAccent || '#71717a', settings.themeInvert || false, settings.themeSwap || false);
  }, [settings.themeAccent, settings.themeInvert, settings.themeSwap]);

  useEffect(() => { trackView(view); }, [view]);

  // Idle prefetch: warm the discover cache in the background so when the user
  // clicks "Discover", the concerts render immediately with zero delay.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConcerts('', 'live', 'tonight').catch(() => {});
      fetchConcerts('', 'live', 'week').catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Interaction sounds — bound once, on by default, toggled from the header.
  const [sfxOn, setSfxOn] = useState(() => sfxEnabled());
  useEffect(() => { initSfx(); }, []);
  function toggleSfx() {
    setSfxOn((on) => {
      setSfxEnabled(!on);
      return !on;
    });
  }

  // Open a shared room link (?room=…) on first load so friends land in the room instantly.
  useEffect(() => {
    const code = currentRoomCode();
    if (!code) return;
    const ev = fastEventFromRoomCode(code);
    if (ev) {
      autoStampOnView(ev);
      recordConcertAction(ev, ev.mode === 'replay' ? 'opened_replay' : 'joined_live', { source: 'share_link' });
      setLiveEvent(ev);
      setView('live');
    }
  }, []);

  // A ?friend=… invite link parks the code as a pending invite and drops you on
  // the Passport, where the Friends panel asks before adding anyone.
  useEffect(() => {
    const invite = consumeInviteFromUrl();
    if (invite && !currentRoomCode()) setView('passport');
  }, []);

  // Keep the address bar pointed at the open room so the URL stays shareable.
  useEffect(() => {
    if (roomLoading) return;
    syncRoomUrl(view === 'live' && liveEvent ? liveEvent : null);
  }, [view, liveEvent, roomLoading]);

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
      <div className={`min-h-full bg-cohear text-zinc-100 ${isMobile ? 'cohear-mobile-mode' : ''}`} data-mobile={isMobile ? 'true' : 'false'}>
        {/* Ambient mesh blobs — colour follows themeAccent via CSS vars */}
        <div aria-hidden="true" className="pointer-events-none select-none">
          <div className="cohear-mesh-blob" style={{ width: 640, height: 640, top: -160, left: -100, opacity: 0.16, animationDuration: '14s' }} />
          <div className="cohear-mesh-blob" style={{ width: 520, height: 520, top: '38%', right: -80, opacity: 0.13, animationDuration: '18s', animationDelay: '-5s' }} />
          <div className="cohear-mesh-blob" style={{ width: 460, height: 460, bottom: -60, left: '42%', opacity: 0.1, animationDuration: '22s', animationDelay: '-10s' }} />
        </div>
        <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-3.5 py-4 pb-32 sm:px-6 sm:py-5 lg:px-8 lg:pb-28">
          <header className="cohear-topbar flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="flex min-w-0 items-center gap-2.5 text-left group" onClick={() => setView('home')} aria-label="Open Home">
                <span className="cohear-logo-dot shrink-0 transition-transform duration-300 group-hover:scale-110" />
                <span className="min-w-0">
                  <span className="block text-xl font-bold tracking-tight text-white leading-none font-sans">Cohere</span>
                  <span className="block truncate text-[11px] text-zinc-500 mt-1 max-sm:hidden">Discover concerts. Collect memories.</span>
                </span>
              </button>
            </div>

            {/* Desktop Navigation */}
            <nav className="cohear-nav hidden lg:flex items-center" aria-label="Primary navigation">
              {NAV.map((item) => (
                <button key={item.id} data-cuelume-toggle onClick={() => setView(item.id)} className={view === item.id ? 'active' : ''}>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Header Actions (Responsive) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button className="cohear-primary hidden sm:inline-flex lg:inline-flex text-xs py-1.5 px-3" onClick={() => setView('discover')}>
                Browse concerts
              </button>
              <button
                className="cohear-icon-button"
                data-cuelume-toggle
                onClick={() => updateSettings({ themeInvert: !settings.themeInvert, themeAccent: settings.themeAccent || '#71717a' })}
                aria-label={settings.themeInvert ? 'Switch to dark mode' : 'Switch to landing page light mode'}
                title={settings.themeInvert ? 'Light mode active — click for dark' : 'Dark mode active — click for light'}
              >
                <SunMoonIcon isLight={settings.themeInvert} />
              </button>
              <AccountButton />
              <button className="cohear-icon-button" data-cuelume-toggle onClick={toggleSfx} aria-label={sfxOn ? 'Mute sound effects' : 'Unmute sound effects'} title={sfxOn ? 'Sound effects on' : 'Sound effects off'}>
                <SoundIcon muted={!sfxOn} />
              </button>
              <button className="cohear-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Settings">
                <GearIcon />
              </button>
            </div>
          </header>

          <main className="mt-4 sm:mt-5 flex-1">
            {view === 'home' && <LandingView onNavigate={(nextView) => setView(nextView)} />}
            {view === 'discover' && <ConcertsView onSyncLive={syncLive} settings={settings} onSettingsChange={updateSettings} isMobile={isMobile} />}

            <ErrorBoundary onBack={() => { setLiveEvent(null); setRoomLoading(false); setView('discover'); }}>
              <Suspense fallback={<ViewLoading />}>
                {view === 'passport' && <PassportView onOpenCity={openCity} onSyncLive={syncLive} isMobile={isMobile} />}

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
                    <LiveRoom event={liveEvent} onBack={() => { setLiveEvent(null); setRoomLoading(false); }} isMobile={isMobile} />
                  ) : roomLoading ? (
                    <section className="cohear-panel grid min-h-64 place-items-center p-8 text-sm text-zinc-500">
                      Joining room…
                    </section>
                  ) : (
                    <section className="cohear-panel p-5">
                      <LiveLanding onJoin={joinLandingEvent} />
                    </section>
                  ))}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        {/* Mobile Bottom Tab Navigation */}
        <nav className="cohear-mobile-tab-bar lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] shadow-[0_-8px_24px_rgba(0,0,0,0.4)]" aria-label="Mobile navigation">
          {NAV.map((item) => {
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`cohear-mobile-tab-btn flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium transition-all ${
                  isActive ? 'text-[var(--accent)] font-semibold scale-105' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="relative flex items-center justify-center">
                  <TabIcon id={item.id} active={isActive} />
                  {item.id === 'live' && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  )}
                  {item.id === 'live' && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <BottomPlayer isMobile={isMobile} />
        <SettingsDrawer open={settingsOpen} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
        {onboarding && <Onboarding onClose={() => setOnboarding(false)} />}
        <BackToTop />
      </div>
    </PlayerProvider>
  );
}

function TabIcon({ id, active }) {
  if (id === 'home') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "1.9"} strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    );
  }
  if (id === 'discover') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "1.9"} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
      </svg>
    );
  }
  if (id === 'live') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "1.9"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
        <circle cx="12" cy="12" r="2"/>
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
      </svg>
    );
  }
  if (id === 'passport') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "1.9"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
        <path d="M6 6h10"/>
        <path d="M6 10h10"/>
        <path d="M6 14h6"/>
      </svg>
    );
  }
  return null;
}

function ViewLoading() {
  return (
    <section className="cohear-panel grid min-h-64 place-items-center p-8 text-sm text-zinc-500">
      Loading…
    </section>
  );
}

import React from 'react';
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <section className="cohear-panel m-5 p-8 text-center">
          <p className="mb-4 text-zinc-500">Something went wrong loading this view.</p>
          <button className="cohear-primary px-4 py-2" onClick={this.props.onBack}>
            Go Back
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

function SoundIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      {muted ? (
        <path d="m16 9 6 6M22 9l-6 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.98 2.98l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.98-2.98l.04-.04A1.8 1.8 0 0 0 4 14.8a1.8 1.8 0 0 0-1.65-1.08H2.3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4 8.34a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.98-2.98l.04.04A1.8 1.8 0 0 0 8.6 4a1.8 1.8 0 0 0 1.08-1.65V2.3a2.1 2.1 0 0 1 4.2 0v.06A1.8 1.8 0 0 0 15.06 4a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.98 2.98l-.04.04A1.8 1.8 0 0 0 19.4 8.6a1.8 1.8 0 0 0 1.65 1.08h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

function SunMoonIcon({ isLight }) {
  if (isLight) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
