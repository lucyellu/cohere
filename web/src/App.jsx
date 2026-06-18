import { useState } from 'react';
import LiveLanding from './live/LiveLanding.jsx';
import LiveRoom from './live/LiveRoom.jsx';
import { PlayerProvider } from './live/player.jsx';
import BottomPlayer from './live/BottomPlayer.jsx';
import { resolveEvent } from './live/liveApi.js';
import ConcertsView from './components/ConcertsView.jsx';

const NAV = [
  { id: 'discover', label: 'Discover' },
  { id: 'live', label: 'Live Rooms' },
];

export default function App() {
  const [view, setView] = useState('discover');
  const [liveEvent, setLiveEvent] = useState(null);

  async function syncLive(concert) {
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
      setLiveEvent(ev);
      setView('live');
    }
  }

  return (
    <PlayerProvider>
      <div className="min-h-full bg-cohear text-zinc-100">
        <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-5 pb-28 sm:px-6 lg:px-8">
          <header className="cohear-topbar">
            <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setView('discover')} aria-label="Open Discover">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-200/20 bg-amber-200/10 text-sm font-black text-amber-100">
                C
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight text-white">Cohear</span>
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
          </header>

          <main className="mt-5 flex-1">
            {view === 'discover' && <ConcertsView onSyncLive={syncLive} />}

            {view === 'live' &&
              (liveEvent ? (
                <LiveRoom event={liveEvent} onBack={() => setLiveEvent(null)} />
              ) : (
                <section className="cohear-panel p-5">
                  <LiveLanding onJoin={setLiveEvent} />
                </section>
              ))}
          </main>
        </div>
        <BottomPlayer />
      </div>
    </PlayerProvider>
  );
}
