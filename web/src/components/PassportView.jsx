import { useEffect, useMemo, useState } from 'react';
import { HISTORY_EVENT, claimStamp, optOutConcert, readHistory, readStamps, readStubs } from '../account.js';
import { supabase, supabaseEnabled } from '../live/supabase.js';

export default function PassportView() {
  const [history, setHistory] = useState(() => readHistory());
  const [stamps, setStamps] = useState(() => readStamps());
  const [stubs, setStubs] = useState(() => readStubs());
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    function refresh() {
      setHistory(readHistory());
      setStamps(readStamps());
      setStubs(readStubs());
    }
    window.addEventListener(HISTORY_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const stats = useMemo(() => {
    const artists = new Set(history.map((item) => item.artist).filter(Boolean)).size;
    return { total: history.length, stamps: stamps.length, stubs: stubs.length, artists };
  }, [history, stamps, stubs]);

  async function sendMagicLink(e) {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthMessage(error ? error.message : 'Check your email for the sign-in link.');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  async function syncCloud() {
    if (!supabase || !session?.user || session.user.is_anonymous) return;
    setSyncMessage('Syncing...');
    const userId = session.user.id;
    const profile = {
      id: userId,
      display_name: session.user.email || null,
      updated_at: new Date().toISOString(),
    };
    const historyRows = history.map((item) => ({
      user_id: userId,
      concert_key: item.id,
      artist: item.artist || null,
      venue: item.venue || null,
      city: item.city || null,
      region: item.region || null,
      country: item.country || null,
      concert_date: item.date || null,
      start_at: parseDateTime(item.startDate),
      timezone: item.timeZone || null,
      status: item.status || 'visited',
      source: item.source || null,
      first_viewed_at: item.firstViewedAt || new Date().toISOString(),
      last_viewed_at: item.lastViewedAt || new Date().toISOString(),
      attended_at: item.attendedAt || null,
      actions: item.actions || {},
      updated_at: new Date().toISOString(),
    }));
    const stampRows = stamps.map((stamp) => ({
      user_id: userId,
      concert_key: stamp.id,
      serial: stamp.serial,
      edition: stamp.edition,
      prompt: stamp.prompt,
      image_url: stamp.imageUrl || null,
      issued_at: stamp.issuedAt || new Date().toISOString(),
    }));
    const profileRes = await supabase.from('profiles').upsert(profile);
    const historyRes = historyRows.length
      ? await supabase.from('concert_history').upsert(historyRows, { onConflict: 'user_id,concert_key' })
      : { error: null };
    const stampRes = stampRows.length
      ? await supabase.from('passport_stamps').upsert(stampRows, { onConflict: 'user_id,concert_key' })
      : { error: null };
    const error = profileRes.error || historyRes.error || stampRes.error;
    setSyncMessage(error ? error.message : 'Synced.');
  }

  function neverHere(item) {
    optOutConcert(item);
    setHistory(readHistory());
    setStamps(readStamps());
    setStubs(readStubs());
  }

  function stamp(item) {
    claimStamp(item);
    setHistory(readHistory());
    setStamps(readStamps());
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="cohear-panel p-5">
          <p className="cohear-label">Passport</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Concerts you have carried with you.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Metric label="Records" value={stats.total} />
            <Metric label="Stamps" value={stats.stamps} tone="amber" />
            <Metric label="Ticket stubs" value={stats.stubs} tone="cyan" />
            <Metric label="Artists" value={stats.artists} />
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Seeing a live room stamps your passport automatically. Listen to a song there and you also keep the ticket stub.
            Don't want a show on your passport? Hit <span className="text-zinc-300">I was never here</span>.
          </p>
        </div>

        <div className="cohear-panel p-5">
          <p className="cohear-label">Account</p>
          <div className="mt-3">
            {supabaseEnabled ? (
              session?.user && !session.user.is_anonymous ? (
                <div className="space-y-3">
                  <div className="truncate text-sm font-semibold text-white">{session.user.email}</div>
                  <div className="flex flex-wrap gap-2">
                    <button className="cohear-primary" onClick={syncCloud}>Sync passport</button>
                    <button className="cohear-secondary" onClick={signOut}>Sign out</button>
                  </div>
                  {syncMessage && <p className="text-xs leading-5 text-zinc-500">{syncMessage}</p>}
                </div>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-3">
                  <input className="cohear-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
                  <button className="cohear-primary w-full justify-center" disabled={!email.trim()}>Email sign-in link</button>
                  {authMessage && <p className="text-xs leading-5 text-zinc-500">{authMessage}</p>}
                </form>
              )
            ) : (
              <p className="text-sm leading-6 text-zinc-500">Local guest passport</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
        <div className="cohear-panel overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">History</h3>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-3">
            {!history.length ? (
              <EmptyState />
            ) : (
              <div className="grid gap-2">
                {history.map((item) => (
                  <article key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{item.artist || item.venue}</div>
                        <div className="mt-1 truncate text-xs text-zinc-500">{item.venue} · {[item.city, item.country].filter(Boolean).join(', ')}</div>
                      </div>
                      <Status value={item.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-600">{item.date || 'Date TBA'}</span>
                      <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => stamp(item)}>Claim stamp</button>
                      <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => neverHere(item)} title="Remove this show from your passport">I was never here</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cohear-panel overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Stamp book</h3>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-4">
            {!stamps.length ? (
              <EmptyState stamp />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {stamps.map((stamp) => <StampCard key={stamp.serial} stamp={stamp} />)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="cohear-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Ticket stubs</h3>
          <span className="text-xs text-zinc-600">Kept when you listen to a song in the room</span>
        </div>
        <div className="p-4">
          {!stubs.length ? (
            <EmptyState stub />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stubs.map((stub) => <StubCard key={stub.serial} stub={stub} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function parseDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'green' ? 'text-emerald-200' : tone === 'amber' ? 'text-amber-200' : tone === 'cyan' ? 'text-cyan-200' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function Status({ value }) {
  const attended = value === 'attended';
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${attended ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'}`}>
      {attended ? 'Was here' : 'Visited'}
    </span>
  );
}

function StampCard({ stamp }) {
  return (
    <article className="cohear-stamp-card">
      <div className="cohear-stamp-ink">
        <div className="text-[10px] font-black uppercase tracking-[0.18em]">{stamp.city || 'Cohear'}</div>
        <div className="mt-2 line-clamp-2 text-2xl font-black uppercase leading-none">{stamp.artist || 'Concert'}</div>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em]">{stamp.date || 'Date TBA'}</div>
        <div className="mt-3 truncate text-[10px] font-bold">{stamp.serial}</div>
      </div>
      <div className="mt-3 min-w-0">
        <div className="truncate text-sm font-semibold text-white">{stamp.venue || stamp.city}</div>
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer text-cyan-200">Image prompt</summary>
          <p className="mt-2 leading-5">{stamp.prompt}</p>
        </details>
      </div>
    </article>
  );
}

function StubCard({ stub }) {
  const seat = stub.seat || {};
  return (
    <article className="cohear-ticket-stub">
      <div className="cohear-ticket-main">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Admit one</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">#{String(stub.edition).padStart(4, '0')}</span>
        </div>
        <div className="mt-2 line-clamp-2 text-lg font-black uppercase leading-tight text-white">{stub.artist || 'Concert'}</div>
        <div className="mt-1 truncate text-xs text-zinc-400">{stub.venue || stub.city}{stub.city && stub.venue ? ` · ${stub.city}` : ''}</div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
          <span>{stub.date || 'Date TBA'}</span>
          <span>Sec {seat.section}</span>
          <span>Row {seat.row}</span>
          <span>Seat {seat.seat}</span>
          <span>Gate {seat.gate}</span>
        </div>
        <div className="cohear-ticket-barcode" aria-hidden="true" />
        <div className="mt-1 truncate text-[10px] font-bold tracking-[0.14em] text-zinc-600">{stub.serial}</div>
      </div>
      <div className="cohear-ticket-stub-end">Cohear · Admit one</div>
    </article>
  );
}

function EmptyState({ stamp, stub }) {
  const kind = stub ? 'stub' : stamp ? 'stamp' : 'record';
  const copy = {
    stub: { title: 'No ticket stubs yet', body: 'Join a live room and play a song — the stub lands here.' },
    stamp: { title: 'No stamps yet', body: 'Seeing a live room stamps your passport automatically.' },
    record: { title: 'No concert records yet', body: 'Open a concert in Discover or join a live room to start the record.' },
  }[kind];
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-white/10 bg-black/20 p-6 text-center">
      <div>
        <div className="text-sm font-semibold text-white">{copy.title}</div>
        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">{copy.body}</p>
      </div>
    </div>
  );
}
