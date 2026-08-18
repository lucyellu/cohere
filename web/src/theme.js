// theme.js — Palette engine and skin manager for Cohere.
//
// Bridges Cohere's signature warm terracotta landing page branding
// (warm sand/cream paper, dark ink, glowing vermilion/peach accents)
// into the app's light and dark modes.

export const SEED_KEY = 'cohere_theme_seed';
export const INVERT_KEY = 'cohere_theme_invert';

// Curated seed swatches for the picker — with Cohere's terracotta as the flagship
export const SEED_SWATCHES = [
  { label: 'Cohere Terracotta', hex: '#e85a2b' },
  { label: 'Warm Ember', hex: '#d9351f' },
  { label: 'Amber Peach', hex: '#f58b4e' },
  { label: 'Slate', hex: '#5f6b78' },
  { label: 'Muted Zinc', hex: '#71717a' },
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

export function swapShade(hex) {
  return hex;
}

export function isValidHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex || ''));
}

// Paint the entire palette onto :root.
// `invert = true` produces the landing page light mode.
export function applyTheme(seed, invert = false, swap = false) {
  if (!isValidHex(seed)) seed = '#e85a2b';
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  const [r, g, b] = hexRgb(seed);
  const { h, s } = hexToHsl(seed);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sat = s / 100; // 0..1

  root.style.colorScheme = invert ? 'light' : 'dark';
  root.setAttribute('data-skin', invert ? 'paper' : 'night');

  // Landing page branding orange ramp
  set('--orange-1', '#d9351f');
  set('--orange-2', '#e85a2b');
  set('--orange-3', '#f58b4e');
  set('--orange-4', '#fdc68a');
  set('--ghost', '#c5bfae');

  const seedL = hexToHsl(seed).l / 100;
  const accentDim = hslHex(h, clamp(sat * 0.94, 0, 1) * 100, clamp(seedL - 0.13, 0.04, 1) * 100);

  if (invert) {
    // ── LIGHT MODE (LANDING PAGE SKIN) ───────────────────────────────────────
    // Directly based on cohere_landing_page.html: warm sand cream, dark ink,
    // crisp terracotta orange gradients, warm frosted surfaces and borders.
    const paper = swap ? seed : '#f8f3e7';
    const paper2 = swap ? seed : '#ede6d6';
    const card = swap ? accentDim : '#ffffff';

    const actualAccent = swap ? '#ede6d6' : seed;
    const actualAccentDim = swap ? '#f8f3e7' : accentDim;
    const [ar, ag, ab] = hexRgb(actualAccent);

    set('--accent', actualAccent);
    set('--accent-r', String(ar));
    set('--accent-g', String(ag));
    set('--accent-b', String(ab));
    set('--accent-text', '#ffffff');
    set('--accent-dim', actualAccentDim);

    const ink = '#141416';
    const ink2 = '#2b2b30';
    const ink3 = '#8b847a';

    set('--paper', paper);
    set('--paper-2', paper2);
    set('--paper-card', card);
    set('--ink', ink);
    set('--ink-2', ink2);
    set('--ink-3', ink3);
    set('--line', '#dad2bf');
    set('--line-soft', 'rgba(218, 210, 191, 0.55)');

    set('--surface', 'rgba(255, 255, 255, 0.65)');
    set('--surface-2', 'rgba(255, 255, 255, 0.88)');

    // Tailwind zinc scale remapped for crisp light mode readability
    const stops = {
      50: '#141416',
      100: '#141416',
      200: '#2b2b30',
      300: '#4c453c',
      400: '#6f6658',
      500: '#8b847a',
      600: '#b8b0a0',
      700: '#dad2bf',
      800: '#ede6d6',
      900: '#f5efe2',
      950: '#f8f3e7',
    };
    for (const key in stops) set(`--color-zinc-${key}`, stops[key]);

    set('--color-white', '#141416');
    set('--color-black', '#f8f3e7');
    set('--color-neutral-100', '#141416');
    set('--color-neutral-400', '#6f6658');
    set('--color-neutral-500', '#8b847a');
    set('--color-gray-400', '#6f6658');
    set('--color-gray-500', '#8b847a');
    set('--color-slate-400', '#6f6658');
    set('--color-stone-400', '#6f6658');

    const pole = [255, 255, 255];
    for (const fam of DECOR_FAMILIES) {
      set(`--color-${fam}-100`, lerpHex([r, g, b], pole, 0.75));
      set(`--color-${fam}-200`, lerpHex([r, g, b], pole, 0.55));
      set(`--color-${fam}-300`, lerpHex([r, g, b], pole, 0.35));
      set(`--color-${fam}-400`, lerpHex([r, g, b], pole, 0.15));
      set(`--color-${fam}-500`, seed);
      set(`--color-${fam}-600`, accentDim);
    }
  } else {
    // ── DARK MODE (NIGHT SKIN) ────────────────────────────────────────────────
    const pageSat = clamp(sat * 0.55, 0, 0.5);
    const cardSat = clamp(sat * 0.5, 0, 0.44);
    const inkSat = clamp(sat * 0.4, 0, 0.3);

    const L = { paper: 0.066, paper2: 0.04, card: 0.105, ink: 0.93, ink2: 0.69, ink3: 0.5 };

    const basePaper = hslHex(h, pageSat * 100, L.paper * 100);
    const basePaper2 = hslHex(h, pageSat * 100, L.paper2 * 100);
    const baseCard = hslHex(h, cardSat * 100, L.card * 100);

    const paper = swap ? seed : basePaper;
    const paper2 = swap ? seed : basePaper2;
    const card = swap ? accentDim : baseCard;

    const actualAccent = swap ? basePaper2 : seed;
    const actualAccentDim = swap ? basePaper : accentDim;
    const [ar, ag, ab] = hexRgb(actualAccent);
    const accentLum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;

    set('--accent', actualAccent);
    set('--accent-r', String(ar));
    set('--accent-g', String(ag));
    set('--accent-b', String(ab));
    set('--accent-text', accentLum > 0.6 ? '#1a1206' : '#fff6ef');
    set('--accent-dim', actualAccentDim);

    const ink = hslHex(h, inkSat * 100, L.ink * 100);
    const ink2 = hslHex(h, clamp(inkSat * 0.8, 0, 1) * 100, L.ink2 * 100);
    const ink3 = hslHex(h, clamp(inkSat * 0.65, 0, 1) * 100, L.ink3 * 100);
    set('--paper', paper);
    set('--paper-2', paper2);
    set('--paper-card', card);
    set('--ink', ink);
    set('--ink-2', ink2);
    set('--ink-3', ink3);
    set('--line', `rgba(${r}, ${g}, ${b}, 0.2)`);
    set('--line-soft', `rgba(${r}, ${g}, ${b}, 0.1)`);

    const inkRgb = hexRgb(ink);
    set('--surface', `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.05)`);
    set('--surface-2', `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.09)`);

    const pr = hexRgb(paper2);
    const a = inkRgb;
    const stops = { 50: -0.04, 100: 0.06, 200: 0.16, 300: 0.3, 400: 0.45, 500: 0.56, 600: 0.67, 700: 0.78, 800: 0.88, 900: 0.94, 950: 1 };
    for (const key in stops) set(`--color-zinc-${key}`, lerpHex(a, pr, stops[key]));

    set('--color-white', ink);
    set('--color-black', paper2);
    set('--color-neutral-100', ink);
    set('--color-neutral-400', lerpHex(a, pr, 0.45));
    set('--color-neutral-500', lerpHex(a, pr, 0.56));
    set('--color-gray-400', lerpHex(a, pr, 0.45));
    set('--color-gray-500', lerpHex(a, pr, 0.56));
    set('--color-slate-400', lerpHex(a, pr, 0.45));
    set('--color-stone-400', lerpHex(a, pr, 0.45));

    const pole = [255, 255, 255];
    for (const fam of DECOR_FAMILIES) {
      set(`--color-${fam}-100`, lerpHex([r, g, b], pole, 0.58));
      set(`--color-${fam}-200`, lerpHex([r, g, b], pole, 0.44));
      set(`--color-${fam}-300`, lerpHex([r, g, b], pole, 0.28));
      set(`--color-${fam}-400`, lerpHex([r, g, b], pole, 0.12));
      set(`--color-${fam}-500`, seed);
      set(`--color-${fam}-600`, accentDim);
    }
  }

  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement('meta');
    metaThemeColor.name = 'theme-color';
    document.head.appendChild(metaThemeColor);
  }
  metaThemeColor.content = invert ? '#ede6d6' : '#0c0705';
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
