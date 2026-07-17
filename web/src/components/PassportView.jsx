import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HISTORY_EVENT,
  autoStampHistory,
  optOutConcert,
  readHistory,
  readVisas,
  readEntries,
  readStubs,
  readTrash,
  restoreFromTrash,
  deleteFromTrash,
  emptyTrash,
  findDuplicateStubs,
  deduplicateStubs,
  pruneDuplicates,
  pruneViewedOnlyStamps,
  readProfile,
  writeProfile,
  ensurePassportId,
  personalStats,
  resyncTokens,
  resolveHome,
  cityCoords,
  travelItinerary,
  snapshotLocal,
  mergeState,
  writeLocalState,
  setCloudSync,
  exportJson,
  importJson,
} from '../account.js';
import { supabase, supabaseEnabled } from '../live/supabase.js';
import { play } from '../sfx.js';
import { hasMapsKey, geocodeCity } from '../live/maps.js';
import { readArtMap, generateArtFor } from './passport/passportArt.js';
import PassportSpread from './passport/PassportSpread.jsx';
import PassportCover from './passport/PassportCover.jsx';
import VisaCard from './passport/VisaCard.jsx';
import EntryStamp from './passport/EntryStamp.jsx';
import SouvenirStamp from './passport/SouvenirStamp.jsx';
import TicketStub from './passport/TicketStub.jsx';
import ExportSheet from './passport/ExportSheet.jsx';
import PassportMap from './passport/PassportMap.jsx';
import ArtistTourMap from './passport/ArtistTourMap.jsx';
import { exportPng, exportPdf, exportBookletPdf } from './passport/passportExport.js';

