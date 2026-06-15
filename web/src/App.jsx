import { useState } from 'react';
import TourView from './components/TourView.jsx';
import ShowView from './components/ShowView.jsx';
import ControlRoom from './components/ControlRoom.jsx';
import BYOCModal, { getByocKey } from './components/BYOCModal.jsx';

const TABS = [
  { id: 'globe', label: '🌍 Globe' },
  { id: 'show', label: '🎤 Show' },
  { id: 'dev', label: '🎛️ Dev' },
];

export default function App() {
  const [tab, setTab] = useState('globe');
  const [show, setShow] = useState(null);
  const [byocOpen, setByocOpen] = useState(false);
  const [byocKey, setByocKey] = useState(getByocKey());

  function enterShow(stop) {
    setShow(stop);
    setTab('show');
  }

  const crowdPowered = Boolean(byocKey);

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 py-8 text-zinc-100">
      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">Reverb</span>
          </h1>
          <p className="text-sm text-zinc-500">Relive any tour — crowd footage, lyrics &amp; AI-filled gaps</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.id ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setByocOpen(true)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              crowdPowered
                ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Bring Your Own Compute"
          >
            ✨ {crowdPowered ? 'Crowd-Powered' : 'Standard mode'}
          </button>
        </div>
      </header>

      {tab === 'globe' && <TourView onEnterShow={enterShow} />}
      {tab === 'show' &&
        (show ? (
          <ShowView show={show} onBack={() => setTab('globe')} onOpenByoc={() => setByocOpen(true)} />
        ) : (
          <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/40 text-center text-sm text-zinc-500">
            <span>No show selected yet.</span>
            <button onClick={() => setTab('globe')} className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white">
              Pick one from the Globe →
            </button>
          </div>
        ))}
      {tab === 'dev' && <ControlRoom />}

      <BYOCModal open={byocOpen} onClose={() => setByocOpen(false)} onSaved={setByocKey} />
    </div>
  );
}
