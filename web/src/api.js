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
  suno: '/api/suno/accounts',
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

// Returns { items, error }. `error` is set on quota/API failure so the UI can
// distinguish "YouTube quota reached" from "this song genuinely has no footage".
export async function youtubeSearch(q) {
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`).catch(() => null);
  const j = await res?.json().catch(() => null);
  const items = (j?.data?.items || []).filter((i) => i?.id?.videoId);
  let error = null;
  const apiErr = j?.data?.error;
  if (apiErr) {
    const reason = apiErr.errors?.[0]?.reason || '';
    error = /quota/i.test(reason) || apiErr.code === 403 ? 'quota' : 'api';
  } else if (!j || j.ok === false) {
    error = 'api';
  }
  return { items, error };
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

// Enrich a base scene description into a vivid, concrete image prompt using a
// free LLM (Cerebras, then Groq as fallback). Returns '' if both are unavailable.
export async function enrichPrompt(basePrompt) {
  const system =
    'You are a concert visual art director. Rewrite the scene description into ONE vivid, ' +
    'concrete image-generation prompt: a single paragraph, no preamble, no lists. Emphasize ' +
    'lighting, lens/composition, atmosphere, color, and crowd energy. Under 110 words. The ' +
    'image must contain no text or watermark.';
  for (const provider of ['cerebras', 'groq']) {
    const res = await generateText(provider, basePrompt, { system, maxTokens: 320 }).catch(() => null);
    const t = (res?.text || '').trim();
    if (res?.ok && t) return t;
  }
  return '';
}

// The image backend the viewer picked in the BYOC modal.
// 'auto' (Gemini → FLUX fallback) | 'pollinations' | 'huggingface'.
export function getImageProvider() {
  return localStorage.getItem('reverb_img_provider') || 'auto';
}

// BYOC scene synthesis. Honors the picked provider; otherwise:
//   1. Gemini — viewer's stored key (x-byoc-key, "their compute") or gateway key.
//   2. Fallback to Pollinations (free, keyless FLUX) for a REAL image.
//   3. Else return whatever Gemini gave (placeholder/seed).
export async function synthesizeScene(prompt, label) {
  const provider = getImageProvider();
  const byoc = localStorage.getItem('reverb_byoc_gemini') || '';
  const seedImageUrl = localStorage.getItem('reverb_seed_image') || '';
  const seedText = localStorage.getItem('reverb_seed_text') || '';
  const fullPrompt = seedText ? `${prompt} Visual style reference: ${seedText}` : prompt;

  // Forced free-FLUX providers skip Gemini entirely.
  if (provider === 'pollinations' || provider === 'huggingface') {
    const r = await generateImage(provider, fullPrompt, { label }).catch(() => null);
    if (r?.ok && r.image && r.mode === 'live') return { ...r, mode: provider };
    // chosen provider failed (e.g. HF has no key) → fall through to the cascade
  }

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
  const poll = await generateImage('pollinations', fullPrompt, { label }).catch(() => null);
  if (poll?.ok && poll.image && poll.mode === 'live') return { ...poll, mode: 'pollinations' };

  return gem || { ok: false, error: 'generation unavailable' };
}

// --- Suno: unified 6-account library -------------------------------------

// Live auth status of all 6 Suno accounts.
export async function sunoAccounts() {
  const res = await fetch('/api/suno/accounts').catch(() => null);
  return (await res?.json().catch(() => null)) || { ok: false, accounts: [] };
}

// Merged library feed across ALL accounts (newest first). page/pages per account.
export async function sunoFeed({ page = 0, pages = 1 } = {}) {
  const res = await fetch(`/api/suno/feed?page=${page}&pages=${pages}`).catch(() => null);
  return (await res?.json().catch(() => null)) || { ok: false, clips: [], accounts: [] };
}

// --- BYOC pool -----------------------------------------------------------

export async function byocPool(showId) {
  const q = showId ? `?showId=${encodeURIComponent(showId)}` : '';
  const res = await fetch(`/api/byoc/pool${q}`).catch(() => null);
  return (await res?.json().catch(() => null)) || { ok: false };
}

// --- Synthesize a missing performance (pipeline) -------------------------

export async function synthesizePerformance({ song, showId, imageCount = 4, videoMode = 'slideshow' }) {
  const res = await fetch('/api/pipeline/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song, showId, imageCount, videoMode }),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) || { ok: false, error: 'pipeline unreachable' };
}
