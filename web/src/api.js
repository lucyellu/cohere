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
  songstats: '/api/songstats/ping',
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
