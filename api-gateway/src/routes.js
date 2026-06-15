// All gateway routes. Each data route checks the service's effective mode
// (mock vs live) and either serves a local mock payload or proxies the real API.

import express from 'express';
import { SERVICES, SERVICE_IDS, hasKey, isMock, getOverride, setOverride } from './services.js';
import { snapshot, record } from './usage.js';
import { callLive, serveMock } from './proxy.js';

const router = express.Router();

// --- Health: config + live usage snapshot for the monitor panel ---------
router.get('/health', (_req, res) => {
  const usage = snapshot();
  const services = SERVICE_IDS.map((id) => {
    const mock = isMock(id);
    const key = hasKey(id);
    let status; // green | mock | nokey | offline
    if (!key) status = 'nokey';
    else if (mock) status = 'mock';
    else status = (usage[id].lastStatus && usage[id].lastStatus >= 400) ? 'offline' : 'green';
    return {
      id,
      ...SERVICES[id],
      hasKey: key,
      mock,
      override: getOverride(id),
      status,
      usage: usage[id],
    };
  });
  res.json({ ok: true, uptime: process.uptime(), services });
});

// --- Toggle a service between mock and live at runtime -------------------
router.post('/config/mock', express.json(), (req, res) => {
  const { id, useMock } = req.body || {};
  if (!SERVICE_IDS.includes(id)) return res.status(400).json({ error: 'unknown service id' });
  if (typeof useMock !== 'boolean' && useMock !== null) {
    return res.status(400).json({ error: 'useMock must be true, false, or null' });
  }
  if (useMock === false && !hasKey(id)) {
    return res.status(409).json({ error: `cannot go live: no API key for ${id}` });
  }
  setOverride(id, useMock);
  res.json({ id, override: getOverride(id), mock: isMock(id) });
});

// Helper: serve mock or proxy live based on effective mode.
async function resolve(id, buildLiveUrl, options) {
  if (isMock(id)) return serveMock(id);
  return callLive(id, buildLiveUrl(), options);
}

// --- Musixmatch: lyrics & track search -----------------------------------
router.get('/musixmatch/search', async (req, res) => {
  const q = req.query.q || 'coldplay';
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    return `https://api.musixmatch.com/ws/1.1/track.search?q_track=${encodeURIComponent(q)}&page_size=5&s_track_rating=desc&apikey=${key}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Musixmatch: lyrics for a specific track -----------------------------
router.get('/musixmatch/lyrics', async (req, res) => {
  const { track, artist } = req.query;
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    const p = new URLSearchParams({ apikey: key });
    if (track) p.set('q_track', track);
    if (artist) p.set('q_artist', artist);
    return `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?${p.toString()}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- JamBase Data v3: tour events by artist or region --------------------
// Base host is api.data.jambase.com; auth is a Bearer token (NOT a query key).
// A bare `artistName` filter matches tribute acts too, so when an artist is
// given we first resolve the exact artist -> its identifier, then query events
// by id for clean single-artist results.
const JB_BASE = 'https://api.data.jambase.com/v3';
const jbAuth = () => ({
  headers: { Authorization: `Bearer ${process.env.JAMBASE_API_KEY}`, Accept: 'application/json' },
});

router.get('/jambase/events', async (req, res) => {
  const { artist, geoStateIso } = req.query;

  if (isMock('jambase')) return res.json(await serveMock('jambase'));

  // Step 1: resolve artist name -> identifier (prefer an exact, case-insensitive match).
  let artistId = null;
  if (artist) {
    const lookup = await callLive('jambase', `${JB_BASE}/artists?artistName=${encodeURIComponent(artist)}&perPage=10`, jbAuth());
    const arts = lookup.data?.artists || [];
    const exact = arts.find((a) => a.name?.toLowerCase() === artist.toLowerCase());
    artistId = (exact || arts[0])?.identifier || null;
  }

  // Step 2: events, by resolved id when possible, else fall back to loose name search.
  const params = new URLSearchParams({ perPage: '30' });
  if (artistId) params.set('artistId', artistId);
  else if (artist) params.set('artistName', artist);
  if (geoStateIso) params.set('geoStateIso', geoStateIso);

  const result = await callLive('jambase', `${JB_BASE}/events?${params.toString()}`, jbAuth());
  res.status(result.ok ? 200 : 502).json(result);
});

// --- YouTube: crowd-sourced concert video search -------------------------
router.get('/youtube/search', async (req, res) => {
  const q = req.query.q || 'coldplay live';
  const result = await resolve('youtube', () => {
    const key = process.env.YOUTUBE_API_KEY;
    return `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(q)}&key=${key}`;
  });
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Songstats: artist search / streaming analytics ----------------------
router.get('/songstats/search', async (req, res) => {
  const q = req.query.q || 'coldplay';
  const result = await resolve(
    'songstats',
    () => `https://api.songstats.com/enterprise/v1/artists/search?q=${encodeURIComponent(q)}&limit=5`,
    { headers: { apikey: process.env.SONGSTATS_API_KEY, Accept: 'application/json' } }
  );
  res.status(result.ok ? 200 : 502).json(result);
});

// --- Pinterest: extract a style-seed image from a public Pin/board URL ----
// Uses Open Graph meta tags (same as a link preview) — no API key or OAuth.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

router.get('/pinterest/extract', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ ok: false, error: 'url required' });

  if (isMock('pinterest')) {
    record('pinterest', { status: 200, latencyMs: 0, bytes: url.length, mode: 'mock', error: null });
    return res.json({
      ok: true,
      mode: 'mock',
      image: 'https://i.pinimg.com/736x/cb/ce/85/cbce8580e35f151f130054ffb8254390.jpg',
      title: 'Music festival stage (mock seed)',
      text: 'Futuristic outdoor festival stage, lasers and LED walls, dense crowd, neon lighting.',
    });
  }

  // Direct image URL — use as-is, no scraping needed.
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || /i\.pinimg\.com/.test(url)) {
    record('pinterest', { status: 200, latencyMs: 0, bytes: url.length, mode: 'live', error: null });
    return res.json({ ok: true, mode: 'live', image: url, title: '', text: '' });
  }

  const result = await callLive('pinterest', url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!result.ok || typeof result.data !== 'string') {
    return res.status(502).json({ ok: false, error: `fetch failed (HTTP ${result.status})` });
  }
  const og = parseOg(result.data);
  if (!og.image) return res.status(422).json({ ok: false, error: 'no image found at that URL' });
  res.json({ ok: true, mode: 'live', image: og.image, title: og.title, text: [og.title, og.description].filter(Boolean).join('. ') });
});

