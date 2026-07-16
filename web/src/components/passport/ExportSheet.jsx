import { forwardRef } from 'react';
import { hashString, entryInk, ticketPalette } from './palette.js';

// A print/share-friendly rendering of the whole passport: identity + distance +
// every visa, entry stamp and ticket stub, laid out on one tall cream page.
// Uses only html2canvas-safe CSS (solid fills, borders — no masks, blend modes
// or 3D), so the PNG/PDF export comes out crisp. Rendered off-screen.
const ExportSheet = forwardRef(function ExportSheet(
  { profile, stats, travel, home, memberSince, visas, entries, stubs, identitySeed },
  ref,
) {
  const name = (profile?.name || '').trim() || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:') ? profile.avatar : '';
  const issued = new Date().toISOString().slice(0, 10);

  return (
    <div className="cohear-export" ref={ref}>
      <div className="cohear-export__head">
        <span className="cohear-export__brand">✦ Cohere</span>
        <span className="cohear-export__brand cohear-export__brand--right">Passport</span>
      </div>

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
            {(profile?.homeCountry || profile?.homeCity) && <span><b>Country of issue</b> {profile.homeCountry || profile.homeCity}</span>}
            <span><b>Member since</b> {memberSince || '—'}</span>
          </div>
        </div>
        <div className="cohear-export__miles">
          <div className="cohear-export__miles-num">{fmt(Math.round(travel?.miles || 0))}</div>
          <div className="cohear-export__miles-unit">miles travelled</div>
          <div className="cohear-export__miles-sub">{fmt(Math.round(travel?.km || 0))} km · {travel?.stops || 0} stops</div>
        </div>
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

      <Section title="Visas" count={visas.length}>
        <div className="cohear-export__grid cohear-export__grid--visa">
          {visas.map((v) => {
            const accent = v.rule?.accent || '#3b82f6';
            return (
              <div key={v.id} className="cohear-export__visa" style={{ borderColor: accent }}>
                <div className="cohear-export__visa-top" style={{ color: accent }}>VISA · {v.rule?.label || 'Tourist'}</div>
                <div className="cohear-export__visa-country">{v.country}</div>
                <div className="cohear-export__visa-row">{v.rule?.entries === 'multiple' ? 'Multiple entry' : 'Single entry'}</div>
                <div className="cohear-export__visa-row">Valid until {fmtDate(v.expiresAt)}</div>
                <div className="cohear-export__serial">{v.serial}{v.mintNo != null ? ` · #${v.mintNo}` : ''}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Entry stamps" count={entries.length}>
        <div className="cohear-export__grid cohear-export__grid--stamp">
          {entries.map((e) => {
            const ink = entryInk(e.city || e.id);
            return (
              <div key={e.id} className="cohear-export__stamp" style={{ borderColor: ink, color: ink }}>
                <div className="cohear-export__stamp-sub">✈ Admitted</div>
                <div className="cohear-export__stamp-city">{(e.city || 'Unknown').toUpperCase()}</div>
                <div className="cohear-export__stamp-date">{fmtStamp(e.date || e.issuedAt)}</div>
                <div className="cohear-export__stamp-sub">Cohere Border</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Ticket stubs" count={stubs.length}>
        <div className="cohear-export__grid cohear-export__grid--stub">
          {stubs.map((s) => {
            const pal = ticketPalette(s.artist || s.id);
            const seat = s.seat || {};
            const place = [s.venue, s.city].filter(Boolean).join(' · ');
            return (
              <div key={s.serial} className="cohear-export__stub" style={{ background: pal.paper, color: pal.ink }}>
                <div className="cohear-export__stub-head" style={{ background: pal.ink, color: pal.paper }}>
                  <span>{s.artist || 'Live Concert'}</span>
                  <span style={{ color: pal.accent }}>ADMIT ONE</span>
                </div>
                <div className="cohear-export__stub-body">
                  <div className="cohear-export__stub-venue">{place || '—'}</div>
                  <div className="cohear-export__stub-line">{s.date || 'TBA'} · {seat.section || 'GA'} {seat.row || ''}{seat.seat ? ` ${seat.seat}` : ''}</div>
                  <div className="cohear-export__serial">{s.serial}{s.mintNo != null ? ` · #${String(s.mintNo).padStart(4, '0')}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="cohear-export__foot">
        <pre>{mrz(name, passportNo, stats)}</pre>
        <div className="cohear-export__issued">Issued {issued} · Cohere — Citizen of Live Music</div>
      </div>
    </div>
  );
});

function Section({ title, count, children }) {
  if (!count) return null;
  return (
    <div className="cohear-export__section">
      <div className="cohear-export__section-head">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function fmtStamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] || '—'} ${m[1]}` : '— — —';
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
