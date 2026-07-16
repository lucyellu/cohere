import { useId, useRef } from 'react';
import { hashString, regionInk, stampRotation } from './palette.js';

// Souvenir stamps — every show hands out a keepsake, and the physical kind
// follows the scope:
//   · CITY           — a stick-on letterpress postage stamp: thick white paper
//                      with a chunky zigzag-cut edge, one saturated ink block
//                      debossed into the sheet, a white motif illustration and
//                      the show date pressed in big serif (the Chu Jian
//                      letterpress reference), plus the pointer-tracked
//                      holographic foil.
//   · STATE/COUNTRY  — a pressed ink mark in the US-state-sticker style:
//                      a geometric frame (octagon / hexagon / oval / box),
//                      the place name across the top and a landmark-ish motif
//                      silhouette inside, in distressed regional ink.
//
// Assignment is deterministic per entry for now (a hash stands in for the
// planned backend that will mint unique ids / limited supplies, NFT-style).

const DENOMS = [5, 10, 15, 25, 50];

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
    kind: tier === 'city' ? 'postage' : 'ink', // paper stick-ons for cities, ink for the land
    place: place || entry.city || 'Somewhere',
    hue: (h >>> 5) % 360,
    motif: (h >>> 7) % MOTIFS.length,
    frame: (h >>> 9) % 4,
    value: DENOMS[(h >>> 11) % DENOMS.length],
    year: String(entry.date || entry.issuedAt || '').slice(0, 4) || '—',
    date: fmtShort(entry.date || entry.issuedAt),
  };
}

export default function SouvenirStamp({ entry }) {
  const s = souvenirFor(entry);
  if (s.kind === 'ink') return <PictorialInkStamp entry={entry} s={s} />;
  return <PostageSouvenir entry={entry} s={s} />;
}

