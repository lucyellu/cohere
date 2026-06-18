import { useState } from 'react';
import LiveLanding from './live/LiveLanding.jsx';
import LiveRoom from './live/LiveRoom.jsx';
import { PlayerProvider } from './live/player.jsx';
import BottomPlayer from './live/BottomPlayer.jsx';
import { resolveEvent } from './live/liveApi.js';
import TourView from './components/TourView.jsx';
import ConcertsView from './components/ConcertsView.jsx';
import ShowView from './components/ShowView.jsx';
import ControlRoom from './components/ControlRoom.jsx';
import LibraryView from './components/LibraryView.jsx';
import BYOCModal, { getByocKey } from './components/BYOCModal.jsx';

const NAV = [
  { id: 'discover', label: 'Discover' },
  { id: 'live', label: 'Live Rooms' },
  { id: 'archive', label: 'Archive' },
];

const ARCHIVE_TABS = [
  { id: 'globe', label: 'Globe' },
  { id: 'show', label: 'Show' },
  { id: 'library', label: 'Library' },
  { id: 'dev', label: 'Dev' },
];

export default function App() {
  const [view, setView] = useState('discover');
  const [liveEvent, setLiveEvent] = useState(null);
  const [archiveTab, setArchiveTab] = useState('globe');
  const [show, setShow] = useState(null);
  const [byocOpen, setByocOpen] = useState(false);
  const [, setByocKey] = useState(getByocKey());

  function enterShow(stop) {
    setShow(stop);
    setArchiveTab('show');
    setView('archive');
  }

  async function syncLive(concert) {
    const ev = await resolveEvent({
      artist: concert.artist,
      date: concert.date,
      venue: concert.venue,
      city: concert.city,
      country: concert.country,
      lat: concert.lat,
      lng: concert.lng,
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
              {view === 'archive' && (
                <button className="cohear-secondary" onClick={() => setByocOpen(true)}>
                  BYOC
                </button>
              )}
              <button className="cohear-primary" onClick={() => setView('discover')}>
                Browse concerts
              </button>
            </div>
          </header>

          {view === 'archive' && (
            <nav className="mt-4 flex flex-wrap gap-2" aria-label="Archive navigation">
              {ARCHIVE_TABS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setArchiveTab(item.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    archiveTab === item.id
                      ? 'border-white/20 bg-white text-zinc-950'
                      : 'border-white/10 bg-white/[0.035] text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          <main className="mt-5 flex-1">
            {view === 'discover' && <ConcertsView onEnterShow={enterShow} onSyncLive={syncLive} />}

            {view === 'live' &&
              (liveEvent ? (
                <LiveRoom event={liveEvent} onBack={() => setLiveEvent(null)} />
              ) : (
                <section className="cohear-panel p-5">
                  <LiveLanding onJoin={setLiveEvent} />
                </section>
              ))}

            {view === 'archive' && (
              <>
                {archiveTab === 'globe' && <TourView onEnterShow={enterShow} />}
                {archiveTab === 'show' &&
                  (show ? (
                    <ShowView show={show} onBack={() => setArchiveTab('globe')} onOpenByoc={() => setByocOpen(true)} />
                  ) : (
                    <div className="cohear-panel flex h-80 flex-col items-center justify-center gap-3 text-center text-sm text-zinc-500">
                      <span>No show selected yet.</span>
                      <button onClick={() => setArchiveTab('globe')} className="cohear-primary">
                        Pick one from the Globe
                      </button>
                    </div>
                  ))}
                {archiveTab === 'library' && <LibraryView />}
                {archiveTab === 'dev' && <ControlRoom />}
              </>
            )}
          </main>
        </div>
        <BYOCModal open={byocOpen} onClose={() => setByocOpen(false)} onSaved={setByocKey} />
        <BottomPlayer />
      </div>
    </PlayerProvider>
  );
}
