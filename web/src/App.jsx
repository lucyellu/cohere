import { useState } from 'react';
import ControlRoom from './components/ControlRoom.jsx';
import TourView from './components/TourView.jsx';

const TABS = [
  { id: 'tour', label: '🌍 Tour Globe' },
  { id: 'control', label: '🎛️ API Control Room' },
];

export default function App() {
  const [tab, setTab] = useState('tour');

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 py-8 text-zinc-100">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Musicathon 2026</h1>
        <p className="mt-1 text-sm text-zinc-500">Concert tour archive · partner gateway &amp; diagnostics</p>

        <nav className="mt-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
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
      </header>

      {tab === 'tour' ? <TourView /> : <ControlRoom />}
    </div>
  );
}
