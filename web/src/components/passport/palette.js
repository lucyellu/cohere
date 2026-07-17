// Deterministic vintage palettes so the same artist/city always prints the same
// colored paper (like the pink/green/yellow Beatles stub variants).

export function hashString(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Aged-paper ticket palettes (paper / ink / accent).
const TICKET_PALETTES = [
  { paper: '#f3d9df', ink: '#3a1c24', accent: '#c0394f' }, // faded rose
  { paper: '#d7e6cf', ink: '#22311d', accent: '#3f7d3a' }, // mint green
  { paper: '#f6e7b8', ink: '#3a2f12', accent: '#c0852a' }, // manila yellow
  { paper: '#cfe0ea', ink: '#1b2b38', accent: '#2f6f9e' }, // sky blue
  { paper: '#efe6d2', ink: '#2c2418', accent: '#a8531f' }, // kraft
  { paper: '#e7d7e6', ink: '#2f1f30', accent: '#8a3f93' }, // dusty violet
];

// Ink colors for rubber-stamp postmarks (entry stamps).
const ENTRY_INKS = ['#b4452f', '#2f5fb4', '#3a7d4f', '#8a3f6a', '#3f6d7d', '#9c5a1f'];

// One ink per immigration office: stamps from the same part of the world share
// a color, so a page of a real trip reads coherently (blue Americas, red
// Europe, green Asia…) instead of random confetti.
const REGION_INKS = {
  northamerica: '#2f5fb4', // blue
  europe: '#b4452f',       // red
  asia: '#3a7d4f',         // green
  southamerica: '#8a3f6a', // plum
  oceania: '#3f6d7d',      // teal
  africa: '#9c5a1f',       // sienna
};
const COUNTRY_REGION = {
  Canada: 'northamerica', 'United States': 'northamerica', Mexico: 'northamerica',
  'United Kingdom': 'europe', Ireland: 'europe', France: 'europe', Germany: 'europe',
  Spain: 'europe', Italy: 'europe', Netherlands: 'europe', Portugal: 'europe',
  Switzerland: 'europe', Austria: 'europe',
  Japan: 'asia', 'South Korea': 'asia', Singapore: 'asia', India: 'asia',
  'United Arab Emirates': 'asia',
  Australia: 'oceania', 'New Zealand': 'oceania',
  Brazil: 'southamerica', Argentina: 'southamerica', Chile: 'southamerica', Colombia: 'southamerica',
};

export function ticketPalette(seed) {
  return TICKET_PALETTES[hashString(seed || 'cohear') % TICKET_PALETTES.length];
}

export function entryInk(seed) {
  return ENTRY_INKS[hashString(seed || 'cohear') % ENTRY_INKS.length];
}

// Region-keyed ink with a per-seed fallback for countries we don't know.
export function regionInk(country, fallbackSeed) {
  const region = COUNTRY_REGION[country];
  return region ? REGION_INKS[region] : entryInk(fallbackSeed || country);
}

// Per-artist typography so no two tickets read the same — real vintage stubs
// were set by whichever print shop the promoter used (see ticketstubs (2).jpg).
const TICKET_TYPE_STYLES = [
  { head: '"Arial Black", "Helvetica Neue", ui-sans-serif, sans-serif', headWeight: 900, headTracking: '0.04em', headSize: '1rem' },     // wood-type block
  { head: 'Georgia, "Times New Roman", serif', headWeight: 700, headTracking: '0.02em', headSize: '1.1rem' },                            // playbill serif
  { head: 'ui-monospace, "Courier New", monospace', headWeight: 700, headTracking: '0.1em', headSize: '0.95rem' },                       // box-office teletype
  { head: 'Impact, "Arial Narrow", ui-sans-serif, sans-serif', headWeight: 400, headTracking: '0.09em', headSize: '1.12rem' },           // condensed poster
  { head: '"Trebuchet MS", Verdana, ui-sans-serif, sans-serif', headWeight: 800, headTracking: '0.06em', headSize: '0.98rem' },          // 70s promoter
];
export function ticketTypography(seed) {
  return TICKET_TYPE_STYLES[hashString(`${seed}:type`) % TICKET_TYPE_STYLES.length];
}

// Deterministic pseudo-random bar widths so barcodes look scanned, not striped.
export function barcodeBars(seed, count = 34) {
  let h = hashString(`${seed}:barcode`);
  const bars = [];
  for (let i = 0; i < count; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    bars.push({ w: 1 + (h % 3), gap: 1 + ((h >>> 4) % 3) });
  }
  return bars;
}

// A small deterministic rotation so a wall of stamps looks hand-applied.
export function stampRotation(seed, spread = 9) {
  const n = hashString(`${seed}:rot`) % (spread * 2 + 1);
  return n - spread; // -spread..+spread degrees
}

// --- Postage collections (the marijanapav.com stamp-album look) ---------------
// Every postage stamp face belongs to one of three print styles, echoing that
// site's monoline / textured / typographic collections. The same seed drives
// both the procedural face and the art-generation prompt so they always agree.
export const STAMP_COLLECTIONS = ['monoline', 'textured', 'typographic'];
export function stampCollection(seed) {
  return STAMP_COLLECTIONS[hashString(`${seed}:collection`) % STAMP_COLLECTIONS.length];
}

// Duotone hue family for textured/typographic faces — muted philatelic tones
// (ultramarine, carmine, viridian…), not the full random wheel.
const POSTAGE_HUES = [222, 355, 158, 28, 268, 195, 45, 330];
export function postageHue(seed) {
  return POSTAGE_HUES[hashString(`${seed}:hue`) % POSTAGE_HUES.length];
}

// National seal emoji for visa faces (lives here so VisaCard/VisaStamp/export
// can all share it without import cycles).
const COUNTRY_EMOJI = {
  Canada: '🍁', 'United States': '🗽', 'United Kingdom': '🎡', Ireland: '☘️',
  France: '🗼', Germany: '🍺', Spain: '💃', Italy: '🏛️', Netherlands: '🌷',
  Portugal: '⛵', Switzerland: '🏔️', Austria: '🎻', Japan: '🗾', 'South Korea': '🏯',
  Singapore: '🦁', Australia: '🦘', 'New Zealand': '🥝', Mexico: '🌮', Brazil: '🎉',
  India: '🛕', 'United Arab Emirates': '🕌',
};
export function countryEmoji(country) {
  return COUNTRY_EMOJI[country] || '🛂';
}

// Color words for prompt building — image models respond to names, not hexes.
const INK_WORDS = {
  '#2f5fb4': 'cobalt blue', '#b4452f': 'brick red', '#3a7d4f': 'forest green',
  '#8a3f6a': 'plum', '#3f6d7d': 'slate teal', '#9c5a1f': 'sienna brown',
};
export function inkWord(hex) {
  return INK_WORDS[hex] || 'deep ultramarine';
}