// "2026-6-1" — the loose hand-set date style from the letterpress reference.
function fmtShort(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}-${Number(m[2])}-${Number(m[3])}` : '';
}

// --- City postage (letterpress paper, zigzag edge, holo foil) -----------------

// Zigzag die-cut outline (percent polygon, teeth on all four edges). Computed
// once — clip-path polygons scale with the element.
const ZIGZAG = (() => {
  const dx = 5.5; const dy = 4.5; // tooth depth (x%, y%) ≈ square teeth at 4:5
  const nx = 9; const ny = 11;    // teeth per edge
  const pts = [];
  const sx = (100 - 2 * dx) / nx;
  const sy = (100 - 2 * dy) / ny;
  for (let i = 0; i < nx; i += 1) pts.push(`${dx + (i + 0.5) * sx}% 0%`, `${dx + (i + 1) * sx}% ${dy}%`);
  for (let i = 0; i < ny; i += 1) pts.push(`100% ${dy + (i + 0.5) * sy}%`, `${100 - dx}% ${dy + (i + 1) * sy}%`);
  for (let i = nx; i > 0; i -= 1) pts.push(`${dx + (i - 0.5) * sx}% 100%`, `${dx + (i - 1) * sx}% ${100 - dy}%`);
  for (let i = ny; i > 0; i -= 1) pts.push(`0% ${dy + (i - 0.5) * sy}%`, `${dx}% ${dy + (i - 1) * sy}%`);
  return `polygon(${dx}% ${dy}%, ${pts.join(', ')})`;
})();

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
      title={`${s.place} — city souvenir (letterpress)`}
    >
      <div className="cohear-souvenir__paper" style={{ clipPath: ZIGZAG }}>
        <div className="cohear-souvenir__block">
          <span className="cohear-souvenir__place">{s.place}</span>
          <MiniQr seed={entry.id} />
          <Motif index={s.motif} className="cohear-souvenir__motif" />
          <div className="cohear-souvenir__foot">
            <span className="cohear-souvenir__date">{s.date || s.year}</span>
            <span className="cohear-souvenir__sub">{s.value}ct · Cohere City Souvenir</span>
          </div>
        </div>
        <div className="cohear-souvenir__foil" aria-hidden="true" />
      </div>
    </div>
  );
}

// The little debossed QR-ish block in the stamp's corner — a placeholder for
// the real scannable unique-id mark the backend will eventually mint.
function MiniQr({ seed }) {
  const h = hashString(`${seed}:qr`);
  const cells = [];
  for (let i = 0; i < 25; i += 1) if ((h >> (i % 28)) & (1 << (i % 3))) cells.push(i);
  return (
    <svg className="cohear-souvenir__qr" viewBox="0 0 5 5" aria-hidden="true">
      {cells.map((i) => <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" />)}
    </svg>
  );
}

// --- Shared motif silhouettes --------------------------------------------------
// Simple landmark-ish shapes, drawn to fit a 100×60 box: white on the city
// postage block, ink-colored inside the state/country frames.
const MOTIFS = [
  // mountain range
  ['M2,58 L26,18 L38,38 L54,8 L74,42 L84,28 L98,58 Z'],
  // city skyline
  ['M4,58 L4,30 L14,30 L14,20 L24,20 L24,36 L36,36 L36,10 L48,10 L48,32 L60,32 L60,24 L72,24 L72,40 L84,40 L84,16 L96,16 L96,58 Z'],
  // half sun setting over waves
  ['M32,42 a18,18 0 0 1 36,0 Z', 'M2,48 q10,-8 20,0 t20,0 t20,0 t20,0 t20,0 l0,10 l-100,0 Z'],
  // pine trees
  ['M20,58 L20,50 L12,50 L26,26 L18,26 L30,6 L42,26 L34,26 L48,50 L40,50 L40,58 Z', 'M62,58 L62,52 L56,52 L66,34 L60,34 L70,18 L80,34 L74,34 L84,52 L78,52 L78,58 Z'],
  // eighth notes — it's a concert souvenir after all
  ['M38,10 L82,4 L82,38 a8,7 0 1 1 -4,-6 L78,14 L42,19 L42,46 a8,7 0 1 1 -4,-6 Z'],
  // rolling hills
  ['M2,58 Q30,26 58,50 Q80,32 98,44 L98,58 Z', 'M2,58 Q20,44 40,54 L40,58 Z'],
];

// Bare paths so the same motif can live in its own <svg> (postage) or inside
// a transformed <g> of a larger drawing (ink stamp) without nesting viewports.
function MotifPaths({ index }) {
  const paths = MOTIFS[index % MOTIFS.length];
  return <>{paths.map((d) => <path key={d} d={d} />)}</>;
}

function Motif({ index, className }) {
  return (
    <svg viewBox="0 0 100 60" className={className} aria-hidden="true">
      <MotifPaths index={index} />
    </svg>
  );
}

// --- State / country pictorial ink stamp ---------------------------------------
// Frame variants echo the state-sticker sheet: cut-corner octagon, elongated
// hexagon, oval, double-line box.
const FRAMES = [
  { outer: 'M18,4 L122,4 L136,18 L136,86 L122,100 L18,100 L4,86 L4,18 Z', inner: 'M21,9 L119,9 L131,21 L131,83 L119,95 L21,95 L9,83 L9,21 Z' }, // octagon
  { outer: 'M24,4 L116,4 L136,52 L116,100 L24,100 L4,52 Z', inner: 'M27,9 L113,9 L130,52 L113,95 L27,95 L10,52 Z' },                              // hexagon
  { ellipse: true },                                                                                                                                // oval
  { outer: 'M8,4 L132,4 L132,100 L8,100 Z', inner: 'M14,10 L126,10 L126,94 L14,94 Z' },                                                            // box
];

function PictorialInkStamp({ entry, s }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const h = hashString(`${entry.id}:souvenir`);
  const ink = regionInk(entry.country, s.place);
  const rot = stampRotation(`${entry.id}:souvenir`);
  const wear = 0.76 + ((h >>> 13) % 18) / 100;
  const frame = FRAMES[s.frame];
  const name = s.place.toUpperCase();
  const nameSize = name.length > 13 ? 10 : name.length > 9 ? 12 : 14;
  const seed = (h % 90) + 1;

  return (
    <svg
      viewBox="0 0 140 104"
      className="cohear-rubber cohear-rubber--grunge"
      style={{ '--ink': ink, '--rot': `${rot}deg`, opacity: wear, maxWidth: 168 }}
      aria-label={`${s.place} ${s.tier} souvenir stamp`}
    >
      <title>{`${s.place} — ${s.tier} souvenir (ink)`}</title>
      <defs>
        <filter id={`rough-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" />
        </filter>
      </defs>
      <g filter={`url(#rough-${uid})`} stroke="var(--ink)" fill="var(--ink)">
        {frame.ellipse ? (
          <>
            <ellipse cx="70" cy="52" rx="66" ry="48" fill="none" strokeWidth="2.5" />
            <ellipse cx="70" cy="52" rx="60" ry="42" fill="none" strokeWidth="1" opacity="0.85" />
          </>
        ) : (
          <>
            <path d={frame.outer} fill="none" strokeWidth="2.5" />
            <path d={frame.inner} fill="none" strokeWidth="1" opacity="0.85" />
          </>
        )}
        <text x="70" y={frame.ellipse ? 30 : 26} textAnchor="middle" stroke="none" fontSize={nameSize} fontWeight="800" fontFamily='"Trebuchet MS", ui-sans-serif, sans-serif' letterSpacing="1.5">{name}</text>
        {/* motif silhouette fills the lower body of the frame */}
        <g transform={`translate(${frame.ellipse ? 26 : 22}, 36) scale(${frame.ellipse ? 0.88 : 0.96})`} stroke="none" opacity="0.92">
          <MotifPaths index={s.motif} />
        </g>
        <text x="70" y={frame.ellipse ? 93 : 92} textAnchor="middle" stroke="none" fontSize="6" fontWeight="700" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1.4" opacity="0.85">
          {s.tier.toUpperCase()} SOUVENIR · {s.year}
        </text>
      </g>
    </svg>
  );
}
