import { useMemo, useRef, useState } from 'react';
import { hashString } from './palette.js';
import { fileToAvatar, generateAvatar } from './avatar.js';
import { COUNTRY_OPTIONS, visaRuleFor } from '../../account.js';

const PER_PAGE = 6;

// The passport as an open two-page book spread (like a real passport): the
// identity/photo page on the left, and the collected visas, entry stamps and
// ticket stubs laid out as stamps on the right — paged through like a booklet.
export default function PassportSpread({
  profile,
  onName,
  onAvatar,
  onHome,
  photoGender,
  onPhotoGender,
  identitySeed,
  memberSince,
  stats,
  travel,
  home,
  visas = [],
  entries = [],
  stubs = [],
  onOpenCity,
}) {
  const name = (profile.name || '').trim();
  const display = name || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);
  const initials = display.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tint = hashString(`${seed}:tint`) % 360;
  const homeLocated = Boolean(home && home.lat != null);

  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const items = useMemo(() => [
    ...visas.map((x) => ({ key: `v-${x.id}`, kind: 'visa', data: x })),
    ...entries.map((x) => ({ key: `e-${x.id}`, kind: 'entry', data: x })),
    ...stubs.map((x) => ({ key: `t-${x.serial || x.id}`, kind: 'ticket', data: x })),
  ], [visas, entries, stubs]);

  const pageCount = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setBusy('upload');
    try { onAvatar?.(await fileToAvatar(file)); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function onGenerate() {
    setError(''); setBusy('generate');
    try { onAvatar?.(await generateAvatar(name, photoGender || 'neutral')); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  return (
    <div className="cohear-spread">
      {/* LEFT PAGE — identity */}
      <div className="cohear-spread__page cohear-passport-page left">
        <div className="flex items-center justify-between border-b border-black/15 pb-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.28em]">Passport</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">Cohere · Citizen of Live Music</span>
        </div>

        <div className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-3">
          {/* Photo + controls */}
          <div className="space-y-1.5">
            <div
              className="cohear-book__photo relative grid h-[144px] w-[112px] place-items-center overflow-hidden text-3xl font-black text-white/90"
              style={profile.avatar ? undefined : { background: `linear-gradient(150deg, hsl(${tint} 45% 42%), hsl(${(tint + 40) % 360} 40% 28%))` }}
            >
              {profile.avatar ? (
                <img src={profile.avatar} alt="Passport photo" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span>{initials || '☻'}</span>
              )}
              {busy && (
                <div className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-semibold uppercase tracking-wider text-white">
                  {busy === 'generate' ? 'Generating…' : 'Loading…'}
                </div>
              )}
            </div>
            <div className="flex gap-1">
              <PhotoBtn onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>Upload</PhotoBtn>
              <PhotoBtn onClick={onGenerate} disabled={Boolean(busy)}>✨</PhotoBtn>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
            <select
              className="w-full rounded border border-black/25 bg-black/[0.04] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide outline-none focus:border-black/60"
              value={photoGender || 'neutral'}
              onChange={(e) => onPhotoGender?.(e.target.value)}
              title="Steers the AI passport photo style"
            >
              <option value="neutral">Neutral</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            {profile.avatar && (
              <button type="button" className="text-[9px] underline opacity-60 hover:opacity-100" onClick={() => onAvatar?.('')} disabled={Boolean(busy)}>
                Remove
              </button>
            )}
            {error && <p className="text-[9px] leading-tight text-red-700">{error}</p>}
          </div>

          {/* Identity fields */}
          <div className="grid content-start gap-2">
            <NumberedField n="1" label="Name">
              <input
                className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-[15px] font-bold outline-none placeholder:text-black/30 focus:border-black/60"
                value={profile.name || ''}
                onChange={(e) => onName(e.target.value)}
                placeholder="Add your name"
                maxLength={28}
              />
            </NumberedField>
            <NumberedField n="2" label="Nationality">
              <select
                className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-[13px] font-bold outline-none focus:border-black/60"
                value={profile.homeCountry || ''}
                onChange={(e) => onHome?.(e.target.value)}
              >
                <option value="">Select your country…</option>
                {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </NumberedField>
            <div className="grid grid-cols-2 gap-2">
              <KV label="Type" value="P" mono />
              <KV label="Authority" value="COHERE" mono />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KV label="Passport No" value={passportNo} mono />
              <KV label="Issued" value={memberSince || '—'} mono />
            </div>
          </div>
        </div>

        {/* Distance travelled */}
        <div className="cohear-book__miles mt-3">
          <span className="cohear-book__globe" aria-hidden="true">🌍</span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-70">Distance travelled</div>
            <div className="font-mono text-2xl font-black leading-none tabular-nums">
              {fmtNum(Math.round(travel?.miles || 0))} <span className="text-sm font-bold">mi</span>
            </div>
            <div className="font-mono text-[11px] font-semibold opacity-70">{fmtNum(Math.round(travel?.km || 0))} km · {travel?.stops || 0} stops</div>
          </div>
          {!homeLocated && (travel?.stops || 0) > 0 && (
            <span className="ml-auto max-w-[120px] text-right text-[9px] leading-tight opacity-60">Pick a country to count the trip out &amp; back</span>
          )}
        </div>

        {/* Stat chips */}
        <div className="mt-2.5 grid grid-cols-5 gap-2">
          <Stat label="Countries" value={stats.countries} />
          <Stat label="Cities" value={stats.cities} />
          <Stat label="Entries" value={stats.visits} />
          <Stat label="Artists" value={stats.artists} />
          <Stat label="Tickets" value={stats.stubs} />
        </div>

        {/* Machine-readable zone */}
        <pre className="mt-2.5 whitespace-pre-wrap break-all border-t border-black/15 pt-2 font-mono text-[10px] leading-tight tracking-[0.04em] opacity-80">{mrz(display, passportNo, stats)}</pre>
      </div>

      {/* RIGHT PAGE — stamps / pages */}
      <div className="cohear-spread__page cohear-passport-page right">
        <div className="flex items-center justify-between border-b border-black/15 pb-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.24em]">Stamps &amp; visas</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-60">
            {items.length ? `Page ${safePage + 1}/${pageCount}` : 'Empty'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center px-6 text-center text-sm leading-6 opacity-60">
            Your visas, entry stamps and ticket stubs land on these pages automatically as you attend shows.
          </div>
        ) : (
          <div className="cohear-spread__stamps">
            {pageItems.map((it, i) => <StampTile key={it.key} item={it} i={i} onOpenCity={onOpenCity} />)}
          </div>
        )}

        {pageCount > 1 && (
          <div className="mt-1 flex items-center justify-center gap-3">
            <PageArrow onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>‹</PageArrow>
            <div className="flex gap-1.5">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  className={`h-2 w-2 rounded-full border border-black/40 transition ${i === safePage ? 'bg-black/70' : 'bg-transparent hover:bg-black/20'}`}
                  onClick={() => setPage(i)}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
            <PageArrow onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage === pageCount - 1}>›</PageArrow>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Stamp tiles --------------------------------------------------------------
function StampTile({ item, i, onOpenCity }) {
  const rot = ((i * 53) % 11) - 5; // gentle scatter, like a real page
  if (item.kind === 'visa') return <VisaStamp visa={item.data} rot={rot} />;
  if (item.kind === 'entry') return <EntryRubberStamp entry={item.data} rot={rot} onOpenCity={onOpenCity} />;
  return <TicketStamp stub={item.data} rot={rot} />;
}

function VisaStamp({ visa, rot }) {
  const rule = visa.rule || visaRuleFor(visa.country);
  return (
    <div
      className="grid h-[72px] w-full place-items-center rounded-md border-2 px-1.5 text-center"
      style={{ borderColor: rule?.accent || '#3b82f6', color: rule?.accent || '#3b82f6', transform: `rotate(${rot}deg)`, borderStyle: 'double' }}
      title={`${visa.country} — ${rule?.label || 'Visa'}`}
    >
      <div className="text-[7px] font-black tracking-[0.2em]">✦ VISA ✦</div>
      <div className="text-[12px] font-black uppercase leading-tight">{visa.country}</div>
      <div className="text-[7px] font-semibold uppercase tracking-wide opacity-80">{rule?.label || 'Tourist Visa'}</div>
    </div>
  );
}

function EntryRubberStamp({ entry, rot, onOpenCity }) {
  const interactive = Boolean(onOpenCity);
  return (
    <div
      className={`cohear-entry ${interactive ? 'cohear-entry--link' : ''}`}
      style={{ '--rot': `${rot}deg`, minHeight: 72, width: '100%', padding: '0.4rem 0.3rem' }}
      onClick={interactive ? () => onOpenCity(entry) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpenCity(entry) : undefined}
      title={`${entry.city}${entry.date ? ` · ${entry.date}` : ''}`}
    >
      <div className="cohear-entry__city" style={{ fontSize: 11 }}>{entry.city}</div>
      <div className="cohear-entry__date" style={{ fontSize: 8 }}>{(entry.date || '').slice(5) || '—'}</div>
      <div className="cohear-entry__sub" style={{ fontSize: 7 }}>Entry</div>
    </div>
  );
}

function TicketStamp({ stub, rot }) {
  return (
    <div
      className="grid h-[72px] w-full place-content-center rounded border border-black/40 bg-black/[0.04] px-1.5 text-center"
      style={{ transform: `rotate(${rot}deg)` }}
      title={`${stub.artist || ''}${stub.venue ? ` · ${stub.venue}` : ''}`}
    >
      <div className="text-[7px] font-black tracking-[0.18em] text-[color:var(--accent,#b4452f)]">ADMIT ONE</div>
      <div className="truncate text-[11px] font-black leading-tight">{stub.artist || stub.venue}</div>
      <div className="truncate text-[7px] opacity-65">{stub.city || ''}</div>
      {stub.seat && <div className="font-mono text-[7px] opacity-60">{stub.seat.section} {stub.seat.row}{stub.seat.seat}</div>}
    </div>
  );
}

// --- Small bits ---------------------------------------------------------------
function PhotoBtn({ children, ...props }) {
  return (
    <button
      type="button"
      className="flex-1 rounded border border-black/25 bg-black/[0.04] px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-black/[0.08] disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

function PageArrow({ children, ...props }) {
  return (
    <button
      type="button"
      className="grid h-7 w-7 place-items-center rounded-full border border-black/30 bg-black/[0.04] text-base font-bold leading-none hover:bg-black/[0.1] disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function NumberedField({ n, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] opacity-60">
        <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-black/30 text-[8px]">{n}</span>
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function KV({ label, value, mono }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-55">{label}</div>
      <div className={`mt-0.5 font-bold ${mono ? 'font-mono text-[12px]' : 'text-[13px]'}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-black/10 bg-black/[0.03] px-1 py-1 text-center">
      <div className="font-mono text-base font-black leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.06em] opacity-55">{label}</div>
    </div>
  );
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function mrz(name, passportNo, stats) {
  const surname = name.split(/\s+/).slice(-1)[0] || 'TRAVELLER';
  const given = name.split(/\s+/).slice(0, -1).join('<') || name.replace(/\s+/g, '<');
  const pad = (s, n) => (s.toUpperCase().replace(/[^A-Z<]/g, '<') + '<'.repeat(n)).slice(0, n);
  const line1 = `P<COH${pad(surname, 10)}<<${pad(given, 26)}`.slice(0, 44).padEnd(44, '<');
  const code = `${passportNo}<COH<${stats.countries}C${stats.cities}T${stats.visits}E${stats.stubs}S`;
  const line2 = pad(code.replace(/[^A-Z0-9<]/g, '<'), 44);
  return `${line1}\n${line2}`;
}
