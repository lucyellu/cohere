// Thin client for the gateway. All calls are same-origin via the Vite proxy.

export async function getHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function setMock(id, useMock) {
  const res = await fetch('/api/config/mock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, useMock }),
  });
  return res.json();
}

// Fire a real sample request through a service so its usage stats populate.
const PROBES = {
  musixmatch: '/api/musixmatch/search?q=coldplay',
  jambase: '/api/jambase/events?artist=Coldplay',
  youtube: '/api/youtube/search?q=coldplay%20live',
  songstats: '/api/songstats/search?q=coldplay',
  pinterest: '/api/pinterest/extract?url=https://www.pinterest.com/pin/concert-stage-design-stage-set-design-stage-lighting-design--59039445095226117/',
  pollinations: '/api/pollinations/probe',
  huggingface: '/api/huggingface/probe',
  cerebras: '/api/cerebras/probe',
  groq: '/api/groq/probe',
  cyanite: '/api/cyanite/ping',
  lalalai: '/api/lalalai/ping',
  elevenlabs: '/api/elevenlabs/ping',
};

export async function probe(id) {
  const url = PROBES[id];
  if (!url) return null;
  const res = await fetch(url);
  return res.json();
}

export async function probeAll() {
  await Promise.all(Object.keys(PROBES).map((id) => probe(id).catch(() => null)));
}

// --- Show-page data ------------------------------------------------------

export async function youtubeSearch(q) {
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

// Real setlist for a show via setlist.fm (exact-date match, else the artist's
// most recent past setlist). Returns { songs, exact, source } or empty.
export async function getSetlist(artist, date) {
  const res = await fetch(
    `/api/setlistfm/setlist?artist=${encodeURIComponent(artist)}&date=${encodeURIComponent(date || '')}`
  );
  return res.json().catch(() => null);
}

// An artist's top tracks — used as a setlist fallback for live shows (JamBase
// Data doesn't return setlists). Filters to the artist and dedupes by name.
export async function getTopTracks(artist) {
  const res = await fetch(`/api/musixmatch/top?artist=${encodeURIComponent(artist)}`);
  const d = await res.json().catch(() => null);
  const list = d?.data?.message?.body?.track_list || [];
  const wanted = artist.toLowerCase();
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const t = item.track || {};
    const name = t.track_name;
    if (!name || seen.has(name.toLowerCase())) continue;
    if (t.artist_name && !t.artist_name.toLowerCase().includes(wanted)) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 10);
}

export async function getLyrics(track, artist) {
  const res = await fetch(
    `/api/musixmatch/lyrics?track=${encodeURIComponent(track)}&artist=${encodeURIComponent(artist)}`
  );
  return res.json();
}

// Extract a style-seed image + description from a public Pinterest/image URL.
export async function extractPin(url) {
  const res = await fetch(`/api/pinterest/extract?url=${encodeURIComponent(url)}`);
  return res.json();
}

// Free-tier text generation via Cerebras or Groq (OpenAI-compatible LLMs).
// provider: 'cerebras' | 'groq'. Returns { ok, text, model, mode }. Useful for
// lore-pack narration, enriching the BYOC image prompt, or song blurbs.
export async function generateText(provider, prompt, opts = {}) {
  const res = await fetch(`/api/${provider}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...opts }),
  });
  return res.json();
}

// Free image generation. provider: 'pollinations' (keyless FLUX) | 'huggingface'
// (FLUX.1-schnell). Returns { ok, image: 'data:...', model, mode }.
export async function generateImage(provider, prompt, opts = {}) {
  const res = await fetch(`/api/${provider}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...opts }),
  });
  return res.json();
}

// BYOC scene synthesis. Resolution order:
//   1. Gemini — uses the viewer's stored key (x-byoc-key, "their compute") or
//      the gateway key. A stored Pinterest style-seed is blended in when present.
//   2. If Gemini isn't truly live (disabled → placeholder/seed) or errors, fall
//      back to Pollinations (free, keyless FLUX) so we still get a REAL image.
//   3. If that fails too, return whatever Gemini gave (placeholder/seed).
export async function synthesizeScene(prompt, label) {
  const byoc = localStorage.getItem('reverb_byoc_gemini') || '';
  const seedImageUrl = localStorage.getItem('reverb_seed_image') || '';
  const seedText = localStorage.getItem('reverb_seed_text') || '';

  const gem = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(byoc ? { 'x-byoc-key': byoc } : {}) },
    body: JSON.stringify({ prompt, label, seedImageUrl, seedText }),
  })
    .then((r) => r.json())
    .catch(() => null);

  // A real Gemini render (the viewer's compute or the gateway key) wins.
  if (gem?.ok && gem.image && (gem.mode === 'byoc' || gem.mode === 'live')) return gem;

  // Otherwise generate a real image for free via Pollinations FLUX.
  const fullPrompt = seedText ? `${prompt} Visual style reference: ${seedText}` : prompt;
  const poll = await generateImage('pollinations', fullPrompt, { label }).catch(() => null);
  if (poll?.ok && poll.image && poll.mode === 'live') return { ...poll, mode: 'pollinations' };

  return gem || { ok: false, error: 'generation unavailable' };
}
