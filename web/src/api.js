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

export async function getLyrics(track, artist) {
  const res = await fetch(
    `/api/musixmatch/lyrics?track=${encodeURIComponent(track)}&artist=${encodeURIComponent(artist)}`
  );
  return res.json();
}

// BYOC scene synthesis. Sends the prompt to the gateway; if the viewer has
// stored their own Gemini key, it rides along as x-byoc-key for a live call.
export async function synthesizeScene(prompt, label) {
  const byoc = localStorage.getItem('reverb_byoc_gemini') || '';
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(byoc ? { 'x-byoc-key': byoc } : {}) },
    body: JSON.stringify({ prompt, label }),
  });
  return res.json();
}
