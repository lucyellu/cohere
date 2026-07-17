import { forwardRef } from 'react';
import { hashString, regionInk, ticketPalette, ticketTypography, barcodeBars, stampRotation } from './palette.js';
import { formatStampDate } from './EntryStamp.jsx';
import RubberStamp from './RubberStamp.jsx';
import SouvenirStamp from './SouvenirStamp.jsx';
import VisaStamp from './VisaStamp.jsx';
import PassportCover from './PassportCover.jsx';

// A print/share-friendly rendering of the whole passport as REAL passport pages
// (88mm × 125mm each): cover, identity, then visas, entry stamps and ticket
// stubs paginated across booklet pages. The PDF export takes each page
// life-size; the PNG lays them out as open spreads. Uses only html2canvas-safe
// CSS (solid fills, borders, box-shadows, inline SVG — no masks, blend modes
// or 3D). Rendered off-screen.
const PER_PAGE = { visas: 2, entries: 4, souvenirs: 4, stubs: 3 };

const ExportSheet = forwardRef(function ExportSheet(
  { profile, stats, travel, home, memberSince, visas, entries, stubs, identitySeed, art = {} },
  ref,
) {
  const name = (profile?.name || '').trim() || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:') ? profile.avatar : '';
  const issued = new Date().toISOString().slice(0, 10);
  const visaVisits = {};
  for (const e of entries) if (e.country) visaVisits[e.country] = (visaVisits[e.country] || 0) + 1;

  const pages = [
    { kind: 'cover' },
    { kind: 'identity' },
    ...chunk(visas, PER_PAGE.visas).map((items) => ({ kind: 'visas', title: 'Visas', items })),
    ...chunk(entries, PER_PAGE.entries).map((items) => ({ kind: 'entries', title: 'Entries / Entrées', items })),
    ...chunk(entries, PER_PAGE.souvenirs).map((items) => ({ kind: 'souvenirs', title: 'Souvenirs', items })),
    ...chunk(stubs, PER_PAGE.stubs).map((items) => ({ kind: 'stubs', title: 'Ticket stubs', items })),
  ];

  return (
    <div className="cohear-export" ref={ref}>
      {pages.map((page, i) => (
        <Page key={i} no={i + 1} of={pages.length} title={page.title} cover={page.kind === 'cover'}>
          {page.kind === 'cover' && <Cover />}
          {page.kind === 'identity' && (
            <IdentityPage
              name={name}
              initials={initials}
              avatar={avatar}
              passportNo={passportNo}
              profile={profile}
              memberSince={memberSince}
              travel={travel}
              stats={stats}
              issued={issued}
            />
          )}
          {page.kind === 'visas' && (
            <div className="cohear-export__visas">
              {page.items.map((v) => (
                <div key={v.id} className="cohear-export__visa-cell" style={{ transform: `rotate(${stampRotation(v.id, 2)}deg)` }}>
                  <VisaStamp visa={v} entryCount={visaVisits[v.country] || 1} art={art[v.id]} />
                </div>
              ))}
            </div>
          )}
          {page.kind === 'entries' && (
            <div className="cohear-export__stamps">
              {page.items.map((e) => (
                <div key={e.id} className="cohear-export__stamp-cell" style={{ transform: `rotate(${stampRotation(e.id, 6)}deg)` }}>
                  <RubberStamp
                    id={e.id}
                    city={e.city}
                    date={formatStampDate(e.date || e.issuedAt)}
                    ink={regionInk(e.country, e.city || e.id)}
                  />
                </div>
              ))}
            </div>
          )}
          {page.kind === 'souvenirs' && (
            <div className="cohear-export__souvenirs">
              {page.items.map((e) => (
                <div key={e.id} className="cohear-export__souvenir-cell" style={{ transform: `rotate(${stampRotation(`${e.id}:souvenir`, 5)}deg)` }}>
                  {/* no onGenerate → renders without hover controls; art shows when it exists */}
                  <SouvenirStamp entry={e} art={art[`${e.id}:souvenir`]} showArt={Boolean(art[`${e.id}:souvenir`])} />
                </div>
              ))}
            </div>
          )}
          {page.kind === 'stubs' && page.items.map((s) => <StubRow key={s.serial || s.id} stub={s} />)}
        </Page>
      ))}
    </div>
  );
});

