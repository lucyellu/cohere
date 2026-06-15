import { useCallback, useEffect, useState } from 'react';
import { getHealth, setMock, probe, probeAll } from '../api.js';
import ServiceCard from './ServiceCard.jsx';

export default function ControlRoom() {
  const [services, setServices] = useState([]);
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getHealth();
      setServices(data.services);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleToggle(id, useMock) {
    await setMock(id, useMock);
    await probe(id);
    refresh();
  }

  async function handleProbe(id) {
    setBusy(true);
    await probe(id).catch(() => {});
    await refresh();
    setBusy(false);
  }

  async function handlePingAll() {
    setBusy(true);
    await probeAll();
    await refresh();
    setBusy(false);
  }

  const live = services.filter((s) => s.status === 'green').length;
  const mock = services.filter((s) => s.status === 'mock').length;
  const nokey = services.filter((s) => s.status === 'nokey').length;
  const offline = services.filter((s) => s.status === 'offline').length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <Summary n={live} label="live" color="text-emerald-300" />
          <Summary n={mock} label="mock" color="text-amber-300" />
          <Summary n={offline} label="auth fail" color="text-red-300" />
          <Summary n={nokey} label="no key" color="text-zinc-400" />
        </div>
        <div className="flex items-center gap-3">
          <GatewayBadge connected={connected} />
          <button
            onClick={handlePingAll}
            disabled={busy || !connected}
            className="rounded-xl bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:opacity-40"
          >
            {busy ? 'Pinging…' : 'Ping all'}
          </button>
        </div>
      </div>

      {connected === false && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Can't reach the gateway on <code>:5001</code>. Is it running? Try <code>npm run dev</code> from the project root.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => (
          <ServiceCard key={svc.id} svc={svc} onToggle={handleToggle} onProbe={handleProbe} busy={busy} />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-zinc-600">
        Keys are server-side in the gateway. Services without a key are locked to mock data.
      </p>
    </div>
  );
}

function GatewayBadge({ connected }) {
  const map = {
    true: ['bg-emerald-400', 'Gateway online'],
    false: ['bg-red-500', 'Gateway offline'],
    null: ['bg-zinc-500 animate-pulse', 'Connecting…'],
  };
  const [dot, text] = map[String(connected)];
  return (
    <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

function Summary({ n, label, color }) {
  return (
    <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
      <span className={`font-bold tabular-nums ${color}`}>{n}</span>{' '}
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}
