import { useId } from 'react';
import { hashString, postageHue, stampCollection } from './palette.js';

// A postage stamp as one self-contained SVG, modelled on the stamp album at
// marijanapav.com/stamps: die-cut perforated rim, white paper margin, an
// edge-to-edge art window, philatelic type (place name, big denomination
// numeral, date line) and an optional wavy-bar cancellation postmark.
//
// The perforation is punched out of the paper PATH itself (fill-rule evenodd
// with a circle subpath per hole) rather than a CSS mask, so the stamp
// rasterises correctly in html2canvas exports — masks don't.
//
// The face is either the generated pollinations art (`art` data URL) or a
// procedural design in one of three print styles matching that site's
// collections: monoline (single-ink line drawing), textured (duotone tint
// block with grain) and typographic (letterforms are the artwork). The style
// is hash-picked from the same seed the art prompt uses, so a generated face
// always matches the frame it lands in.

export const STAMP_W = 156;
export const STAMP_H = 192;
const MARGIN = 7; // white paper between perforation and art window

// Perforation holes: full circles centered on the outer edge (half outside,
// half punched from the paper), corner holes included — evenodd removes the
// overlap just like a real die cut.
function perfHoles(w, h, step = 10.4) {
  const centers = (len) => {
    const n = Math.max(2, Math.round(len / step));
    return Array.from({ length: n + 1 }, (_, i) => (i * len) / n);
  };
  const pts = [];
  for (const x of centers(w)) pts.push([x, 0], [x, h]);
  for (const y of centers(h).slice(1, -1)) pts.push([0, y], [w, y]);
  return pts;
}

function paperPath(w, h, r = 3.1) {
  const circles = perfHoles(w, h)
    .map(([cx, cy]) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`)
    .join(' ');
  return `M 0 0 H ${w} V ${h} H 0 Z ${circles}`;
}
const PAPER_D = paperPath(STAMP_W, STAMP_H);

export default function PostageStamp({
  seed,
  place = 'Somewhere',
  date = '',
  value = 10,
  motif = 0,
  art = null,
  cancelled = false,
  cancelInk = '#41403c',
  subtitle = 'Cohere Post · Concert Souvenir',
  className = '',
  style,
  title,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const collection = stampCollection(seed);
  const hue = postageHue(seed);
  const h = hashString(String(seed));

  // Art window fills the paper inside the margin, leaving a caption strip.
  const win = { x: MARGIN, y: MARGIN, w: STAMP_W - MARGIN * 2, h: STAMP_H - MARGIN * 2 - 16 };
  const captionY = STAMP_H - MARGIN - 5;

  return (
    <svg
      viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
      className={`cohear-postage__svg ${className}`}
      style={style}
      role="img"
      aria-label={title || `${place} postage stamp`}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={`win-${uid}`}><rect x={win.x} y={win.y} width={win.w} height={win.h} /></clipPath>
        <filter id={`grain-${uid}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={h % 97} />
          {/* noise → soft white speckle via alpha only (no blend modes: export-safe) */}
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.4 0.4 0.4 0 0" />
        </filter>
      </defs>

      {/* perforated paper */}
      <path d={PAPER_D} fill="#f7f2e4" fillRule="evenodd" />

      {/* face */}
      <g clipPath={`url(#win-${uid})`}>
        {art ? (
          <ArtFace uid={uid} win={win} art={art} place={place} value={value} />
        ) : collection === 'monoline' ? (
          <MonolineFace win={win} place={place} value={value} motif={motif} hue={hue} seed={h} />
        ) : collection === 'textured' ? (
          <TexturedFace win={win} place={place} value={value} motif={motif} hue={hue} seed={h} />
        ) : (
          <TypographicFace win={win} place={place} value={value} hue={hue} seed={h} />
        )}
        <rect x={win.x} y={win.y} width={win.w} height={win.h} filter={`url(#grain-${uid})`} opacity="0.14" />
      </g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="none" stroke="rgba(40,30,10,0.35)" strokeWidth="0.75" />

      {/* caption strip on the paper margin */}
      <text x={MARGIN + 1} y={captionY} fontSize="5.4" fontFamily='ui-monospace, "Courier New", monospace' fontWeight="700" letterSpacing="0.6" fill="#5d5340">
        {date}
      </text>
      <text x={STAMP_W - MARGIN - 1} y={captionY} textAnchor="end" fontSize="4.6" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="0.4" fill="#8a7d61">
        {subtitle.toUpperCase()}
      </text>

      {cancelled && <Cancellation uid={uid} ink={cancelInk} seed={h} />}
    </svg>
  );
}

