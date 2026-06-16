import { useState } from 'react';
import LiveLanding from './live/LiveLanding.jsx';
import LiveRoom from './live/LiveRoom.jsx';
import TourView from './components/TourView.jsx';
import ShowView from './components/ShowView.jsx';
import ControlRoom from './components/ControlRoom.jsx';
import LibraryView from './components/LibraryView.jsx';
import BYOCModal, { getByocKey } from './components/BYOCModal.jsx';

// Cohere — be in the crowd, from anywhere.
// Live is the home (a shared synchronized concert clock). The original tour
// archive (globe / show / library / dev) lives on under "Archive".

const ARCHIVE_TABS = [
  { id: 'globe', label: '🌍 Globe' },
  { id: 'show', label: '🎤 Show' },
  { id: 'library', label: '🎵 Library' },
  { id: 'dev', label: '🎛️ Dev' },
];

export default function App() {
  const [view, setView] = useState('live'); // 'live' | 'archive'
  const [liveEvent, setLiveEvent] = useState(null);
  const [archiveTab, setArchiveTab] = useState('globe');
  const [show, setShow] = useState(null);
  const [byocOpen, setByocOpen] = useState(false);
  const [, setByocKey] = useState(getByocKey());

  function enterShow(stop) {
    setShow(stop);
    setArchiveTab('show');
  }

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 py-8 text-zinc-100">
      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-rose-400 to-fuchsia-400 bg-clip-text text-transparent">Cohere</span>
          </h1>
          <p className="text-sm text-zinc-500">Be in the crowd, from anywhere — same song, same second.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setView('live')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === 'live' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              🔴 Live
            </button>
            <button
              onClick={() => setView('archive')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === 'archive' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              📼 Archive
            </button>
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
  );
}
