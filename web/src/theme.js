// theme.js — TimeGrid-style monochrome palette engine for Cohere.
//
// One seed colour → 12 shades of a single hue → mapped onto every CSS colour
// token the app uses (the page, the ink/text ramp, the zinc neutral ramp, and
// ALL of Tailwind's accent colour families). The result is that the whole UI is
// built from varying shades of ONE colour — exactly like TimeGrid's swatch.js.
//
// The only colours in the app that escape this monochrome are the dedicated
// `.ct-*` time classes defined in index.css (a show starting = green shades,
// a show ended = red shades). Everything else follows the seed.
//
// `invert` flips the light/dark poles of the ramp, turning the dark "night"
// skin into a light "paper" skin (TimeGrid's skin concept), still monochrome.

export const SEED_KEY = 'cohere_theme_seed';
export const INVERT_KEY = 'cohere_theme_invert';

// Curated seed swatches for the picker — a spread of hues, each desaturated a
// touch so the generated page reads as a calm monochrome rather than neon.
export const SEED_SWATCHES = [
  { label: 'Terracotta', hex: '#e0662f' },
  { label: 'Amber', hex: '#d68a1e' },
  { label: 'Gold', hex: '#c9a227' },
  { label: 'Olive', hex: '#8a9a3c' },
  { label: 'Emerald', hex: '#2f9e6b' },
  { label: 'Teal', hex: '#1f9b9b' },
  { label: 'Sky', hex: '#2f86d6' },
  { label: 'Indigo', hex: '#5b62e0' },
  { label: 'Violet', hex: '#8a5bd6' },
  { label: 'Magenta', hex: '#c33f9e' },
  { label: 'Rose', hex: '#d8456a' },
  { label: 'Slate', hex: '#5f6b78' },
];

// Every Tailwind colour family the app uses inline. All of them collapse onto
// the seed monochrome so nothing reads as a stray hue.
const DECOR_FAMILIES = [
  'indigo', 'cyan', 'sky', 'blue', 'fuchsia', 'violet', 'purple', 'pink',
  'teal', 'amber', 'yellow', 'orange', 'emerald', 'green', 'lime', 'red', 'rose',
];

// ── Core engine ──────────────────────────────────────────────────────────────

// 12 monochromatic shades of the seed's hue: lightness 6% (near-black) → 96%
// (near-white), with saturation pulled down at the extremes so blacks/whites
// read as natural warm/cool neutrals rather than tinted mud.
export function monoShades(seed, n = 12) {
  const { h, s } = hexToHsl(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const l = 6 + (96 - 6) * (i / (n - 1));
    const t = 2 * (l / 100) - 1; // -1 .. 1
    const adjustedS = s * (1 - Math.pow(t, 4) * 0.55);
    out.push(hslHex(h, adjustedS, l));
  }
  return out;
}

export function randomSeed() {
  const h = Math.random() * 360;
  const s = 0.42 + Math.random() * 0.32;
  const l = 0.42 + Math.random() * 0.12;
  return hslHex(h, s, l);
}

export function isValidHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex || ''));
}

