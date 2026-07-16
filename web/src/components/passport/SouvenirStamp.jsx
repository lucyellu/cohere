import { useRef } from 'react';
import { hashString, regionInk, stampRotation } from './palette.js';
import RubberStamp from './RubberStamp.jsx';
import { formatStampDate } from './EntryStamp.jsx';

// Souvenir stamps — every show hands out a keepsake. Two physical kinds:
//   · "postage"  — a stick-on letter stamp: thick paper, scalloped perforation,
//                  duotone vignette scene, denomination, and a holographic foil
//                  sweep that follows the pointer (the stamp_foil reference).
//   · "ink"      — a pressed rubber mark, like a station or park stamp.
// Each is scoped to the show's CITY, STATE/REGION, or COUNTRY.
//
// Assignment is deterministic per entry for now (a hash stands in for the
// planned backend that will mint unique ids / limited supplies, NFT-style).
// The vignette is CSS-only placeholder art; generated art can slot in later.

const DENOMS = [5, 10, 15, 25, 50];
const TIER_LABEL = { city: 'City', state: 'State', country: 'Country' };

export function souvenirFor(entry) {
  const h = hashString(`${entry.id}:souvenir`);
  // Weighted roll: cities are common, states uncommon, countries the rare pull.
  const roll = h % 8;
  let tier = roll < 4 ? 'city' : roll < 6 ? 'state' : 'country';
  if (tier === 'state' && !entry.region) tier = 'country'; // no region data → promote
  if (tier === 'country' && !entry.country) tier = 'city';
  const place = tier === 'city' ? entry.city : tier === 'state' ? entry.region : entry.country;
  return {
    tier,
    kind: ((h >>> 3) & 1) === 0 ? 'postage' : 'ink',
    place: place || entry.city || 'Somewhere',
    hue: (h >>> 5) % 360,
    scene: (h >>> 7) % 3, // sunset | ridge | tide — the duotone vignette motif
    value: DENOMS[(h >>> 9) % DENOMS.length],
    year: String(entry.date || entry.issuedAt || '').slice(0, 4) || '—',
  };
}

export default function SouvenirStamp({ entry }) {
  const s = souvenirFor(entry);
  if (s.kind === 'ink') return <InkSouvenir entry={entry} s={s} />;
  return <PostageSouvenir entry={entry} s={s} />;
}

// Ink-pressed souvenir — the rubber die again, but branded to the tier
// (STATE OF …, REPUBLIC OF …) instead of border control.
function InkSouvenir({ entry, s }) {
  const sub = s.tier === 'city' ? 'COHERE · SOUVENIR' : s.tier === 'state' ? `STATE SOUVENIR · ${s.year}` : `NATIONAL SOUVENIR · ${s.year}`;
  return (
    <RubberStamp
      id={`${entry.id}:souvenir`}
      city={s.place}
      subtitle={sub}
      label="COLLECTED"
      date={formatStampDate(entry.date || entry.issuedAt)}
      ink={regionInk(entry.country, s.place)}
      style={{ '--rot': `${stampRotation(`${entry.id}:souvenir`)}deg` }}
      title={`${s.place} — ${TIER_LABEL[s.tier]} souvenir (ink)`}
    />
  );
}

// Stick-on postage souvenir with the pointer-tracked holographic foil.
function PostageSouvenir({ entry, s }) {
  const ref = useRef(null);

  // Tilt + foil hotspot follow the pointer; plain CSS vars, no animation libs.
  function onMove(e) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--px', `${px * 100}%`);
    el.style.setProperty('--py', `${py * 100}%`);
    el.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 12}deg`);
    el.style.setProperty('--foil', '1');
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--foil', '0');
  }

  const rot = stampRotation(`${entry.id}:souvenir`, 5);
  return (
    <div
      ref={ref}
      className="cohear-souvenir"
      style={{ '--hue': s.hue, '--rot': `${rot}deg` }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      title={`${s.place} — ${TIER_LABEL[s.tier]} souvenir (postage)`}
    >
      <div className="cohear-souvenir__paper cohear-perf">
        <div className={`cohear-souvenir__art cohear-souvenir__art--${s.scene}`}>
          <span className="cohear-souvenir__place" style={s.place.length > 9 ? { fontSize: 10 } : undefined}>{s.place.toUpperCase()}</span>
          <span className="cohear-souvenir__value">{s.value}<small>ct.</small></span>
          <span className="cohear-souvenir__year">{s.year}</span>
          <span className="cohear-souvenir__tier">{TIER_LABEL[s.tier]}</span>
        </div>
        <div className="cohear-souvenir__foil" aria-hidden="true" />
      </div>
    </div>
  );
}
