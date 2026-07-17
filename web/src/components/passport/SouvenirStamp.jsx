import { useId, useState } from 'react';
import { hashString, regionInk, stampRotation, stampCollection } from './palette.js';
import PostageStamp, { MotifPaths } from './PostageStamp.jsx';
import Magnifier from './Magnifier.jsx';
import StampHero from './StampHero.jsx';

// Souvenir stamps — every show hands out a keepsake, and the physical kind
// follows the scope:
//   · CITY           — a perforated postage stamp in the marijanapav.com stamp
//                      album style: die-cut paper rim, art-forward face in one
//                      of three print collections (monoline / textured /
//                      typographic), place name + denomination type, wavy-bar
//                      cancellation. The face can be swapped for generated
//                      pollinations art that's prompt-locked to the same
//                      collection.
//   · STATE/COUNTRY  — a pressed ink mark in the US-state-sticker style:
//                      a geometric frame (octagon / hexagon / oval / box),
//                      the place name across the top and a landmark-ish motif
//                      silhouette inside, in distressed regional ink.
//
// Assignment is deterministic per entry for now (a hash stands in for the
// planned backend that will mint unique ids / limited supplies, NFT-style).

const DENOMS = [5, 10, 15, 25, 50];

export function souvenirFor(entry) {
  const seed = `${entry.id}:souvenir`;
  const h = hashString(seed);
  // Weighted roll: cities are common, states uncommon, countries the rare pull.
  const roll = h % 8;
  let tier = roll < 4 ? 'city' : roll < 6 ? 'state' : 'country';
  if (tier === 'state' && !entry.region) tier = 'country'; // no region data → promote
  if (tier === 'country' && !entry.country) tier = 'city';
  const place = tier === 'city' ? entry.city : tier === 'state' ? entry.region : entry.country;
  return {
    tier,
    seed,
    kind: tier === 'city' ? 'postage' : 'ink', // paper stick-ons for cities, ink for the land
    collection: stampCollection(seed),
    place: place || entry.city || 'Somewhere',
    hue: (h >>> 5) % 360,
    motif: (h >>> 7) % 6,
    frame: (h >>> 9) % 4,
    value: DENOMS[(h >>> 11) % DENOMS.length],
    year: String(entry.date || entry.issuedAt || '').slice(0, 4) || '—',
    date: fmtShort(entry.date || entry.issuedAt),
  };
}

export default function SouvenirStamp({ entry, art, showArt, onToggleArt, onGenerate, generating }) {
  const s = souvenirFor(entry);
  if (s.kind === 'ink') return <InkSouvenir entry={entry} s={s} />;
  return (
    <PostageSouvenir
      entry={entry}
      s={s}
      art={art}
      showArt={showArt}
      onToggleArt={onToggleArt}
      onGenerate={onGenerate}
      generating={generating}
    />
  );
}

// "2026-6-1" — loose hand-set date style.
function fmtShort(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}-${Number(m[2])}-${Number(m[3])}` : '';
}

// --- City postage (perforated paper, album presentation) ----------------------

function PostageSouvenir({ entry, s, art, showArt, onToggleArt, onGenerate, generating }) {
  const [loupe, setLoupe] = useState(false);
  const [hero, setHero] = useState(false);
  const rot = stampRotation(s.seed, 5);
  const stamp = (
    <PostageStamp
      seed={s.seed}
      place={s.place}
      date={s.date || s.year}
      value={s.value}
      motif={s.motif}
      art={art && showArt ? art : null}
      cancelled
      cancelInk={regionInk(entry.country, s.place)}
      title={`${s.place} — city souvenir (${s.collection} postage)`}
    />
  );
  return (
    <div className="cohear-postage" style={{ '--rot': `${rot}deg` }}>
      <div
        className="cohear-stamp-open"
        role="button"
        tabIndex={0}
        aria-label={`Inspect the ${s.place} souvenir stamp`}
        onClick={() => setHero(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHero(true); } }}
      >
        <Magnifier active={loupe} content={stamp}>
          {stamp}
        </Magnifier>
      </div>
      <StampHero open={hero} onClose={() => setHero(false)} label={`${s.place} souvenir stamp`}>
        {stamp}
      </StampHero>
      {onGenerate && (
        <div className="cohear-postage__tools">
          <button
            type="button"
            className={loupe ? 'is-on' : ''}
            onClick={() => setLoupe((v) => !v)}
            title={loupe ? 'Put the loupe away' : 'Inspect with the loupe'}
          >
            🔍
          </button>
          {art && (
            <button type="button" onClick={onToggleArt} title={showArt ? 'Show the printed stamp' : 'Show the art stamp'}>
              {showArt ? 'Plain' : '✨'}
            </button>
          )}
          <button type="button" onClick={onGenerate} disabled={generating} title={art ? 'Regenerate the art' : 'Generate stamp art'}>
            {generating ? '…' : art ? '↻' : '✨ Art'}
          </button>
        </div>
      )}
    </div>
  );
}

// Ink souvenirs open the same hero lightbox as the postage kind.
function InkSouvenir({ entry, s }) {
  const [hero, setHero] = useState(false);
  const stamp = <PictorialInkStamp entry={entry} s={s} />;
  return (
    <>
      <div
        className="cohear-stamp-open"
        role="button"
        tabIndex={0}
        aria-label={`Inspect the ${s.place} souvenir stamp`}
        onClick={() => setHero(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHero(true); } }}
      >
        {stamp}
      </div>
      <StampHero open={hero} onClose={() => setHero(false)} wide label={`${s.place} souvenir stamp`}>
        {stamp}
      </StampHero>
    </>
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
  const h = hashString(s.seed);
  const ink = regionInk(entry.country, s.place);
  const rot = stampRotation(s.seed);
  const wear = 0.76 + ((h >>> 13) % 18) / 100;
  const frame = FRAMES[s.frame];
  const name = s.place.toUpperCase();
  const nameSize = name.length > 13 ? 10 : name.length > 9 ? 12 : 14;
  const seed = (h % 90) + 1;

  return (
    <svg
      viewBox="0 0 140 104"
      className="cohear-rubber"
      style={{ '--ink': ink, '--rot': `${rot}deg`, opacity: wear, maxWidth: 168 }}
      aria-label={`${s.place} ${s.tier} souvenir stamp`}
    >
      <title>{`${s.place} — ${s.tier} souvenir (ink)`}</title>
      <defs>
        {/* codepen rubber-stamp wear: crisp ink, hard-edged speckle erosion */}
        <filter id={`rough-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed={seed} result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5.75" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
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