// One passport page at real 88×125mm proportions. data-export-page is what the
// PDF/booklet exporters query to rasterise pages one by one.
function Page({ no, of, title, cover, children }) {
  return (
    <div className={`cohear-export__page${cover ? ' cohear-export__page--cover' : ''}`} data-export-page>
      {!cover && (
        <div className="cohear-export__ph">
          <span>{title || 'Cohere Passport'}</span>
          <span>{no} / {of}</span>
        </div>
      )}
      {children}
      {!cover && <div className="cohear-export__pf">Cohere · Citizen of Live Music</div>}
    </div>
  );
}

function Cover() {
  return <PassportCover className="cohear-cover--page" />;
}

function IdentityPage({ name, initials, avatar, passportNo, profile, memberSince, travel, stats, issued }) {
  return (
    <>
      <div className="cohear-export__id">
        <div className="cohear-export__photo">
          {/* html2canvas ignores object-fit and stretches <img>; background-size:
              cover IS supported, so the photo renders as a covered background. */}
          {avatar ? <div className="cohear-export__photo-img" style={{ backgroundImage: `url(${avatar})` }} /> : <span>{initials || '☻'}</span>}
        </div>
        <div className="cohear-export__id-fields">
          <div className="cohear-export__name">{name}</div>
          <div className="cohear-export__meta">
            <span><b>No.</b> {passportNo}</span>
            <span><b>Authority</b> COHERE</span>
            {(profile?.homeCountry || profile?.homeCity) && <span><b>Nationality</b> {profile.homeCountry || profile.homeCity}</span>}
            {profile?.homeCity && <span><b>Home</b> {profile.homeCity}</span>}
            <span><b>Member since</b> {memberSince || '—'}</span>
            <span><b>Issued</b> {issued}</span>
          </div>
        </div>
      </div>

      <div className="cohear-export__miles">
        <div className="cohear-export__miles-num">{fmt(Math.round(travel?.miles || 0))}</div>
        <div className="cohear-export__miles-unit">miles travelled</div>
        <div className="cohear-export__miles-sub">{fmt(Math.round(travel?.km || 0))} km · {travel?.stops || 0} stops</div>
      </div>

      <div className="cohear-export__stats">
        {[
          ['Countries', stats.countries],
          ['Cities', stats.cities],
          ['Entries', stats.visits],
          ['Artists', stats.artists],
          ['Tickets', stats.stubs],
        ].map(([label, value]) => (
          <div key={label} className="cohear-export__stat">
            <div className="cohear-export__stat-num">{value}</div>
            <div className="cohear-export__stat-label">{label}</div>
          </div>
        ))}
      </div>

      <pre className="cohear-export__mrz">{mrz(name, passportNo, stats)}</pre>
    </>
  );
}

function StubRow({ stub: s }) {
  const pal = ticketPalette(s.artist || s.id);
  const type = ticketTypography(s.artist || s.id);
  const seat = s.seat || {};
  const place = [s.venue, s.city].filter(Boolean).join(' · ');
  return (
    <div className="cohear-export__stub" style={{ background: pal.paper, color: pal.ink }}>
      <div className="cohear-export__stub-head" style={{ background: pal.ink, color: pal.paper }}>
        <span style={{ fontFamily: type.head, fontWeight: type.headWeight, letterSpacing: type.headTracking }}>{s.artist || 'Live Concert'}</span>
        <span style={{ color: pal.accent }}>ADMIT ONE</span>
      </div>
      <div className="cohear-export__stub-main">
        <div className="cohear-export__stub-body">
          <div className="cohear-export__stub-venue">{place || '—'}</div>
          <div className="cohear-export__stub-line">{s.date || 'TBA'} · {seat.section || 'GA'} {seat.row || ''}{seat.seat ? ` ${seat.seat}` : ''}</div>
          <div className="cohear-export__serial">{s.serial}{s.mintNo != null ? ` · #${String(s.mintNo).padStart(4, '0')}` : ''}</div>
        </div>
        <div className="cohear-export__stub-foil" style={{ borderColor: pal.ink }}>
          <Barcode seed={s.serial || s.id} ink={pal.ink} />
        </div>
      </div>
    </div>
  );
}

// Inline-SVG barcode (html2canvas rasterises SVG natively, so this prints crisp).
function Barcode({ seed, ink = '#1a1510', height = 24 }) {
  const bars = barcodeBars(seed, 22);
  let x = 0;
  const rects = bars.map((b, i) => {
    const r = <rect key={i} x={x} y={0} width={b.w} height={height} />;
    x += b.w + b.gap;
    return r;
  });
  return (
    <svg width={x} height={height} viewBox={`0 0 ${x} ${height}`} fill={ink} aria-hidden="true">
      {rects}
    </svg>
  );
}

function chunk(arr = [], n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
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

export default ExportSheet;
