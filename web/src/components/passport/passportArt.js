import { generateImage } from '../../api.js';

// On-demand FLUX art for passport items, cached to localStorage as data URLs so
// each collectible is generated once. The CSS card always renders without it.
const ART_KEY = 'cohear_passport_art_v1';

export function readArtMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ART_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveArt(id, dataUrl) {
  const map = readArtMap();
  map[id] = dataUrl;
  try {
    localStorage.setItem(ART_KEY, JSON.stringify(map));
  } catch {
    // Storage full — drop the oldest half and retry once so new art still saves.
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.ceil(keys.length / 2))) delete map[k];
    map[id] = dataUrl;
    try { localStorage.setItem(ART_KEY, JSON.stringify(map)); } catch { /* give up; stays in-session */ }
  }
}

// Generate art from the item's pre-built prompt (Groq could enrich later).
export async function generateArtFor(item) {
  const prompt = item?.prompt || '';
  if (!prompt) throw new Error('No prompt for this item.');
  const res = await generateImage('pollinations', prompt, { label: `passport-${item.type || 'art'}` }).catch(() => null);
  if (res?.ok && res.image) {
    saveArt(item.id, res.image);
    return res.image;
  }
  throw new Error(res?.error || 'Art generation is unavailable right now.');
}
