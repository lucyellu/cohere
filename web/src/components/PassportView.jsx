import { useEffect, useMemo, useState } from 'react';
import { HISTORY_EVENT, claimStamp, markAttended, readHistory, readStamps } from '../account.js';
import { supabase, supabaseEnabled } from '../live/supabase.js';

export default function PassportView() {
  const [history, setHistory] = useState(() => readHistory());
  const [stamps, setStamps] = useState(() => readStamps());
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    function refresh() {
      setHistory(readHistory());
      setStamps(readStamps());
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
    const attended = history.filter((item) => item.status === 'attended').length;
    const artists = new Set(history.map((item) => item.artist).filter(Boolean)).size;
    return { total: history.length, attended, stamps: stamps.length, artists };
  }, [history, stamps]);

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

  function mark(item) {
    markAttended(item);
    setHistory(readHistory());
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
            <Metric label="I was here" value={stats.attended} tone="green" />
            <Metric label="Stamps" value={stats.stamps} tone="amber" />
            <Metric label="Artists" value={stats.artists} />
          </div>
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
                      <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => mark(item)}>I was here</button>
                      <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => stamp(item)}>Claim stamp</button>
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
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'green' ? 'text-emerald-200' : tone === 'amber' ? 'text-amber-200' : 'text-white'}`}>{value}</div>
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

function EmptyState({ stamp }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-white/10 bg-black/20 p-6 text-center">
      <div>
        <div className="text-sm font-semibold text-white">{stamp ? 'No stamps yet' : 'No concert records yet'}</div>
        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
          {stamp ? 'Claim stamps from concerts in your history.' : 'Open a concert in Discover or join a live room to start the record.'}
        </p>
      </div>
    </div>
  );
}
