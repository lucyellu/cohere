import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HISTORY_EVENT,
  claimStamp,
  optOutConcert,
  readHistory,
  readVisas,
  readEntries,
  readStubs,
  readProfile,
  writeProfile,
  resyncTokens,
  resolveHome,
  travelItinerary,
  cityCoords,
  snapshotLocal,
  mergeState,
  writeLocalState,
  setCloudSync,
} from '../account.js';
import { supabase, supabaseEnabled } from '../live/supabase.js';
import { readArtMap, generateArtFor } from './passport/passportArt.js';
import PassportBook from './passport/PassportBook.jsx';
import VisaCard from './passport/VisaCard.jsx';
import EntryStamp from './passport/EntryStamp.jsx';
import TicketStub from './passport/TicketStub.jsx';
import ExportSheet from './passport/ExportSheet.jsx';
import { exportPng, exportPdf } from './passport/passportExport.js';

export default function PassportView({ onOpenCity }) {
  const [history, setHistory] = useState(() => readHistory());
  const [visas, setVisas] = useState(() => readVisas());
  const [entries, setEntries] = useState(() => readEntries());
  const [stubs, setStubs] = useState(() => readStubs());
  const [profile, setProfile] = useState(() => readProfile());
  const [art, setArt] = useState(() => readArtMap());
  const [genId, setGenId] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const exportRef = useRef(null);

  useEffect(() => {
    function refresh() {
      setHistory(readHistory());
      setVisas(readVisas());
      setEntries(readEntries());
      setStubs(readStubs());
      setProfile(readProfile());
    }
    window.addEventListener(HISTORY_EVENT, refresh);
    resyncTokens(); // re-attempt signing for anything still "pending"
    return () => window.removeEventListener(HISTORY_EVENT, refresh);
  }, []);

  async function generate(item) {
    setGenId(item.id);
    try {
      const url = await generateArtFor(item);
      setArt((m) => ({ ...m, [item.id]: url }));
    } catch {
      /* generation unavailable — CSS card stays */
    } finally {
      setGenId(null);
    }
  }

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

  const stats = useMemo(() => ({
    countries: visas.length,
    cities: new Set(entries.map((e) => e.city).filter(Boolean)).size,
    visits: entries.length,
    artists: new Set([...history, ...stubs].map((x) => x.artist).filter(Boolean)).size,
    stubs: stubs.length,
  }), [visas, entries, stubs, history]);

  const entriesByCountry = useMemo(() => {
    const m = {};
    for (const e of entries) m[e.country || ''] = (m[e.country || ''] || 0) + 1;
    return m;
  }, [entries]);

  const memberSince = useMemo(() => {
    const dates = history.map((h) => h.firstViewedAt).filter(Boolean).sort();
    return dates.length ? dates[0].slice(0, 10) : '';
  }, [history]);

  const home = useMemo(() => resolveHome(profile), [profile]);
  const travel = useMemo(() => travelItinerary(entries, home), [entries, home]);

  function setHome(value) {
    const coords = cityCoords(value);
    setProfile(writeProfile({ homeCity: value, homeLat: coords?.lat ?? null, homeLng: coords?.lng ?? null }));
  }

  async function doExport(kind) {
    if (!exportRef.current || exporting) return;
    setExporting(kind);
    setExportMsg('');
    try {
      const slug = (profile.name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
      if (kind === 'pdf') await exportPdf(exportRef.current, `cohear-passport-${slug}.pdf`);
      else await exportPng(exportRef.current, `cohear-passport-${slug}.png`);
    } catch {
      setExportMsg('Export failed — try removing an AI-generated photo, then retry.');
    } finally {
      setExporting('');
    }
  }

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

  // On sign-in: pull the cloud passport, merge it with whatever is on this
  // device (union — no stamp is ever lost), write the result back to both, and
  // then keep the cloud row updated on every later change (via setCloudSync).
  useEffect(() => {
    if (!supabase) return undefined;
    const user = session?.user;
    if (!user || user.is_anonymous) {
      setCloudSync(null, null);
      return undefined;
    }
    let alive = true;
    const userId = user.id;
    const upsert = (state) => supabase
      .from('passport_state')
      .upsert({ id: userId, state, updated_at: new Date().toISOString() });

    (async () => {
      setSyncMessage('Syncing your passport…');
      const { data, error } = await supabase
        .from('passport_state')
        .select('state')
        .eq('id', userId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setSyncMessage(error.message);
        return;
      }
      const merged = mergeState(snapshotLocal(), data?.state || {});
      writeLocalState(merged); // refreshes the UI + local cache
      const { error: upErr } = await upsert(merged);
      if (!alive) return;
      setSyncMessage(upErr ? upErr.message : 'Synced across your devices.');
      setCloudSync(userId, upsert); // write through every later mutation
    })();

    return () => {
      alive = false;
      setCloudSync(null, null);
    };
  }, [session]);

  async function syncCloud() {
    if (!supabase || !session?.user || session.user.is_anonymous) return;
    setSyncMessage('Syncing…');
    const { error } = await supabase
      .from('passport_state')
      .upsert({ id: session.user.id, state: snapshotLocal(), updated_at: new Date().toISOString() });
    setSyncMessage(error ? error.message : 'Synced.');
  }

  function neverHere(item) {
    optOutConcert(item);
  }

  function claim(item) {
    claimStamp(item);
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">Your passport</h2>
          <p className="text-xs text-zinc-500">Visas, stamps and tickets — collected automatically as you go.</p>
        </div>
        <div className="flex gap-2">
          <button className="cohear-secondary" onClick={() => doExport('png')} disabled={Boolean(exporting)} title="Download your passport as a PNG image">
            {exporting === 'png' ? 'Exporting…' : '⬇ PNG'}
          </button>
          <button className="cohear-secondary" onClick={() => doExport('pdf')} disabled={Boolean(exporting)} title="Download your passport as a PDF">
            {exporting === 'pdf' ? 'Exporting…' : '⬇ PDF'}
          </button>
        </div>
        {exportMsg && <p className="w-full text-right text-xs text-amber-300/80">{exportMsg}</p>}
      </div>

      {/* Identity + account */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PassportBook
          profile={profile}
          onName={(name) => setProfile(writeProfile({ name }))}
          onAvatar={(avatar) => setProfile(writeProfile({ avatar }))}
          onHome={setHome}
          identitySeed={session?.user?.email || profile.name || ''}
          memberSince={memberSince}
          stats={stats}
          travel={travel}
          home={home}
        />

        <div className="cohear-panel p-5">
          <p className="cohear-label">Account</p>
          <div className="mt-3">
            {supabaseEnabled ? (
              session?.user && !session.user.is_anonymous ? (
                <div className="space-y-3">
                  <div className="truncate text-sm font-semibold text-white">{session.user.email}</div>
                  <div className="flex flex-wrap gap-2">
                    <button className="cohear-primary" onClick={syncCloud}>Sync now</button>
                    <button className="cohear-secondary" onClick={signOut}>Sign out</button>
                  </div>
                  <p className="text-xs leading-5 text-zinc-500">
                    {syncMessage || 'Your passport syncs automatically across every device you sign in on.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-3">
                  <input className="cohear-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
                  <button className="cohear-primary w-full justify-center" disabled={!email.trim()}>Email sign-in link</button>
                  <p className="text-xs leading-5 text-zinc-500">{authMessage || 'Sign in to save your passport and see your stamps on any device.'}</p>
                </form>
              )
            ) : (
              <p className="text-sm leading-6 text-zinc-500">Local guest passport</p>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Seeing a live room issues a <span className="text-zinc-300">visa</span> for its country and a dated
            <span className="text-zinc-300"> entry stamp</span> for the city. Listen to a song and you keep the
            <span className="text-zinc-300"> ticket stub</span>.
          </p>
        </div>
      </section>

      {/* Visas */}
      <PageSection title="Visas" caption={`${visas.length} ${visas.length === 1 ? 'country' : 'countries'}`}>
        {!visas.length ? (
          <Empty>No visas yet — open a live room to clear customs.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visas.map((visa) => (
              <VisaCard
                key={visa.id}
                visa={visa}
                entryCount={entriesByCountry[visa.country] || 1}
                art={art[visa.id]}
                onGenerate={() => generate(visa)}
                generating={genId === visa.id}
              />
            ))}
          </div>
        )}
      </PageSection>

      {/* Entry stamps */}
      <PageSection title="Entry stamps" caption={`${entries.length} ${entries.length === 1 ? 'visit' : 'visits'}`}>
        {!entries.length ? (
          <Empty>No entry stamps yet — each city + date you turn up earns one.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-5 px-1 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {entries.map((entry) => <EntryStamp key={entry.id} entry={entry} onOpen={onOpenCity} />)}
          </div>
        )}
      </PageSection>

      {/* Ticket stubs */}
      <section className="cohear-panel overflow-hidden">
        <SectionHeader title="Ticket stubs" caption="One mints automatically for every show you attend" />
        <div className="p-4">
          {!stubs.length ? (
            <Empty dark>No ticket stubs yet — open any concert's live room and a stub mints itself.</Empty>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {stubs.map((stub) => (
                <TicketStub
                  key={stub.serial}
                  stub={stub}
                  art={art[stub.id]}
                  onGenerate={() => generate(stub)}
                  generating={genId === stub.id}
                  onOpen={onOpenCity}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* History */}
      <section className="cohear-panel overflow-hidden">
        <SectionHeader title="History" caption={`${history.length} ${history.length === 1 ? 'record' : 'records'}`} />
        <div className="max-h-[520px] overflow-y-auto p-3">
          {!history.length ? (
            <Empty dark>Open a concert in Discover or join a live room to start the record.</Empty>
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
                    <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => claim(item)}>Stamp passport</button>
                    <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => neverHere(item)} title="Delete this show — removes its stamp, ticket and city from your passport, map and mileage">✕ Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Off-screen export sheet — the source for PNG / PDF downloads. */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: -99999, width: 860, pointerEvents: 'none', zIndex: -1 }}>
        <ExportSheet
          ref={exportRef}
          profile={profile}
          stats={stats}
          travel={travel}
          home={home}
          memberSince={memberSince}
          visas={visas}
          entries={entries}
          stubs={stubs}
          identitySeed={session?.user?.email || profile.name || ''}
        />
      </div>
    </div>
  );
}

function PageSection({ title, caption, children }) {
  return (
    <section className="cohear-passport-page overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between border-b border-black/15 pb-2">
        <h3 className="text-sm font-black uppercase tracking-[0.18em]">{title}</h3>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] opacity-60">{caption}</span>
      </div>
      {children}
    </section>
  );
}

function SectionHeader({ title, caption }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <span className="text-xs text-zinc-600">{caption}</span>
    </div>
  );
}

function Status({ value }) {
  const attended = value === 'attended';
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${attended ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'}`}>
      {attended ? 'Stamped' : 'Visited'}
    </span>
  );
}

function Empty({ children, dark }) {
  return (
    <div className={`grid min-h-28 place-items-center rounded-lg border p-6 text-center text-sm ${dark ? 'border-white/10 bg-black/20 text-zinc-500' : 'border-black/10 bg-black/[0.03] text-black/50'}`}>
      <p className="max-w-sm leading-6">{children}</p>
    </div>
  );
}
