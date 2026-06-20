import { useState } from 'react';
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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.98 2.98l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.98-2.98l.04-.04A1.8 1.8 0 0 0 4 14.8a1.8 1.8 0 0 0-1.65-1.08H2.3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4 8.34a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.98-2.98l.04.04A1.8 1.8 0 0 0 8.6 4a1.8 1.8 0 0 0 1.08-1.65V2.3a2.1 2.1 0 0 1 4.2 0v.06A1.8 1.8 0 0 0 15.06 4a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.98 2.98l-.04.04A1.8 1.8 0 0 0 19.4 8.6a1.8 1.8 0 0 0 1.65 1.08h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}