function parseOg(html) {
  const grab = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']og:${prop}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0] || '';
    return tag.match(/content=["']([^"']+)["']/i)?.[1] || '';
  };
  return { image: grab('image'), title: grab('title'), description: grab('description') };
}

// --- Gemini (BYOC): synthesize a concert scene for a missing-footage song -
// Order of resolution:
//   1. a viewer-supplied key (x-byoc-key header) -> always a live call (their compute)
//   2. else if gemini is in mock mode -> a placeholder scene (works offline)
//   3. else -> live call with the gateway's own key
router.post('/gemini/generate', express.json({ limit: '256kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '');
  const label = String(req.body?.label || '');
  const seedImageUrl = String(req.body?.seedImageUrl || '');
  const seedText = String(req.body?.seedText || '');
  const byoc = (req.get('x-byoc-key') || '').trim();

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (!byoc && isMock('gemini')) {
    record('gemini', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    // Before Gemini is live, show the Pinterest seed itself as the scene (if any).
    return res.json({
      ok: true,
      mode: seedImageUrl ? 'seed' : 'mock',
      image: seedImageUrl || placeholderScene(label),
    });
  }

  const fullPrompt = seedText ? `${prompt} Match this visual style: ${seedText}` : prompt;
  const parts = [{ text: fullPrompt }];
  if (seedImageUrl) {
    const seed = await fetchImageBase64(seedImageUrl);
    if (seed) parts.push({ inlineData: seed }); // image-to-image style reference
  }

  const key = byoc || process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`;
  const result = await callLive('gemini', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  const mode = byoc ? 'byoc' : 'live';
  if (!result.ok) {
    const msg = result.data?.error?.message || `HTTP ${result.status}`;
    // Degrade gracefully: still return a placeholder so the UI shows something.
    return res.status(502).json({ ok: false, mode, error: msg, image: placeholderScene(label) });
  }

  const respParts = result.data?.candidates?.[0]?.content?.parts || [];
  const img = respParts.find((p) => p.inlineData?.data);
  if (!img) {
    return res.status(502).json({ ok: false, mode, error: 'no image in response', image: placeholderScene(label) });
  }
  res.json({ ok: true, mode, image: `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}` });
});

// Fetch a remote image and base64-encode it for Gemini image-to-image input.
async function fetchImageBase64(imgUrl) {
  try {
    const r = await fetch(imgUrl, { headers: { 'User-Agent': BROWSER_UA } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null; // cap at 4MB
    return { mimeType: r.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') };
  } catch {
    return null;
  }
}

// SVG placeholder "scene" so the BYOC flow is demoable before the API is live.
function placeholderScene(label) {
  const safe = (label || 'Synthesized scene').replace(/[<&>]/g, '').slice(0, 48);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='#3b0764'/><stop offset='0.55' stop-color='#1e1b4b'/><stop offset='1' stop-color='#020617'/>
      </linearGradient>
      <radialGradient id='spot' cx='0.5' cy='0.3' r='0.55'>
        <stop offset='0' stop-color='#a78bfa' stop-opacity='0.55'/><stop offset='1' stop-color='#a78bfa' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <rect width='1280' height='720' fill='url(#g)'/>
    <rect width='1280' height='720' fill='url(#spot)'/>
    <rect y='560' width='1280' height='160' fill='#000' opacity='0.45'/>
    <text x='640' y='350' text-anchor='middle' fill='#e9d5ff' font-family='sans-serif' font-size='44' font-weight='700'>${safe}</text>
    <text x='640' y='400' text-anchor='middle' fill='#a1a1aa' font-family='sans-serif' font-size='21'>synthesized scene · placeholder</text>
    <text x='640' y='436' text-anchor='middle' fill='#71717a' font-family='sans-serif' font-size='15'>enable the Gemini API or add a BYOC key for real AI generation</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// --- Stub services (mock only until keys arrive) -------------------------
for (const id of ['cyanite', 'lalalai', 'elevenlabs']) {
  router.get(`/${id}/ping`, async (_req, res) => {
    const result = await serveMock(id);
    res.json(result);
  });
}

export default router;