// Legibility trick for text over artwork: a paper-colored stroke pass under the
// inked fill (two <text> nodes — paint-order isn't html2canvas-safe).
function PlateText({ x, y, children, fontSize, anchor = 'start', fill, font, weight = 800, tracking = '1.2', halo = '#f7f2e4' }) {
  const common = {
    x, y, fontSize, textAnchor: anchor, fontFamily: font, fontWeight: weight, letterSpacing: tracking,
  };
  return (
    <>
      <text {...common} fill="none" stroke={halo} strokeWidth={fontSize / 4.5} strokeLinejoin="round">{children}</text>
      <text {...common} fill={fill}>{children}</text>
    </>
  );
}

const SERIF = 'Georgia, "Times New Roman", serif';

function Denomination({ x, y, value, fill, halo, size = 26 }) {
  return (
    <>
      <PlateText x={x} y={y} anchor="end" fontSize={size} fill={fill} font={SERIF} weight={700} tracking="0" halo={halo}>
        {value}
      </PlateText>
      <text x={x + 1} y={y} fontSize={size * 0.34} fontFamily={SERIF} fontWeight="700" fill={fill}>c</text>
    </>
  );
}

// --- Procedural faces -----------------------------------------------------------

// Monoline: single-weight line drawing, one ink on cream — sun, horizon and a
// landmark-ish motif drawn stroke-only.
function MonolineFace({ win, place, value, motif, hue, seed }) {
  const ink = `hsl(${hue} 45% 30%)`;
  const cx = win.x + win.w / 2;
  const sunX = win.x + 34 + (seed % 3) * 26;
  const sunY = win.y + 44;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    return [sunX + Math.cos(a) * 19, sunY + Math.sin(a) * 19, sunX + Math.cos(a) * 26, sunY + Math.sin(a) * 26];
  });
  return (
    <g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill={`hsl(${hue} 30% 93%)`} />
      <g stroke={ink} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx={sunX} cy={sunY} r="13" />
        {rays.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
        <line x1={win.x + 8} y1={win.y + win.h - 46} x2={win.x + win.w - 8} y2={win.y + win.h - 46} />
        <g transform={`translate(${win.x + 16}, ${win.y + win.h - 96}) scale(1.14)`}>
          <MotifPaths index={motif} />
        </g>
        {/* dotted foreground field */}
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx={win.x + 14 + i * 18 + ((seed >> i) % 7)} cy={win.y + win.h - 30 + ((seed >> (i + 3)) % 12)} r="1.1" fill={ink} stroke="none" />
        ))}
      </g>
      <PlateText x={cx} y={win.y + 15} anchor="middle" fontSize={placeSize(place)} fill={ink} font={SERIF} halo={`hsl(${hue} 30% 93%)`}>
        {place.toUpperCase()}
      </PlateText>
      <Denomination x={win.x + win.w - 10} y={win.y + win.h - 10} value={value} fill={ink} halo={`hsl(${hue} 30% 93%)`} />
    </g>
  );
}

// Textured: one saturated tint block, motif and ornaments in two lighter tints
// of the same hue — the airbrushed-duotone collection.
function TexturedFace({ win, place, value, motif, hue, seed }) {
  const deep = `hsl(${hue} 52% 27%)`;
  const light = `hsl(${hue} 62% 74%)`;
  const mid = `hsl(${hue} 45% 48%)`;
  const cx = win.x + win.w / 2;
  return (
    <g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill={deep} />
      <rect x={win.x + 5} y={win.y + 5} width={win.w - 10} height={win.h - 10} fill="none" stroke={mid} strokeWidth="1" opacity="0.9" />
      {/* corner florets */}
      {[[win.x + 13, win.y + 13], [win.x + win.w - 13, win.y + 13], [win.x + 13, win.y + win.h - 13], [win.x + win.w - 13, win.y + win.h - 13]].map(([x, y], i) => (
        <g key={i} fill={mid}>
          <circle cx={x} cy={y - 4} r="1.7" /><circle cx={x} cy={y + 4} r="1.7" />
          <circle cx={x - 4} cy={y} r="1.7" /><circle cx={x + 4} cy={y} r="1.7" />
        </g>
      ))}
      <g transform={`translate(${win.x + 21}, ${win.y + 52}) scale(1.0)`} fill={light}>
        <MotifPaths index={motif} />
      </g>
      {/* echo of the motif offset behind, mid tint — cheap "print depth" */}
      <g transform={`translate(${win.x + 24}, ${win.y + 55}) scale(1.0)`} fill={mid} opacity="0.45">
        <MotifPaths index={motif} />
      </g>
      <PlateText x={cx} y={win.y + 26} anchor="middle" fontSize={placeSize(place)} fill={light} font={SERIF} halo={deep}>
        {place.toUpperCase()}
      </PlateText>
      <line x1={cx - 26} y1={win.y + 33} x2={cx + 26} y2={win.y + 33} stroke={mid} strokeWidth="1" />
      <Denomination x={win.x + win.w - 11} y={win.y + win.h - 11} value={value} fill={light} halo={deep} size={30} />
    </g>
  );
}

