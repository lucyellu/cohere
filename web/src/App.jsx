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

// Cohere — be in the crowd, from anywhere.
// Three top-level surfaces: Live (the synchronized concert clock), Discover
// (browse/search every concert, past + upcoming), and the original Archive
// (globe / show / library / dev).

const TABS = [
  { id: 'live', label: '🔴 Live', active: 'bg-rose-500 text-white' },
  { id: 'concerts', label: '🧭 Discover', active: 'bg-fuchsia-500 text-white' },
  { id: 'archive', label: '📼 Archive', active: 'bg-indigo-500 text-white' },
];

const ARCHIVE_TABS = [
  { id: 'globe', label: '🌍 Globe' },
  { id: 'show', label: '🎤 Show' },
  { id: 'library', label: '🎵 Library' },
  { id: 'dev', label: '🎛️ Dev' },
];

export default function App() {
  const [view, setView] = useState('live'); // 'live' | 'concerts' | 'archive'
  const [liveEvent, setLiveEvent] = useState(null);
  const [archiveTab, setArchiveTab] = useState('globe');
  const [show, setShow] = useState(null);
  const [byocOpen, setByocOpen] = useState(false);
  const [, setByocKey] = useState(getByocKey());

  function enterShow(stop) {
    setShow(stop);
    setArchiveTab('show');
    setView('archive'); // Show lives under Archive; jump there from anywhere
  }

  // From the Concerts browser: spin a past show up as a synchronized Live replay
  // room (real setlist.fm setlist), then jump to the Live tab.
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
    <div className="mx-auto min-h-full max-w-6xl px-4 py-8 pb-28 text-zinc-100">
      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-rose-400 to-fuchsia-400 bg-clip-text text-transparent">Cohere</span>
          </h1>
          <p className="text-sm text-zinc-500">Be in the crowd, from anywhere — same song, same second.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === t.id ? t.active : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {view === 'archive' && (
            <button
              onClick={() => setByocOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
              title="Bring Your Own Compute"
            >
              ✨ BYOC
            </button>
          )}
        </div>

        {view === 'archive' && (
          <nav className="mt-3 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {ARCHIVE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setArchiveTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${archiveTab === t.id ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* LIVE */}
      {view === 'live' &&
        (liveEvent ? (
          <LiveRoom event={liveEvent} onBack={() => setLiveEvent(null)} />
        ) : (
          <LiveLanding onJoin={setLiveEvent} />
        ))}

      {/* DISCOVER — browse/search every concert, past + upcoming */}
      {view === 'concerts' && <ConcertsView onEnterShow={enterShow} onSyncLive={syncLive} />}

      {/* ARCHIVE */}
      {view === 'archive' && (
        <>
          {archiveTab === 'globe' && <TourView onEnterShow={enterShow} />}
          {archiveTab === 'show' &&
            (show ? (
              <ShowView show={show} onBack={() => setArchiveTab('globe')} onOpenByoc={() => setByocOpen(true)} />
            ) : (
              <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/40 text-center text-sm text-zinc-500">
                <span>No show selected yet.</span>
                <button onClick={() => setArchiveTab('globe')} className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white">
                  Pick one from the Globe →
                </button>
              </div>
            ))}
          {archiveTab === 'library' && <LibraryView />}
          {archiveTab === 'dev' && <ControlRoom />}
        </>
      )}

      <BYOCModal open={byocOpen} onClose={() => setByocOpen(false)} onSaved={setByocKey} />
    </div>
    <BottomPlayer />
    </PlayerProvider>
  );
}
