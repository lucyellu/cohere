export const SEED_KEY = 'cohere_theme_seed';
export const INVERT_KEY = 'cohere_theme_invert';

export function hslHex(h, s, l) {
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

export const SEED_SWATCHES = [
  { label: 'Sage', hue: 80, sat: 25, lig: 60, hex: hslHex(80, 25, 60) },
  { label: 'Rose', hue: 350, sat: 30, lig: 65, hex: hslHex(350, 30, 65) },
  { label: 'Amber', hue: 38, sat: 50, lig: 62, hex: hslHex(38, 50, 62) },
  { label: 'Yellow', hue: 48, sat: 65, lig: 70, hex: hslHex(48, 65, 70) },
  { label: 'Teal', hue: 175, sat: 30, lig: 55, hex: hslHex(175, 30, 55) },
  { label: 'Violet', hue: 270, sat: 25, lig: 60, hex: hslHex(270, 25, 60) },
  { label: 'Slate', hue: 220, sat: 12, lig: 55, hex: hslHex(220, 12, 55) },
];

export function randomSeed() {
  return SEED_SWATCHES[Math.floor(Math.random() * SEED_SWATCHES.length)].hex;
}

export function isValidHex(hex) { return true; }

export function monoShades(seed, n = 1) { return []; }

export function applyTheme(seedHex, invert = false) {
  let preset = SEED_SWATCHES.find(p => p.hex.toLowerCase() === (seedHex||'').toLowerCase());
  if (!preset) {
    const {h, s, l} = hexToHsl(seedHex || SEED_SWATCHES[0].hex);
    preset = { label: 'Custom', hue: h, sat: s, lig: l, hex: seedHex };
  }
  
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  root.style.colorScheme = invert ? 'light' : 'dark';
  root.setAttribute('data-skin', invert ? 'paper' : 'night');

  // Hardcode accent to myspot's LCD green
  const accentHex = '#c8e85f';
  const accentDimHex = '#6a8030';
  const [ar, ag, ab] = hexRgb(accentHex);
  set('--accent', accentHex);
  set('--accent-r', String(ar));
  set('--accent-g', String(ag));
  set('--accent-b', String(ab));
  set('--accent-text', '#1a1206');
  set('--accent-dim', accentDimHex);

  const h = preset.hue;
  const s = preset.sat / 100;
  
  const pageSat = clamp(s * 0.55, 0, invert ? 0.22 : 0.5);
  const cardSat = clamp(s * 0.5, 0, invert ? 0.2 : 0.44);
  const inkSat = clamp(s * 0.4, 0, invert ? 0.5 : 0.3);

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
  
  const inkRgb = hexRgb(ink);
  const pr = hexRgb(paper2);
  const a = inkRgb;
  set('--surface', invert ? 'rgba(255, 255, 255, 0.5)' : `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.05)`);
  set('--surface-2', invert ? 'rgba(255, 255, 255, 0.7)' : `rgba(${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}, 0.09)`);

  const stops = { 50: -0.04, 100: 0.06, 200: 0.16, 300: 0.3, 400: 0.45, 500: 0.56, 600: 0.67, 700: 0.78, 800: 0.88, 900: 0.94, 950: 1 };
  for (const key in stops) set(`--color-zinc-${key}`, lerpHex(a, pr, stops[key]));

  set('--color-white', ink);
  set('--color-black', invert ? hslHex(h, inkSat * 100, 8) : paper2);
  set('--color-neutral-100', ink);
  set('--color-neutral-400', lerpHex(a, pr, 0.45));
  set('--color-neutral-500', lerpHex(a, pr, 0.56));
  set('--color-gray-400', lerpHex(a, pr, 0.45));
  set('--color-gray-500', lerpHex(a, pr, 0.56));
  set('--color-slate-400', lerpHex(a, pr, 0.45));
  set('--color-stone-400', lerpHex(a, pr, 0.45));

  const DECOR_FAMILIES = ['indigo', 'cyan', 'sky', 'blue', 'fuchsia', 'violet', 'purple', 'pink', 'teal', 'amber', 'yellow', 'orange', 'emerald', 'green', 'lime', 'red', 'rose'];
  const pole = invert ? hexRgb(paper2) : [255, 255, 255];
  for (const fam of DECOR_FAMILIES) {
    set(`--color-${fam}-100`, lerpHex(hexRgb(accentHex), pole, 0.58));
    set(`--color-${fam}-200`, lerpHex(hexRgb(accentHex), pole, 0.44));
    set(`--color-${fam}-300`, lerpHex(hexRgb(accentHex), pole, 0.28));
    set(`--color-${fam}-400`, lerpHex(hexRgb(accentHex), pole, 0.12));
    set(`--color-${fam}-500`, accentHex);
    set(`--color-${fam}-600`, accentDimHex);
  }
}

function hexToHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hh = 0, ss = 0;
  if (max !== min) {
    const d = max - min;
    ss = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hh = ((b - r) / d + 2) * 60;
    else hh = ((r - g) / d + 4) * 60;
  }
  return { h: hh, s: ss * 100, l: l * 100 };
}

function hexRgb(hex) {
  const c = String(hex || '').replace('#', '');
  return [parseInt(c.slice(0, 2), 16)||0, parseInt(c.slice(2, 4), 16)||0, parseInt(c.slice(4, 6), 16)||0];
}

function rgbHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function lerpHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return rgbHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
