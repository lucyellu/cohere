import { entryInk, stampRotation } from './palette.js';

// Inked immigration-style entry postmark, ported from the rubber-stamp pen:
// distressed SVG-noise mask + mix-blend multiply + a hand-applied rotation.
// One per city, per visit-date.
export default function EntryStamp({ entry, onOpen }) {
  const ink = entryInk(entry.city || entry.id);
  const rot = stampRotation(entry.id);
  const style = { '--ink': ink, '--rot': `${rot}deg` };
  const d = formatStampDate(entry.date || entry.issuedAt);
  const clickable = Boolean(onOpen);
  const title = `${entry.city}${entry.country ? `, ${entry.country}` : ''} · ${entry.date || ''}${clickable ? ' — view city' : ''}`;

  return (
    <div
      className={`cohear-entry ${clickable ? 'cohear-entry--link' : ''}`}
      style={style}
      title={title}
      onClick={clickable ? () => onOpen(entry.city, entry.country) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(entry.city, entry.country); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span className="cohear-entry__sub">✈ Admitted</span>
      <span className="cohear-entry__city">{(entry.city || 'Unknown').toUpperCase()}</span>
      <span className="cohear-entry__date">{d}</span>
      <span className="cohear-entry__sub">Cohear Border</span>
    </div>
  );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function formatStampDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '— — —';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] || '—'} ${m[1]}`;
}
