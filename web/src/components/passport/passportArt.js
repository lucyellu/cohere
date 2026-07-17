import { generateImage } from '../../api.js';
import { visaPrompt, entryPrompt, ticketPrompt, souvenirPrompt } from '../../account.js';

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

// Prompts are rebuilt from the live builders at generation time (instead of
// the snapshot minted onto the item) so prompt improvements reach items that
// were minted before the change. The stored prompt is only a fallback.
function promptFor(item) {
  if (item?.type === 'visa') return visaPrompt({ country: item.country, rule: item.rule });
  if (item?.type === 'entry') return entryPrompt(item);
  if (item?.type === 'ticket') return ticketPrompt(item);
  if (item?.type === 'souvenir') return souvenirPrompt(item);
  return item?.prompt || '';
}

// Generate art from the item's prompt (Groq could enrich later).
export async function generateArtFor(item) {
  const prompt = promptFor(item) || item?.prompt || '';
  if (!prompt) throw new Error('No prompt for this item.');
  const res = await generateImage('pollinations', prompt, { label: `passport-${item.type || 'art'}` }).catch(() => null);
  if (res?.ok && res.image) {
    saveArt(item.id, res.image);
    return res.image;
  }
  throw new Error(res?.error || 'Art generation is unavailable right now.');
}
