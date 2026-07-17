import { regionInk, stampRotation } from './palette.js';
import RubberStamp from './RubberStamp.jsx';

// Inked immigration-style entry postmark — a circular/oval SVG rubber stamp
// (curved city name, ✈, centre date) with a hand-applied rotation. Ink color
// is keyed to the country's region so a real trip reads coherently.
// One per city, per visit-date.
export default function EntryStamp({ entry, onOpen }) {
  const ink = regionInk(entry.country, entry.city || entry.id);
  const rot = stampRotation(entry.id);
  const d = formatStampDate(entry.date || entry.issuedAt);
  const clickable = Boolean(onOpen);
  const title = `${entry.city}${entry.country ? `, ${entry.country}` : ''} · ${entry.date || ''}${clickable ? ' — view city' : ''}`;

  return (
    <RubberStamp
      id={entry.id}
      city={entry.city}
      date={d}
      ink={ink}
      className={clickable ? 'cohear-rubber--link' : ''}
      style={{ '--rot': `${rot}deg` }}
      title={title}
      onClick={clickable ? () => onOpen(entry.city, entry.country) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(entry.city, entry.country); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    />
  );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function formatStampDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '— — —';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] || '—'} ${m[1]}`;
}
