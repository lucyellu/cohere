import { useMemo, useRef, useState } from 'react';
import { hashString, passportIdentity, ticketPalette, regionInk } from './palette.js';
import VisaStamp from './VisaStamp.jsx';
import RubberStamp from './RubberStamp.jsx';
import Magnifier from './Magnifier.jsx';
import QrBadge from './QrBadge.jsx';
import SignaturePad from './SignaturePad.jsx';
import { formatStampDate } from './EntryStamp.jsx';
import { fileToAvatar, generateAvatar } from './avatar.js';
import { COUNTRY_OPTIONS, visaRuleFor, cityCoords } from '../../account.js';

const PER_PAGE = 12;

// The passport as an open two-page book spread (like a real passport): the
// identity/photo page on the left, and the collected visas, entry stamps and
// ticket stubs laid out as stamps on the right — paged through like a booklet.
// Stats and distance are rendered OUTSIDE the passport by the parent.
export default function PassportSpread({
  profile,
  onName,
  onAvatar,
  onHome,
  onHomeCity,
  onHomeCityCommit,
  onSignature,
  photoGender,
  onPhotoGender,
  identitySeed,
  memberSince,
  loupe = false,
  home = null,
  visas = [],
  entries = [],
  stubs = [],
  onOpenCity,
}) {
  const name = (profile.name || '').trim();
  const display = name || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const { no: passportNo, qr: qrValue } = passportIdentity(profile, seed);
  const initials = display.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tint = hashString(`${seed}:tint`) % 360;

  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [signOpen, setSignOpen] = useState(false);

  const items = useMemo(() => [
    ...visas.map((x) => ({ key: `v-${x.id}`, kind: 'visa', data: x })),
    ...entries.map((x) => ({ key: `e-${x.id}`, kind: 'entry', data: x })),
    ...stubs.map((x) => ({ key: `t-${x.serial || x.id}`, kind: 'ticket', data: x })),
  ], [visas, entries, stubs]);

  // Journey chart page — appended after the stamp pages when any entry (or
  // home) can be placed on the map.
  const chartPoints = useMemo(() => {
    const pts = [];
    if (home?.lat != null) pts.push({ city: home.city || 'Home', lat: home.lat, lng: home.lng, home: true });
    const placed = [...entries]
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .map((e) => ({ city: e.city, coords: cityCoords(e.city, e.lat, e.lng) }))
      .filter((x) => x.city && x.coords);
    for (const { city, coords } of placed) pts.push({ city, ...coords });
    return pts;
  }, [entries, home]);
  const hasChart = chartPoints.filter((p) => !p.home).length > 0;

  const itemPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const pageCount = itemPages + (hasChart ? 1 : 0);
  const chartIndex = hasChart ? pageCount - 1 : -1;
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const onChart = hasChart && safePage === chartIndex;
  const pageItems = items.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  // First page of each section — the fore-edge index tabs flip straight there.
  const bookTabs = [
    ...(visas.length ? [['Visas', 0, '#b98a2f']] : []),
    ...(entries.length ? [['Stamps', Math.floor(visas.length / PER_PAGE), '#3a7d4f']] : []),
    ...(stubs.length ? [['Tickets', Math.floor((visas.length + entries.length) / PER_PAGE), '#8a3f93']] : []),
    ...(hasChart ? [['Maps', chartIndex, '#c2543a']] : []),
  ];

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
    <>
    <div className="cohear-spread">
      {/* LEFT PAGE — identity, laid out like a national passport data card:
          PASSPORT kicker + big country name + biometric chip symbol up top,
          QR with vertical serial bottom-left, bearer signature bottom-right. */}
      <div className="cohear-spread__page cohear-passport-page left" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-start justify-between gap-2 border-b border-black/20 pb-2">
          <div className="pt-0.5">
            <div className="text-[10px] font-black uppercase tracking-[0.3em]">Passport</div>
            <div className="mt-1 h-px w-14 bg-black/40" aria-hidden="true" />
            <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.2em] opacity-55">Passeport</div>
          </div>
          <div className="text-center leading-none">
            <div className="text-[21px] font-black tracking-[0.16em]">COHERE</div>
            <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.24em] opacity-60">Citizen of Live Music</div>
          </div>
          <ChipIcon className="mt-0.5 h-6 w-6 shrink-0 opacity-70" />
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
            <NumberedField n="3" label="Home city">
              <input
                className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-[13px] font-bold outline-none placeholder:text-black/30 focus:border-black/60"
                value={profile.homeCity || ''}
                onChange={(e) => onHomeCity?.(e.target.value)}
                onBlur={(e) => onHomeCityCommit?.(e.target.value)}
                placeholder="e.g. Vancouver"
                maxLength={40}
                title="Where your journeys start and end — distances are measured from here"
              />
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

        {/* Endorsements — fills the middle of the page like a real passport */}
        <div className="mt-3 border-t border-black/10 pt-2">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] opacity-45">Endorsements</div>
          <div className="mt-1 font-mono text-[9px] leading-relaxed opacity-55">
            This passport is the property of Cohere. It is not transferable.
            The bearer is a citizen of live music and is entitled to free
            passage through all concert venues worldwide.
          </div>
        </div>

        {/* Bottom of the data card: QR + vertical serial (left), bearer
            signature over its rule (right) — like the reference card. */}
        <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4 pt-3">
          <div className="flex items-end gap-1.5">
            <QrBadge value={qrValue} size={72} title="Scan to verify this passport" />
            <span className="cohear-idpage__serial" title="Passport serial number">{passportNo}</span>
          </div>
          <div className="min-w-0">
            <button
              type="button"
              className="cohear-idpage__sign-btn"
              onClick={() => setSignOpen(true)}
              title={profile.signature ? 'Redo your signature' : 'Sign your passport'}
            >
              {profile.signature ? (
                <img src={profile.signature} alt="Bearer's signature" className="cohear-idpage__sig" />
              ) : (
                <span className="text-[10px] italic opacity-45">Tap to sign</span>
              )}
            </button>
            <div className="mt-1 border-t border-black/50 pt-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] opacity-60">
              Signature of bearer / Signature du titulaire
            </div>
          </div>
        </div>

        {/* Machine-readable zone */}
        <pre className="mt-2 whitespace-pre-wrap break-all border-t border-black/15 pt-2 font-mono text-[10px] leading-tight tracking-[0.04em] opacity-80">{mrz(display, passportNo)}</pre>

        <SignaturePad
          open={signOpen}
          hasSignature={Boolean(profile.signature)}
          onSave={onSignature}
          onClose={() => setSignOpen(false)}
        />
      </div>

      {/* RIGHT PAGE — stamps / pages */}
      <div className="cohear-spread__page cohear-passport-page right">
        <div className="flex items-center justify-between border-b border-black/15 pb-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.24em]">{onChart ? 'Journey log' : 'Stamps & visas'}</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-60">
            {pageCount > 1 || items.length ? `Page ${safePage + 1}/${pageCount}` : 'Empty'}
          </span>
        </div>

        {/* Side-mounted page navigation — arrows hug the page edges */}
        {pageCount > 1 && (
          <>
            <SideArrow side="left" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>‹</SideArrow>
            <SideArrow side="right" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage === pageCount - 1}>›</SideArrow>
          </>
        )}

        {onChart ? (
          <Magnifier active={loupe} zoom={2.4} size={150} content={<JourneyChart points={chartPoints} />}>
            <JourneyChart points={chartPoints} />
          </Magnifier>
        ) : items.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center px-6 text-center text-sm leading-6 opacity-60">
            Your visas, entry stamps and ticket stubs land on these pages automatically as you attend shows.
          </div>
        ) : (
          /* the loupe magnifies the whole page area — everything on it is small */
          <Magnifier active={loupe} zoom={2.4} size={150} content={
            <div className="cohear-spread__stamps">
              {pageItems.map((it, i) => <StampTile key={it.key} item={it} i={i} />)}
            </div>
          }>
            <div className="cohear-spread__stamps">
              {pageItems.map((it, i) => <StampTile key={it.key} item={it} i={i} onOpenCity={onOpenCity} />)}
            </div>
          </Magnifier>
        )}

        {pageCount > 1 && (
          <div className="mt-auto flex items-center justify-center gap-1.5 pt-2">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                className={`h-2 w-2 rounded-full border border-black/40 transition ${i === safePage ? 'bg-black/70' : 'bg-transparent hover:bg-black/20'}`}
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Sticky index tabs on the fore-edge — flip straight to the page where
        each section of the book starts. */}
    {bookTabs.length > 0 && (
      <nav className="cohear-side-tabs" aria-label="Passport pages">
        {bookTabs.map(([label, target, color]) => (
          <button
            key={label}
            type="button"
            className={safePage === target ? 'is-active' : ''}
            style={{ '--tab': color }}
            onClick={() => setPage(target)}
          >
            {label}
          </button>
        ))}
      </nav>
    )}
    </>
  );
}

