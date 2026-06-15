const STATUS = {
  green: { dot: 'bg-emerald-400', ring: 'shadow-[0_0_12px] shadow-emerald-400/50', label: 'LIVE', text: 'text-emerald-300' },
  mock: { dot: 'bg-amber-400', ring: 'shadow-[0_0_12px] shadow-amber-400/50', label: 'MOCK', text: 'text-amber-300' },
  offline: { dot: 'bg-red-500', ring: 'shadow-[0_0_12px] shadow-red-500/50', label: 'AUTH FAIL', text: 'text-red-300' },
  nokey: { dot: 'bg-zinc-600', ring: '', label: 'NO KEY', text: 'text-zinc-400' },
};

const CATEGORY = {
  data: 'text-sky-300 bg-sky-500/10',
  media: 'text-fuchsia-300 bg-fuchsia-500/10',
  ai: 'text-violet-300 bg-violet-500/10',
  audio: 'text-teal-300 bg-teal-500/10',
};

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function ServiceCard({ svc, onToggle, onProbe, busy }) {
  const st = STATUS[svc.status] || STATUS.nokey;
  const u = svc.usage || {};
  const canToggle = svc.hasKey && svc.live;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur transition hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${st.dot} ${st.ring}`} />
            <h3 className="font-semibold text-zinc-100">{svc.label}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CATEGORY[svc.category] || ''}`}>
              {svc.category}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{svc.description}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold tracking-wider ${st.text}`}>{st.label}</span>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="calls" value={u.calls ?? 0} />
        <Stat label="errors" value={u.errors ?? 0} danger={u.errors > 0} />
        <Stat label="latency" value={u.lastLatencyMs != null ? `${u.lastLatencyMs}ms` : '—'} />
        <Stat label="data" value={fmtBytes(u.bytes)} />
      </dl>

      {u.lastError && (
        <p className="mt-2 truncate rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300" title={u.lastError}>
          {u.lastError}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={() => onProbe(svc.id)}
          disabled={busy}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-40"
        >
          Probe
        </button>

        {canToggle ? (
          <button
            onClick={() => onToggle(svc.id, !svc.mock)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              svc.mock
                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {svc.mock ? 'Go live →' : '← Use mock'}
          </button>
        ) : (
          <span className="text-[11px] text-zinc-600">{svc.live ? 'add key to go live' : 'mock only'}</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="rounded-lg bg-black/30 py-1.5">
      <div className={`text-sm font-semibold tabular-nums ${danger ? 'text-red-300' : 'text-zinc-200'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
    </div>
  );
}