// Typographic: the letterforms are the artwork — a giant numeral with the place
// name run vertically along it, two tints.
function TypographicFace({ win, place, value, hue, seed }) {
  const deep = `hsl(${hue} 50% 32%)`;
  const accent = `hsl(${(hue + 165) % 360} 42% 45%)`;
  const paper = `hsl(${hue} 38% 90%)`;
  const cx = win.x + win.w / 2;
  const name = place.toUpperCase();
  const vSize = Math.min(15, 120 / Math.max(4, name.length));
  return (
    <g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill={paper} />
      {/* rule pattern */}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={win.x + 6} y1={win.y + 12 + i * 4} x2={win.x + win.w - 6} y2={win.y + 12 + i * 4} stroke={accent} strokeWidth="0.8" opacity="0.65" />
      ))}
      <text
        x={cx + 14} y={win.y + win.h - 34} textAnchor="middle" fontSize="104" fontFamily={SERIF} fontWeight="700"
        fill={deep} transform={`rotate(-4 ${cx} ${win.y + win.h / 2})`}
      >
        {value}
      </text>
      <text
        x={win.x + 17} y={win.y + win.h - 12}
        fontSize={vSize} fontFamily='"Arial Narrow", Impact, ui-sans-serif, sans-serif' fontWeight="800" letterSpacing="1"
        fill={accent} transform={`rotate(-90 ${win.x + 17} ${win.y + win.h - 12})`}
      >
        {name}
      </text>
      <text x={win.x + win.w - 9} y={win.y + win.h - 9} textAnchor="end" fontSize="7" fontFamily={SERIF} fontWeight="700" letterSpacing="1.5" fill={deep}>
        CENTS
      </text>
    </g>
  );
}

// Generated pollinations art fills the window edge-to-edge; place name and
// denomination stay overlaid so the art reads as a stamp, not a photo.
function ArtFace({ uid, win, art, place, value }) {
  return (
    <g>
      <image
        href={art} x={win.x} y={win.y} width={win.w} height={win.h}
        preserveAspectRatio="xMidYMid slice"
      />
      <PlateText x={win.x + win.w / 2} y={win.y + 14} anchor="middle" fontSize={placeSize(place)} fill="#2c2418" font={SERIF}>
        {place.toUpperCase()}
      </PlateText>
      <Denomination x={win.x + win.w - 10} y={win.y + win.h - 10} value={value} fill="#2c2418" halo="#f7f2e4" />
    </g>
  );
}

// Wavy-bar cancellation across the top-right corner — the postmark "kills" the
// stamp exactly like a mailed one.
function Cancellation({ uid, ink, seed }) {
  const rot = -6 - (seed % 7);
  const wave = (y) => `M 84 ${y} q 7 -4.5 14 0 t 14 0 t 14 0 t 14 0 t 14 0`;
  return (
    <g transform={`rotate(${rot} 128 26)`} stroke={ink} fill="none" opacity="0.52" strokeLinecap="round">
      <circle cx="130" cy="20" r="17" strokeWidth="1.7" />
      <circle cx="130" cy="20" r="12.5" strokeWidth="0.9" />
      <path d={wave(44)} strokeWidth="1.6" />
      <path d={wave(51)} strokeWidth="1.6" />
      <path d={wave(58)} strokeWidth="1.6" />
    </g>
  );
}

function placeSize(place) {
  const n = String(place || '').length;
  return n > 14 ? 8.5 : n > 10 ? 10.5 : 12.5;
}

// --- Shared motif silhouettes -----------------------------------------------
// Landmark-ish shapes in a 100×60 box, usable filled (textured faces, ink
// souvenir stamps) or stroked (monoline faces).
export const MOTIFS = [
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

export function MotifPaths({ index }) {
  const paths = MOTIFS[index % MOTIFS.length];
  return <>{paths.map((d) => <path key={d} d={d} />)}</>;
}