// --- Journey chart page --------------------------------------------------------
// A navigator's chart inked straight on the passport paper: every stamped city
// on a simple lat/lng projection fitted to the trip, dashed route in visit
// order, home marked with a double ring. No map tiles — just chart ink.
function JourneyChart({ points = [] }) {
  const W = 320;
  const H = 236;
  const PAD = 28;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  // fit the trip's bounding box, with a minimum span so one city doesn't zoom to a blank page
  const fit = (min, max, minSpan) => {
    const span = Math.max(max - min, minSpan) * 1.24;
    const mid = (min + max) / 2;
    return [mid - span / 2, mid + span / 2];
  };
  const [minLat, maxLat] = fit(Math.min(...lats), Math.max(...lats), 14);
  const [minLng, maxLng] = fit(Math.min(...lngs), Math.max(...lngs), 24);
  const x = (lng) => PAD + ((lng - minLng) / (maxLng - minLng)) * (W - PAD * 2);
  const y = (lat) => PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - PAD * 2);

  const seen = new Map();
  for (const p of points) if (!seen.has(p.city)) seen.set(p.city, p);
  const cities = [...seen.values()];
  const route = points.map((p) => `${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ');
  const ink = '#2f5fb4';

  return (
    <div className="cohear-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Journey chart">
        {/* graticule */}
        <g stroke="rgba(0,0,0,0.13)" strokeWidth="0.6">
          {[1, 2, 3].map((i) => (
            <line key={`h${i}`} x1={8} y1={(H / 4) * i} x2={W - 8} y2={(H / 4) * i} strokeDasharray="1 3" />
          ))}
          {[1, 2, 3, 4].map((i) => (
            <line key={`v${i}`} x1={(W / 5) * i} y1={8} x2={(W / 5) * i} y2={H - 8} strokeDasharray="1 3" />
          ))}
        </g>
        <rect x="6" y="6" width={W - 12} height={H - 12} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        <rect x="10" y="10" width={W - 20} height={H - 20} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />

        {/* dashed route in visit order */}
        {points.length > 1 && (
          <polyline points={route} fill="none" stroke="#b4452f" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.75" />
        )}

        {/* city marks + labels */}
        {cities.map((p) => (
          <g key={p.city} transform={`translate(${x(p.lng)} ${y(p.lat)})`}>
            {p.home ? (
              <>
                <circle r="5" fill="none" stroke={ink} strokeWidth="1.2" />
                <circle r="1.8" fill={ink} />
              </>
            ) : (
              <circle r="2.6" fill={ink} opacity="0.85" />
            )}
            <text
              x="5.5"
              y="-4"
              fontSize="7"
              fontWeight="700"
              fontFamily='ui-monospace, "Courier New", monospace'
              fill="rgba(0,0,0,0.72)"
              style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              {p.city}
            </text>
          </g>
        ))}

        {/* compass rose */}
        <g transform={`translate(${W - 32} 34)`} stroke="rgba(0,0,0,0.55)" fill="rgba(0,0,0,0.55)">
          <path d="M0 -12 L2.6 0 L0 12 L-2.6 0 Z" strokeWidth="0" />
          <path d="M-12 0 L0 2.6 L12 0 L0 -2.6 Z" strokeWidth="0" opacity="0.45" />
          <text x="0" y="-15" fontSize="7" fontWeight="800" textAnchor="middle" stroke="none">N</text>
        </g>
      </svg>
      <div className="cohear-chart__caption">
        {cities.filter((c) => !c.home).length} {cities.filter((c) => !c.home).length === 1 ? 'port' : 'ports'} of call · route in order of entry
      </div>
    </div>
  );
}

// --- Stamp tiles --------------------------------------------------------------
function StampTile({ item, i, onOpenCity }) {
  const rot = ((i * 53) % 9) - 4; // gentle scatter, like a real page
  if (item.kind === 'visa') return <VisaTile visa={item.data} rot={rot} />;
  if (item.kind === 'entry') return <EntryRubberStamp entry={item.data} rot={rot} onOpenCity={onOpenCity} />;
  return <MiniStub stub={item.data} rot={rot} onOpenCity={onOpenCity} />;
}

// The real landscape visa stamp, seated small on the spread page.
function VisaTile({ visa, rot }) {
  const rule = visa.rule || visaRuleFor(visa.country);
  return (
    <div className="cohear-mvisa" style={{ transform: `rotate(${rot}deg)` }} title={`${visa.country} — ${rule?.label || 'Visa'}`}>
      <VisaStamp visa={{ ...visa, rule }} />
    </div>
  );
}

function EntryRubberStamp({ entry, rot, onOpenCity }) {
  const interactive = Boolean(onOpenCity);
  return (
    <RubberStamp
      id={entry.id}
      city={entry.city}
      date={formatStampDate(entry.date || entry.issuedAt)}
      ink={regionInk(entry.country, entry.city || entry.id)}
      className={interactive ? 'cohear-rubber--link' : ''}
      style={{ '--rot': `${rot}deg` }}
      title={`${entry.city}${entry.date ? ` · ${entry.date}` : ''}`}
      onClick={interactive ? () => onOpenCity(entry) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpenCity(entry) : undefined}
    />
  );
}

// A miniature of the real ticket stub — same dark header / paper body /
// perforated counterfoil — scaled to drop onto a passport page.
function MiniStub({ stub, rot, onOpenCity }) {
  const pal = ticketPalette(stub.artist || stub.id);
  const mint = String(stub.mintNo ?? stub.edition ?? 1).padStart(4, '0');
  const interactive = Boolean(onOpenCity && stub.city);
  return (
    <article
      className={`cohear-ministub ${interactive ? 'cohear-stub--link' : ''}`}
      style={{ '--paper': pal.paper, '--ink': pal.ink, '--accent': pal.accent, transform: `rotate(${rot}deg)` }}
      onClick={interactive ? () => onOpenCity(stub.city, stub.country) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpenCity(stub.city, stub.country) : undefined}
      title={`${stub.artist || ''}${stub.venue ? ` · ${stub.venue}` : ''}`}
    >
      <div className="cohear-ministub__main">
        <div className="cohear-ministub__head">
          <span className="truncate">{stub.artist || 'Live Concert'}</span>
          <span className="cohear-ministub__admit">Admit One</span>
        </div>
        <div className="cohear-ministub__venue">{stub.venue || '—'}</div>
        <div className="cohear-ministub__meta">{[stub.city, (stub.date || '').slice(0, 10)].filter(Boolean).join(' · ') || '—'}</div>
        <div className="cohear-ministub__barcode" aria-hidden="true" />
      </div>
      <div className="cohear-ministub__side">
        <span className="cohear-ministub__side-label">Admit</span>
        <span className="cohear-ministub__no">#{mint}</span>
      </div>
    </article>
  );
}

// --- Small bits ---------------------------------------------------------------
// ICAO biometric-passport symbol: a chip circle between two bars.
function ChipIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" {...props}>
      <rect x="2" y="5.5" width="20" height="13" rx="3" />
      <circle cx="12" cy="12" r="3.1" />
      <path d="M2 12h6.9M15.1 12H22" />
    </svg>
  );
}

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

function SideArrow({ side, children, ...props }) {
  return (
    <button
      type="button"
      className={`cohear-spread__nav cohear-spread__nav--${side}`}
      aria-label={side === 'left' ? 'Previous page' : 'Next page'}
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



function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function mrz(name, passportNo) {
  const surname = name.split(/\s+/).slice(-1)[0] || 'TRAVELLER';
  const given = name.split(/\s+/).slice(0, -1).join('<') || name.replace(/\s+/g, '<');
  const pad = (s, n) => (s.toUpperCase().replace(/[^A-Z<]/g, '<') + '<'.repeat(n)).slice(0, n);
  const line1 = `P<COH${pad(surname, 10)}<<${pad(given, 26)}`.slice(0, 44).padEnd(44, '<');
  const line2 = pad(`${passportNo}<COH`.replace(/[^A-Z0-9<]/g, '<'), 44);
  return `${line1}\n${line2}`;
}
