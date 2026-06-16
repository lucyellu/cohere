import { useEffect, useMemo, useState } from 'react';
import { sunoAccounts, sunoFeed, byocPool, synthesizePerformance } from '../api.js';

// Deterministic color per account for the badge dots.
const DOTS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#22d3ee', '#a78bfa', '#fb7185', '#4ade80'];
function dot(name) {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DOTS[h % DOTS.length];
}

export default function LibraryView() {
  const [accounts, setAccounts] = useState([]);
  const [clips, setClips] = useState([]);
  const [feedAccounts, setFeedAccounts] = useState([]);
  const [pool, setPool] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [acc, feed, pl] = await Promise.all([sunoAccounts(), sunoFeed({ pages: 1 }), byocPool()]);
      if (!alive) return;
      setAccounts(acc.accounts || []);
      setClips(feed.clips || []);
      setFeedAccounts(feed.accounts || []);
      setPool(pl?.ok ? pl : null);
      if (!feed.ok && !(feed.clips || []).length) setErr('Could not reach the gateway. Is it running on :5001?');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const shown = useMemo(
    () => (filter === 'all' ? clips : clips.filter((c) => c.account === filter)),
    [clips, filter]
  );

  return (
    <div className="space-y-6">
      <PoolStrip pool={pool} accounts={accounts} />

      <SynthesizeTool />

      {/* Account filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label={`All · ${clips.length}`} />
        {feedAccounts.map((a) => (
          <Chip
            key={a.account}
            active={filter === a.account}
            onClick={() => setFilter(a.account)}
            label={`${a.account} · ${a.count ?? 0}`}
            color={dot(a.account)}
            error={a.error}
          />
        ))}
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading your 6-account library…</p>}
      {err && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{err}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((c) => (
          <SongCard key={`${c.account}:${c.id}`} c={c} />
        ))}
      </div>
      {!loading && !shown.length && !err && (
        <p className="text-sm text-zinc-500">No songs for this filter.</p>
      )}
    </div>
  );
}

function PoolStrip({ pool, accounts }) {
  const authed = accounts.filter((a) => a.authed).length;
  const meta = pool?.byType?.meta;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <span className="font-semibold text-zinc-200">🎵 Unified Suno library</span>
      <span className="text-zinc-400">
        {accounts.length ? <>{authed}/{accounts.length} accounts authed</> : '…'}
      </span>
      <span className="text-zinc-600">|</span>
      <span className="text-zinc-400">
        BYOC pool:{' '}
        {pool ? (
          <>
            {pool.fans} fan{pool.fans === 1 ? '' : 's'} ·{' '}
            <span className="text-emerald-300">Pollinations FLUX free floor</span>
            {meta ? <> · Meta {meta.remaining}/day left ({meta.online} online)</> : null}
          </>
        ) : (
          'gateway offline'
        )}
      </span>
    </div>
  );
}

function SynthesizeTool() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function run() {
    if (!prompt.trim()) return;
    setBusy(true);
    setResult(null);
    const r = await synthesizePerformance({ song: { prompt: prompt.trim() }, imageCount: 4 });
    setResult(r);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fuchsia-200">
        ✨ Synthesize a scene <span className="text-xs font-normal text-zinc-500">(AI visuals via the BYOC pool)</span>
      </div>
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="e.g. Coldplay performing Yellow live, golden stage lights, crowd singing"
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-fuchsia-400/50"
        />
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {result && (
        <div className="mt-3">
          {result.ok ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(result.scene?.images || []).map((src, i) => (
                  <img key={i} src={src} alt={`frame ${i + 1}`} className="aspect-video w-full rounded-lg object-cover" loading="lazy" />
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Video: {result.scene?.video ? `${result.scene.video.images.length}-frame slideshow spec (ffmpeg-ready)` : 'n/a'}
                {result.pending?.length ? ` · pending: ${result.pending.join(', ')}` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-rose-300">{result.error || 'generation failed'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, color, error }) {
  return (
    <button
      onClick={onClick}
      title={error ? `error: ${error}` : undefined}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: error ? '#f87171' : color }} />}
      {label}
    </button>
  );
}

function SongCard({ c }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="relative aspect-square w-full bg-zinc-900">
        {c.image_url ? (
          <img src={c.image_url} alt={c.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-700">♪</div>
        )}
        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-zinc-200"
          title={c.account}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot(c.account) }} />
          {c.account}
        </span>
      </div>
      <div className="p-2">
        <div className="truncate text-sm font-medium text-zinc-100" title={c.title}>{c.title || '(untitled)'}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          {c.is_liked && <span className="text-rose-400">♥</span>}
          {typeof c.play_count === 'number' && <span>▶ {c.play_count}</span>}
          {c.model && <span className="truncate">{c.model}</span>}
        </div>
        {c.audio_url && (
          <audio controls preload="none" src={c.audio_url} className="mt-2 h-8 w-full" />
        )}
      </div>
    </div>
  );
}
