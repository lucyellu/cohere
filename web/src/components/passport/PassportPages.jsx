import { useMemo, useState } from 'react';
import { hashString } from './palette.js';
import { visaRuleFor } from '../../account.js';

// A flip-through passport booklet (portrait, like the real thing): an identity
// page followed by pages of the visas, entry stamps and ticket stubs you've
// collected. Page through with the arrows or by tapping the left/right edge.
export default function PassportPages({ profile, identitySeed, memberSince, stats, visas = [], entries = [], stubs = [] }) {
  const name = (profile?.name || '').trim() || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);

  const pages = useMemo(() => {
    const out = [{ kind: 'id', title: 'Identity' }];
    for (const group of chunk(visas, 6)) out.push({ kind: 'visas', title: 'Visas', items: group });
    for (const group of chunk(entries, 6)) out.push({ kind: 'stamps', title: 'Entry stamps', items: group });
    for (const group of chunk(stubs, 3)) out.push({ kind: 'tickets', title: 'Ticket stubs', items: group });
    return out;
  }, [visas, entries, stubs]);

  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState('next');
  const page = pages[Math.min(idx, pages.length - 1)];

  function go(n) {
    const next = Math.max(0, Math.min(pages.length - 1, n));
    if (next === idx) return;
    setDir(next > idx ? 'next' : 'prev');
    setIdx(next);
  }

  return (
    <section className="cohear-passport-page overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-3">
        <h3 className="text-sm font-black uppercase tracking-[0.18em]">Passport pages</h3>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] opacity-60">
          {page.title} · {idx + 1}/{pages.length}
        </span>
      </div>

      <div className="grid place-items-center px-4 py-6">
        <div className="cohear-pbook">
          <div key={idx} className={`cohear-pbook__leaf turn-${dir}`}>
            <div className="cohear-pbook__page cohear-passport-page">
              {page.kind === 'id' && (
                <IdentityPage name={name} profile={profile} passportNo={passportNo} memberSince={memberSince} stats={stats} />
              )}
              {page.kind === 'visas' && <VisaPage items={page.items} />}
              {page.kind === 'stamps' && <StampPage items={page.items} />}
              {page.kind === 'tickets' && <TicketPage items={page.items} />}
            </div>
          </div>

          <button className="cohear-pbook__nav left" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous page">‹</button>
          <button className="cohear-pbook__nav right" onClick={() => go(idx + 1)} disabled={idx === pages.length - 1} aria-label="Next page">›</button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {pages.map((p, i) => (
            <button
              key={i}
              className={`h-2 w-2 rounded-full border border-black/40 transition ${i === idx ? 'bg-black/70' : 'bg-transparent hover:bg-black/20'}`}
              onClick={() => go(i)}
              aria-label={`Go to ${p.title} page ${i + 1}`}
              title={p.title}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function IdentityPage({ name, profile, passportNo, memberSince, stats }) {
  const tint = hashString(`${name}:tint`) % 360;
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-black/15 pb-1.5">
        <span className="text-[10px] font-black uppercase tracking-[0.28em]">Passport</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">Cohere</span>
      </div>
      <div className="mt-3 flex gap-3">
        <div
          className="grid h-[96px] w-[78px] flex-none place-items-center overflow-hidden rounded text-2xl font-black text-white/90"
          style={profile?.avatar ? undefined : { background: `linear-gradient(150deg, hsl(${tint} 45% 42%), hsl(${(tint + 40) % 360} 40% 28%))` }}
        >
          {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : <span>{initials || '☻'}</span>}
        </div>
        <div className="min-w-0 text-[11px] leading-relaxed">
          <FieldLine label="Name" value={name} />
          <FieldLine label="Country" value={profile?.homeCountry || '—'} />
          <FieldLine label="No." value={passportNo} mono />
          <FieldLine label="Since" value={memberSince || '—'} mono />
        </div>
      </div>
      <div className="mt-auto grid grid-cols-5 gap-1.5 pt-3">
        <Stat label="Ctry" value={stats?.countries ?? 0} />
        <Stat label="City" value={stats?.cities ?? 0} />
        <Stat label="Entry" value={stats?.visits ?? 0} />
        <Stat label="Art" value={stats?.artists ?? 0} />
        <Stat label="Tix" value={stats?.stubs ?? 0} />
      </div>
    </div>
  );
}

function VisaPage({ items }) {
  return (
    <PageBody title="Visas">
      <div className="grid grid-cols-2 gap-2">
        {items.map((v) => {
          const rule = v.rule || visaRuleFor(v.country);
          return (
            <div key={v.id} className="relative overflow-hidden rounded border border-black/20 bg-white/30 p-2 pl-2.5">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: rule?.accent || '#3b82f6' }} />
              <div className="truncate text-[11px] font-black uppercase tracking-wide">{v.country}</div>
              <div className="mt-0.5 truncate text-[8px] font-semibold uppercase tracking-wide opacity-65">{rule?.label || 'Tourist Visa'}</div>
              <div className="mt-1 font-mono text-[8px] opacity-60">{v.serial}</div>
            </div>
          );
        })}
      </div>
    </PageBody>
  );
}

function StampPage({ items }) {
  return (
    <PageBody title="Entry stamps">
      <div className="grid grid-cols-3 gap-x-2 gap-y-4 pt-1">
        {items.map((e, i) => (
          <div key={e.id} className="cohear-entry" style={{ '--rot': `${((i * 37) % 13) - 6}deg`, minHeight: 64, padding: '0.35rem 0.3rem' }}>
            <div className="cohear-entry__city" style={{ fontSize: 11 }}>{e.city}</div>
            <div className="cohear-entry__date" style={{ fontSize: 8 }}>{(e.date || '').slice(5) || '—'}</div>
            <div className="cohear-entry__sub" style={{ fontSize: 7 }}>Entry</div>
          </div>
        ))}
      </div>
    </PageBody>
  );
}

function TicketPage({ items }) {
  return (
    <PageBody title="Ticket stubs">
      <div className="grid gap-2">
        {items.map((s) => (
          <div key={s.serial || s.id} className="flex items-center gap-2 rounded border border-black/20 bg-white/30 p-2">
            <div className="grid h-9 w-9 flex-none place-items-center rounded bg-black/80 text-[8px] font-black uppercase text-[var(--cohear-parchment)]">Tix</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-black">{s.artist || s.venue}</div>
              <div className="truncate text-[9px] opacity-65">{[s.venue, s.city].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right font-mono text-[8px] opacity-65">
              <div>{s.date || '—'}</div>
              {s.seat && <div>{s.seat.section} {s.seat.row}{s.seat.seat}</div>}
            </div>
          </div>
        ))}
      </div>
    </PageBody>
  );
}

function PageBody({ title, children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between border-b border-black/15 pb-1.5">
        <span className="text-[10px] font-black uppercase tracking-[0.24em]">{title}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-60">Cohere</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function FieldLine({ label, value, mono }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12 flex-none text-[8px] font-semibold uppercase tracking-wide opacity-55">{label}</span>
      <span className={`min-w-0 truncate font-bold ${mono ? 'font-mono text-[10px]' : 'text-[12px]'}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-black/10 bg-black/[0.03] px-1 py-1 text-center">
      <div className="font-mono text-sm font-black leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.06em] opacity-55">{label}</div>
    </div>
  );
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