// Paint the entire palette onto :root. `seed` is the vivid accent; everything
// else is derived from its hue. `invert` produces the light skin.
export function applyTheme(seed, invert = false) {
  if (!isValidHex(seed)) seed = '#e0662f';
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  const [r, g, b] = hexRgb(seed);
  const { h, s } = hexToHsl(seed);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sat = s / 100; // 0..1

  root.style.colorScheme = invert ? 'light' : 'dark';
  root.setAttribute('data-skin', invert ? 'paper' : 'night');

  // Accent stays vivid on both skins (it's the seed itself).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const seedL = hexToHsl(seed).l / 100;
  const accentDim = hslHex(h, clamp(sat * 0.94, 0, 1) * 100, clamp(seedL - 0.13, 0.04, 1) * 100);
  set('--accent', seed);
  set('--accent-r', String(r));
  set('--accent-g', String(g));
  set('--accent-b', String(b));
  set('--accent-text', lum > 0.6 ? '#1a1206' : '#fff6ef');
  set('--accent-dim', accentDim);

  // Page + ink poles. Dark skin: very dark page, cream ink. Light skin: pale
  // page, near-black ink. Both tinted by the seed's hue.
  const pageSat = clamp(sat * 0.55, 0, invert ? 0.22 : 0.5);
  const cardSat = clamp(sat * 0.5, 0, invert ? 0.2 : 0.44);
  const inkSat = clamp(sat * 0.4, 0, invert ? 0.5 : 0.3);

  const L = invert
    ? { paper: 0.945, paper2: 0.9, card: 0.985, ink: 0.14, ink2: 0.36, ink3: 0.52 }
    : { paper: 0.066, paper2: 0.04, card: 0.105, ink: 0.93, ink2: 0.69, ink3: 0.5 };

  const paper = hslHex(h, pageSat * 100, L.paper * 100);
  const paper2 = hslHex(h, pageSat * 100, L.paper2 * 100);
  const card = hslHex(h, cardSat * 100, L.card * 100);
  const ink = hslHex(h, inkSat * 100, L.ink * 100);
  const ink2 = hslHex(h, clamp(inkSat * 0.8, 0, 1) * 100, L.ink2 * 100);
  const ink3 = hslHex(h, clamp(inkSat * 0.65, 0, 1) * 100, L.ink3 * 100);
  set('--paper', paper);
  set('--paper-2', paper2);
  set('--paper-card', card);
  set('--ink', ink);
  set('--ink-2', ink2);
  set('--ink-3', ink3);
  set('--line', `rgba(${r}, ${g}, ${b}, ${invert ? 0.26 : 0.2})`);
  set('--line-soft', `rgba(${r}, ${g}, ${b}, ${invert ? 0.14 : 0.1})`);

  // Frosted glass surfaces: a translucent white reads cleaner on the light skin,
  // a faint ink tint on the dark skin.
  const inkRgb = hexRgb(ink);
  set('--surface', invert ? 'rgba(255, 255, 255, 0.5)' : `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.05)`);
  set('--surface-2', invert ? 'rgba(255, 255, 255, 0.7)' : `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.09)`);

  // Neutral zinc ramp: a straight ink → page interpolation in the seed hue, so
  // every inline text-zinc-* / bg-zinc-* utility lands on the monochrome.
  const pr = hexRgb(paper2);
  const a = inkRgb;
  const stops = { 50: -0.04, 100: 0.06, 200: 0.16, 300: 0.3, 400: 0.45, 500: 0.56, 600: 0.67, 700: 0.78, 800: 0.88, 900: 0.94, 950: 1 };
  for (const key in stops) set(`--color-zinc-${key}`, lerpHex(a, pr, stops[key]));
  // `white` is the primary foreground (flips with the skin: light ink on dark,
  // dark ink on light). `black` is always a deep dark so `bg-black/NN` scrims and
  // overlays keep darkening the page on both skins.
  set('--color-white', ink);
  set('--color-black', invert ? hslHex(h, inkSat * 100, 8) : paper2);
  set('--color-neutral-100', ink);
  set('--color-neutral-400', lerpHex(a, pr, 0.45));
  set('--color-neutral-500', lerpHex(a, pr, 0.56));
  set('--color-gray-400', lerpHex(a, pr, 0.45));
  set('--color-gray-500', lerpHex(a, pr, 0.56));
  set('--color-slate-400', lerpHex(a, pr, 0.45));
  set('--color-stone-400', lerpHex(a, pr, 0.45));

  // Every accent colour family collapses onto the seed. On dark we lighten the
  // text shades toward the ink (legible on the dark page); on light we darken
  // them toward the page-2 so they read on a pale page.
  const pole = invert ? hexRgb(paper2) : [255, 255, 255];
  for (const fam of DECOR_FAMILIES) {
    set(`--color-${fam}-100`, lerpHex([r, g, b], pole, 0.58));
    set(`--color-${fam}-200`, lerpHex([r, g, b], pole, 0.44));
    set(`--color-${fam}-300`, lerpHex([r, g, b], pole, 0.28));
    set(`--color-${fam}-400`, lerpHex([r, g, b], pole, 0.12));
    set(`--color-${fam}-500`, seed);
    set(`--color-${fam}-600`, accentDim);
  }
}

// ── Colour maths ─────────────────────────────────────────────────────────────

function hexToHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hh = 0;
  let ss = 0;
  if (max !== min) {
    const d = max - min;
    ss = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hh = ((b - r) / d + 2) * 60;
    else hh = ((r - g) / d + 4) * 60;
  }
  return { h: hh, s: ss * 100, l: l * 100 };
}

function hslHex(h, s, l) {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexRgb(hex) {
  const c = String(hex || '').replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function rgbHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function lerpHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return rgbHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
