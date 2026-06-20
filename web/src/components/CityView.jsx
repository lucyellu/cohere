import { useEffect, useMemo, useState } from 'react';
import { fetchConcerts } from '../concerts.js';
import {
  readEntries,
  readStubs,
  readHistory,
  readVisas,
  readProfile,
  resolveHome,
  cityCoords,
  haversineKm,
} from '../account.js';
import VisaCard from './passport/VisaCard.jsx';
import EntryStamp from './passport/EntryStamp.jsx';

const slugify = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A city "page": everything tied to one city — your entry stamps + the country
// visa, your own record of shows there, and any other concerts in that city
// (past or upcoming) pulled from the concert feed.
export default function CityView({ city, country, onBack, onSyncLive }) {
  const target = slugify(city);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  const entries = useMemo(() => readEntries().filter((e) => slugify(e.city) === target), [target]);
  const stubs = useMemo(() => readStubs().filter((s) => slugify(s.city) === target), [target]);
  const history = useMemo(() => readHistory().filter((h) => slugify(h.city) === target), [target]);
  const resolvedCountry = country || entries[0]?.country || history[0]?.country || '';
  const visa = useMemo(
    () => readVisas().find((v) => slugify(v.country) === slugify(resolvedCountry)),
    [resolvedCountry],
  );

  const home = useMemo(() => resolveHome(readProfile()), []);
  const here = useMemo(() => {
    const fromEntry = entries.find((e) => e.lat != null);
    return cityCoords(city, fromEntry?.lat, fromEntry?.lng);
  }, [city, entries]);
  const milesFromHome = useMemo(() => {
    if (!home || home.lat == null || !here) return null;
    return Math.round(haversineKm(home, here) * 0.621371);
  }, [home, here]);

  // Pull the broad concert feed (past + upcoming) and keep this city's shows.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchConcerts(undefined, 'live', 'upcoming').catch(() => ({ concerts: [] })),
      fetchConcerts(undefined, 'live', 'past').catch(() => ({ concerts: [] })),
    ]).then(([up, past]) => {
      if (!alive) return;
      const all = [...(up.concerts || []), ...(past.concerts || [])];
      const seen = new Set();
      const inCity = all.filter((c) => {
        if (slugify(c.city) !== target) return false;
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setFeed(inCity);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [target]);

  const historyIds = useMemo(() => new Set(history.map((h) => h.id || h.concertId)), [history]);
  const otherShows = useMemo(
    () => feed.filter((c) => !historyIds.has(c.id)),
    [feed, historyIds],
  );

  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  const firstVisit = dates[0];
  const lastVisit = dates[dates.length - 1];

  return (
    <div className="space-y-5">
      <button className="cohear-secondary" onClick={onBack}>← Back to passport</button>

      {/* City hero */}
      <section className="cohear-city-hero">
        <div className="cohear-city-hero__bar" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">Port of entry</div>
            <h2 className="mt-1 truncate text-3xl font-black text-white">{city || 'Unknown city'}</h2>
            <div className="mt-1 text-sm text-zinc-400">{resolvedCountry || '—'}</div>
          </div>
          <div className="flex flex-wrap gap-4 text-right">
            <HeroStat label="Admissions" value={entries.length} />
            <HeroStat label="Tickets" value={stubs.length} />
            {milesFromHome != null && <HeroStat label="From home" value={`${milesFromHome.toLocaleString('en-US')} mi`} />}
          </div>
        </div>
        {(firstVisit || lastVisit) && (
          <div className="relative border-t border-white/10 px-6 py-3 text-xs text-zinc-500">
            {firstVisit && <span>First admitted {firstVisit}</span>}
            {lastVisit && lastVisit !== firstVisit && <span> · Last {lastVisit}</span>}
            {home && here && milesFromHome != null && <span> · {city} is {milesFromHome.toLocaleString('en-US')} mi from {home.city}</span>}
          </div>
        )}
      </section>

      {/* Stamps + visa */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="cohear-passport-page p-4">
          <div className="mb-3 flex items-center justify-between border-b border-black/15 pb-2">
            <h3 className="text-sm font-black uppercase tracking-[0.18em]">Your entry stamps</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] opacity-60">{entries.length}</span>
          </div>
          {entries.length ? (
            <div className="grid grid-cols-2 gap-5 px-1 py-2 sm:grid-cols-3 md:grid-cols-4">
              {entries.map((entry) => <EntryStamp key={entry.id} entry={entry} />)}
            </div>
          ) : (
            <p className="grid min-h-24 place-items-center text-sm text-black/50">No entry stamps for this city yet.</p>
          )}
        </div>
        <div className="cohear-panel p-4">
          <p className="cohear-label mb-3">Visa</p>
          {visa ? (
            <VisaCard visa={visa} entryCount={entries.length} />
          ) : (
            <p className="text-sm leading-6 text-zinc-500">No visa for {resolvedCountry || 'this country'} yet.</p>
          )}
        </div>
      </section>

      {/* Your record of shows here */}
      {history.length > 0 && (
        <section className="cohear-panel overflow-hidden">
          <SectionHeader title={`Your shows in ${city}`} caption={`${history.length} ${history.length === 1 ? 'record' : 'records'}`} />
          <div className="grid gap-2 p-3">
            {history.map((item) => (
              <ConcertRow key={item.id} concert={item} owned onSyncLive={onSyncLive} />
            ))}
          </div>
        </section>
      )}

      {/* Everything else in the city */}
      <section className="cohear-panel overflow-hidden">
        <SectionHeader title={`More concerts in ${city}`} caption={loading ? 'Loading…' : `${otherShows.length} found`} />
        <div className="grid gap-2 p-3">
          {loading ? (
            <p className="grid min-h-20 place-items-center text-sm text-zinc-500">Searching the concert feed…</p>
          ) : otherShows.length ? (
            otherShows.map((c) => <ConcertRow key={c.id} concert={c} onSyncLive={onSyncLive} />)
          ) : (
            <p className="grid min-h-20 place-items-center text-sm text-zinc-500">
              No other concerts found in {city} right now. Stamps live forever — check back as new shows appear.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function HeroStat({ label, value }) {
  return (
    <div>
      <div className="font-mono text-2xl font-black tabular-nums text-white">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</div>
    </div>
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

function ConcertRow({ concert, owned, onSyncLive }) {
  const past = concert.when === 'past' || concert.status;
  const place = [concert.venue, concert.city].filter(Boolean).join(' · ');
  const attended = concert.status === 'attended';
  return (
    <article className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{concert.artist || concert.venue}</div>
        <div className="mt-1 truncate text-xs text-zinc-500">{place || '—'}</div>
        <div className="mt-1 text-xs text-zinc-600">{concert.date || 'Date TBA'}</div>
      </div>
      <div className="flex flex-col items-end gap-2">
        {owned && (
          <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${attended ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'}`}>
            {attended ? 'Stamped' : 'Visited'}
          </span>
        )}
        <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => onSyncLive?.(concert)}>
          {past ? 'Open replay' : 'Join live'}
        </button>
      </div>
    </article>
  );
}