export default function PassportView({ onOpenCity }) {
  const [history, setHistory] = useState(() => readHistory());
  const [visas, setVisas] = useState(() => readVisas());
  const [entries, setEntries] = useState(() => readEntries());
  const [stubs, setStubs] = useState(() => readStubs());
  const [profile, setProfile] = useState(() => readProfile());
  const [trash, setTrash] = useState(() => readTrash());
  const [dupCount, setDupCount] = useState(() => findDuplicateStubs().reduce((n, g) => n + g.length - 1, 0));
  const [art, setArt] = useState(() => readArtMap());
  // Which cards are showing their art view (vs the standard printed card).
  // Freshly generated art switches its card to the art view automatically.
  const [artView, setArtView] = useState({});
  const [genId, setGenId] = useState(null);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef(null);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [coverOpen, setCoverOpen] = useState(false);
  const [loupe, setLoupe] = useState(false);
  const exportRef = useRef(null);
  const layoutRef = useRef(null);
  const [railVisible, setRailVisible] = useState(false);

  // Once the passport (and its edge tabs) scrolls out of view, a slim rail of
  // the same section tabs pins to the top so navigation is never out of reach.
  useEffect(() => {
    function onScroll() {
      const el = layoutRef.current;
      if (el) setRailVisible(el.getBoundingClientRect().bottom < 60);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function refresh() {
      setHistory(readHistory());
      setVisas(readVisas());
      setEntries(readEntries());
      setStubs(readStubs());
      setProfile(readProfile());
      setTrash(readTrash());
      setDupCount(findDuplicateStubs().reduce((n, g) => n + g.length - 1, 0));
    }
    window.addEventListener(HISTORY_EVENT, refresh);
    ensurePassportId(); // mint the permanent unique id the QR code encodes
    pruneDuplicates(); // silently collapse any duplicate stubs/stamps before showing them
    pruneViewedOnlyStamps(); // undo old over-stamping of merely-browsed concerts
    autoStampHistory(); // every attended show stamps itself — no manual button
    resyncTokens(); // re-attempt signing for anything still "pending"
    return () => window.removeEventListener(HISTORY_EVENT, refresh);
  }, []);

  async function generate(item) {
    setGenId(item.id);
    try {
      const url = await generateArtFor(item);
      setArt((m) => ({ ...m, [item.id]: url }));
      setArtView((v) => ({ ...v, [item.id]: true }));
    } catch {
      /* generation unavailable — CSS card stays */
    } finally {
      setGenId(null);
    }
  }

  function toggleArtView(id) {
    setArtView((v) => ({ ...v, [id]: !v[id] }));
  }

  function jumpTo(id) {
    document.getElementById(`pp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if (!supabase) { setSessionLoading(false); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session || null); setSessionLoading(false); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionLoading(false);
    });
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

  // Same estimate the Discover header shows — face value of every stub.
  const savedUsd = useMemo(() => personalStats().savedUsd, [stubs, entries]);

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
    // Place of issue is now a country (like a real passport), not a typed city.
    setProfile(writeProfile({ homeCountry: value }));
  }

  function setHomeCity(value) {
    // Typing a new city invalidates any stored geocode for the old one.
    setProfile(writeProfile({ homeCity: value, homeLat: null, homeLng: null }));
  }

  // On blur: if the bundled city table can't place it, ask Google's geocoder
  // and store the coords so travel distances measure from the real home.
  async function commitHomeCity(value) {
    const name = String(value || '').trim();
    if (!name || cityCoords(name) || !hasMapsKey()) return;
    try {
      const coords = await geocodeCity(name);
      if (coords) setProfile(writeProfile({ homeLat: coords.lat, homeLng: coords.lng }));
    } catch { /* unplaceable — falls back to the home country's origin */ }
  }

  async function doExport(kind) {
    if (!exportRef.current || exporting) return;
    setExporting(kind);
    setExportMsg('');
    try {
      const slug = (profile.name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
      if (kind === 'pdf') await exportPdf(exportRef.current, `cohear-passport-${slug}.pdf`);
      else if (kind === 'booklet') await exportBookletPdf(exportRef.current, `cohear-passport-booklet-${slug}.pdf`);
      else await exportPng(exportRef.current, `cohear-passport-${slug}.png`);
      play('success');
    } catch {
      play('error');
      setExportMsg('Export failed — try removing an AI-generated photo, then retry.');
    } finally {
      setExporting('');
    }
  }

  // Print the passport pages directly, one life-size 88×125mm page per sheet.
  // The @page size is injected just for this print so it never affects other
  // prints of the app; the body class scopes the print-only CSS.
  function doPrint() {
    const style = document.createElement('style');
    style.textContent = '@page { size: 88mm 125mm; margin: 0; }';
    document.head.appendChild(style);
    document.body.classList.add('cohear-print-passport');
    const done = () => {
      document.body.classList.remove('cohear-print-passport');
      style.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 2000); // fallback — afterprint is flaky in some browsers
  }

  function doExportJson() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const slug = (profile.name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
    const a = document.createElement('a');
    a.href = url;
    a.download = `cohear-passport-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importJson(ev.target.result);
        setImportMsg('Passport restored successfully.');
      } catch (err) {
        setImportMsg(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleDeduplicate() {
    const n = deduplicateStubs();
    setImportMsg(n > 0 ? `Removed ${n} duplicate ${n === 1 ? 'stub' : 'stubs'} — check Recently deleted to restore any you want back.` : 'No duplicates found.');
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

  const isLoggedIn = !supabaseEnabled || (session?.user && !session.user.is_anonymous);

  // One list drives both the stats-panel edge tabs and the sticky top rail.
  const jumpSections = [
    ...(entries.length || stubs.length ? [['maps', 'Maps', '#c2543a']] : []),
    ['visas', 'Visas', '#b98a2f'],
    ['entries', 'Stamps', '#3a7d4f'],
    ['souvenirs', 'Souvenirs', '#2f6f9e'],
    ['tickets', 'Tickets', '#8a3f93'],
    ['history', 'History', '#71685c'],
  ];

  if (supabaseEnabled && sessionLoading) {
    return <div className="grid min-h-64 place-items-center text-sm text-zinc-600">Loading…</div>;
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 py-16">
        <div className="text-center">
          <div className="mb-3 text-5xl">🛂</div>
          <h2 className="text-2xl font-bold text-white">Your concert passport</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
            Sign in to collect visas, entry stamps, and ticket stubs as you explore live rooms and discover shows.
          </p>
        </div>

        <div className="cohear-panel w-full max-w-sm p-6">
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              className="cohear-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoFocus
            />
            <button className="cohear-primary w-full justify-center" disabled={!email.trim()}>
              Email sign-in link
            </button>
            {authMessage && (
              <p className="text-center text-xs leading-5 text-zinc-400">{authMessage}</p>
            )}
          </form>
          <p className="mt-4 text-center text-xs text-zinc-600">
            We'll send a magic link — no password needed.
          </p>
        </div>

        <div className="grid max-w-md grid-cols-3 gap-4 text-center">
          {[
            { icon: '🌍', label: 'Country visas', desc: 'One per country you visit' },
            { icon: '📬', label: 'Entry stamps', desc: 'City + date, every show' },
            { icon: '🎟', label: 'Ticket stubs', desc: 'Minted when you listen' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">{icon}</div>
              <div className="mt-2 text-xs font-semibold text-white">{label}</div>
              <div className="mt-1 text-xs text-zinc-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">Your passport</h2>
          <p className="text-xs text-zinc-500">Visas, stamps and tickets — collected automatically as you go.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dupCount > 0 && (
            <button className="cohear-secondary text-amber-300" onClick={handleDeduplicate} title="Remove duplicate stubs (same artist, venue and city)">
              Remove {dupCount} duplicate{dupCount !== 1 ? 's' : ''}
            </button>
          )}
          <button className="cohear-secondary" onClick={doExportJson} title="Download a JSON backup you can restore from">⬇ JSON backup</button>
          <label className="cohear-secondary cursor-pointer" title="Restore from a previously downloaded JSON backup">
            ↑ Restore backup
            <input ref={importRef} type="file" accept=".json,application/json" className="sr-only" onChange={handleImportFile} />
          </label>
          <button className="cohear-secondary" data-cuelume-toggle="loading" onClick={() => doExport('png')} disabled={Boolean(exporting)} title="Download your passport as a PNG image">
            {exporting === 'png' ? 'Exporting…' : '⬇ PNG'}
          </button>
          <button className="cohear-secondary" data-cuelume-toggle="loading" onClick={() => doExport('pdf')} disabled={Boolean(exporting)} title="Download a PDF with one life-size (88×125mm) passport page per sheet">
            {exporting === 'pdf' ? 'Exporting…' : '⬇ PDF'}
          </button>
          <button className="cohear-secondary" data-cuelume-toggle="loading" onClick={() => doExport('booklet')} disabled={Boolean(exporting)} title="A4 booklet PDF — print double-sided (flip on short edge), fold down the middle and staple for a life-size mini passport">
            {exporting === 'booklet' ? 'Exporting…' : '⬇ Booklet'}
          </button>
          <button className="cohear-secondary" data-cuelume-toggle="loading" onClick={doPrint} title="Print the passport pages life-size, one per sheet">
            🖨 Print
          </button>
        </div>
        {(exportMsg || importMsg) && (
          <p className="w-full text-right text-xs text-amber-300/80">{importMsg || exportMsg}</p>
        )}
      </div>

      {/* Sticky section rail — appears once the passport scrolls away */}
      {railVisible && (
        <nav className="cohear-sticky-rail" aria-label="Passport sections">
          <button type="button" data-cuelume-toggle="page" style={{ '--tab': '#1c2e6e' }} onClick={() => jumpTo('passport')}>
            ⌃ Passport
          </button>
          {jumpSections.map(([id, label, color]) => (
            <button key={id} type="button" data-cuelume-toggle="page" style={{ '--tab': color }} onClick={() => jumpTo(id)}>
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Passport + stats sidebar layout */}
      <div className="cohear-passport-layout" id="pp-passport" ref={layoutRef}>
        {/* Book + its sticky index tabs. The tabs poke out of the fore-edge
            like the plastic stick-on tabs people put in real passports —
            each one jumps to where that section starts further down. */}
        <div className="cohear-book-wrap">
        {/* Closed passport first — the leather cover opens into the spread */}
        {!coverOpen ? (
        <button type="button" className="cohear-cover-btn" data-cuelume-toggle="bloom" onClick={() => setCoverOpen(true)} aria-label="Open your passport">
          <PassportCover />
          <span className="cohear-cover-btn__hint">Tap to open</span>
        </button>
        ) : (
        <PassportSpread
          profile={profile}
          onName={(name) => setProfile(writeProfile({ name }))}
          onAvatar={(avatar) => setProfile(writeProfile({ avatar }))}
          onHome={setHome}
          onHomeCity={setHomeCity}
          onHomeCityCommit={commitHomeCity}
          onSignature={(signature) => setProfile(writeProfile({ signature }))}
          photoGender={profile.photoGender}
          onPhotoGender={(g) => setProfile(writeProfile({ photoGender: g }))}
          identitySeed={session?.user?.email || profile.name || ''}
          memberSince={memberSince}
          loupe={loupe}
          home={home}
          visas={visas}
          entries={entries}
          stubs={stubs}
          onOpenCity={onOpenCity}
        />
        )}
        </div>

        {/* Stats sidebar — matches the open passport's height; the section
            jump tabs ride its outer edge */}
        <div className="cohear-stats-sidebar">
          {/* Distance + money, side by side on one line */}
          <div className="cohear-stat-row">
            <div className="cohear-stat-card">
              <div className="cohear-stat-card__title">Distance Travelled</div>
              <div className="cohear-distance-hero">
                <span className="cohear-distance-hero__globe" aria-hidden="true">🌍</span>
                <div>
                  <div>
                    <span className="cohear-distance-hero__value">{fmtStat(Math.round(travel?.miles || 0))}</span>
                    {' '}<span className="cohear-distance-hero__unit">mi</span>
                  </div>
                  <div className="cohear-distance-hero__sub">
                    {fmtStat(Math.round(travel?.km || 0))} km · {travel?.stops || 0} stops
                  </div>
                </div>
              </div>
            </div>
            <div className="cohear-stat-card">
              <div className="cohear-stat-card__title">Ticket $ Saved</div>
              <div className="cohear-distance-hero" title="Estimated total face value of tickets for every show you attended virtually instead of buying in.">
                <span className="cohear-distance-hero__globe" aria-hidden="true">💸</span>
                <div>
                  <div>
                    <span className="cohear-distance-hero__value">${fmtStat(Math.round(savedUsd))}</span>
                  </div>
                  <div className="cohear-distance-hero__sub">est. · {stats.stubs} {stats.stubs === 1 ? 'ticket' : 'tickets'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Concert stats — grows so the sidebar fills the passport's height */}
          <div className="cohear-stat-card cohear-stat-card--grow">
            <div className="cohear-stat-card__title">Your Stats</div>
            <div className="cohear-stat-grid">
              <StatChip label="Countries" value={stats.countries} />
              <StatChip label="Cities" value={stats.cities} />
              <StatChip label="Entries" value={stats.visits} />
              <StatChip label="Artists" value={stats.artists} />
              <StatChip label="Tickets" value={stats.stubs} />
              <StatChip label="Member since" value={memberSince ? memberSince.slice(0, 4) : '—'} />
            </div>
          </div>

          {/* Philatelist's loupe — inspect the stamp page up close */}
          <button
            type="button"
            className={`cohear-loupe-toggle${loupe ? ' is-on' : ''}`}
            onClick={() => { setLoupe((v) => !v); if (!coverOpen) setCoverOpen(true); }}
            title="Magnify the stamps page — move your cursor over the open passport"
          >
            🔍 {loupe ? 'Put the loupe away' : 'Inspect with loupe'}
          </button>

          {/* Section jump tabs on the panel's outer edge — scroll to the
              full-width sections further down the page */}
          <nav className="cohear-side-tabs cohear-side-tabs--jump" aria-label="Passport sections">
            {jumpSections.map(([id, label, color]) => (
              <button key={id} type="button" data-cuelume-toggle="page" style={{ '--tab': color }} onClick={() => jumpTo(id)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Compact account strip */}
      <div className="cohear-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        {supabaseEnabled ? (
          session?.user && !session.user.is_anonymous ? (
            <>
              <div className="min-w-0 text-xs text-zinc-400">
                <span className="font-semibold text-white">{session.user.email}</span>
                <span className="ml-2 text-zinc-500">{syncMessage || 'Synced across your devices'}</span>
              </div>
              <div className="flex gap-2">
                <button className="cohear-secondary min-h-8 px-3 text-xs" onClick={syncCloud}>Sync now</button>
                <button className="cohear-secondary min-h-8 px-3 text-xs" onClick={signOut}>Sign out</button>
              </div>
            </>
          ) : (
            <form onSubmit={sendMagicLink} className="flex w-full flex-wrap items-center gap-2">
              <input className="cohear-input h-9 flex-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email to save your passport across devices" />
              <button className="cohear-primary min-h-9 px-3 text-xs" disabled={!email.trim()}>Email sign-in link</button>
              {authMessage && <p className="w-full text-xs text-zinc-500">{authMessage}</p>}
            </form>
          )
        ) : (
          <p className="text-xs text-zinc-500">Local guest passport — stamps are collected automatically as you attend shows.</p>
        )}
      </div>

      {/* Maps — chronological journey + per-artist tour routes */}
      {(entries.length > 0 || stubs.length > 0) && (
        <div className="space-y-5" id="pp-maps">
          {entries.length > 0 && <PassportMap entries={entries} home={home} />}
          <ArtistTourMap stubs={stubs} entries={entries} />
        </div>
      )}

      {/* Visas */}
      <PageSection id="pp-visas" title="Visas" caption={`${visas.length} ${visas.length === 1 ? 'country' : 'countries'}`}>
        {!visas.length ? (
          <Empty>No visas yet — open a live room to clear customs.</Empty>
        ) : (
          <div className="grid items-end gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visas.map((visa) => (
              <VisaCard
                key={visa.id}
                visa={visa}
                entryCount={entriesByCountry[visa.country] || 1}
                art={art[visa.id]}
                showArt={Boolean(artView[visa.id])}
                onToggleArt={() => toggleArtView(visa.id)}
                onGenerate={() => generate(visa)}
                generating={genId === visa.id}
              />
            ))}
          </div>
        )}
      </PageSection>

      {/* Entry stamps */}
      <PageSection id="pp-entries" title="Entry stamps" caption={`${entries.length} ${entries.length === 1 ? 'visit' : 'visits'}`}>
        {!entries.length ? (
          <Empty>No entry stamps yet — each city + date you turn up earns one.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-5 px-1 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {entries.map((entry) => <EntryStamp key={entry.id} entry={entry} onOpen={onOpenCity} />)}
          </div>
        )}
      </PageSection>

      {/* Souvenir stamps — one keepsake per entry: stick-on postage or pressed
          ink, scoped to the city / state / country. Assignment is a
          deterministic stand-in until the unique-id backend lands. */}
      <PageSection id="pp-souvenirs" title="Souvenir stamps" caption={`${entries.length} collected · randomly issued`}>
        {!entries.length ? (
          <Empty>No souvenirs yet — every show you attend hands one out.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-5 px-1 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {entries.map((entry) => {
              const sid = `${entry.id}:souvenir`;
              return (
                <SouvenirStamp
                  key={entry.id}
                  entry={entry}
                  art={art[sid]}
                  showArt={Boolean(artView[sid])}
                  onToggleArt={() => toggleArtView(sid)}
                  onGenerate={() => generate({ ...entry, id: sid, type: 'souvenir' })}
                  generating={genId === sid}
                />
              );
            })}
          </div>
        )}
      </PageSection>

      {/* Ticket stubs */}
      <section className="cohear-panel overflow-hidden" id="pp-tickets">
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
                  showArt={Boolean(artView[stub.id])}
                  onToggleArt={() => toggleArtView(stub.id)}
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
      <section className="cohear-panel overflow-hidden" id="pp-history">
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
                    <span className="text-xs text-emerald-300/70">Stamped automatically</span>
                    <button className="cohear-secondary ml-auto min-h-8 px-2.5 text-xs" onClick={() => neverHere(item)} title="Delete this show — removes its stamp, ticket and city from your passport, map and mileage">✕ Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recently deleted */}
      {trash.length > 0 && (
        <section className="cohear-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recently deleted</h3>
              <p className="text-xs text-zinc-500">Items are permanently removed after 30 days.</p>
            </div>
            <button className="cohear-secondary text-xs text-red-400" onClick={() => { emptyTrash(); setTrash([]); }}>
              Empty trash
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {trash.map((item) => {
              const record = item.history || item.stub || item.entries?.[0];
              const daysLeft = Math.max(0, Math.ceil((new Date(item.deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)));
              return (
                <div key={item.concertId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-300">{record?.artist || record?.venue || item.concertId}</div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      {[record?.venue, record?.city, record?.date].filter(Boolean).join(' · ')}
                      {' '}· deleted {new Date(item.deletedAt).toLocaleDateString()} · {daysLeft}d left
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => restoreFromTrash(item.concertId)}>Restore</button>
                    <button className="cohear-secondary min-h-8 px-2.5 text-xs text-red-400" onClick={() => deleteFromTrash(item.concertId)} title="Delete permanently">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Off-screen export sheet — the source for PNG / PDF downloads and the
          print view. Portalled to <body> (outside #root) so the print CSS can
          hide the whole app and show only these pages. */}
      {createPortal(
        <div aria-hidden="true" className="cohear-export-offscreen" style={{ position: 'fixed', top: 0, left: -99999, width: 860, pointerEvents: 'none', zIndex: -1 }}>
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
            art={art}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

function PageSection({ id, title, caption, children }) {
  return (
    <section className="cohear-passport-page overflow-hidden p-4" id={id}>
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

function StatChip({ label, value }) {
  return (
    <div className="cohear-stat-chip">
      <div className="cohear-stat-chip__value">{value}</div>
      <div className="cohear-stat-chip__label">{label}</div>
    </div>
  );
}

function fmtStat(n) {
  return Number(n || 0).toLocaleString('en-US');
}
