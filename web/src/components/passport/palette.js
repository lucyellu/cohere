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

export function ticketPalette(seed) {
  return TICKET_PALETTES[hashString(seed || 'cohear') % TICKET_PALETTES.length];
}

export function entryInk(seed) {
  return ENTRY_INKS[hashString(seed || 'cohear') % ENTRY_INKS.length];
}

// A small deterministic rotation so a wall of stamps looks hand-applied.
export function stampRotation(seed, spread = 9) {
  const n = hashString(`${seed}:rot`) % (spread * 2 + 1);
  return n - spread; // -spread..+spread degrees
}
