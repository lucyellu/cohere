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

// BYOC scene synthesis. Sends the prompt to the gateway; if the viewer has
// stored their own Gemini key, it rides along as x-byoc-key for a live call.
// A stored Pinterest style-seed (image + text) is blended in when present.
export async function synthesizeScene(prompt, label) {
  const byoc = localStorage.getItem('reverb_byoc_gemini') || '';
  const seedImageUrl = localStorage.getItem('reverb_seed_image') || '';
  const seedText = localStorage.getItem('reverb_seed_text') || '';
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(byoc ? { 'x-byoc-key': byoc } : {}) },
    body: JSON.stringify({ prompt, label, seedImageUrl, seedText }),
  });
  return res.json();
}
