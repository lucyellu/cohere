// All gateway routes. Each data route checks the service's effective mode
// (mock vs live) and either serves a local mock payload or proxies the real API.

import express from 'express';
import { SERVICES, SERVICE_IDS, hasKey, isMock, getOverride, setOverride } from './services.js';
import { snapshot, record } from './usage.js';
import { callLive, serveMock } from './proxy.js';
import { listAccounts, feedAll } from './suno.js';
import * as pool from './genpool.js';
import { synthesize } from './pipeline.js';
import * as live from './live.js';

const router = express.Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// --- Musixmatch: an artist's top tracks (setlist fallback for live shows) -
router.get('/musixmatch/top', async (req, res) => {
  const artist = req.query.artist || '';
  const result = await resolve('musixmatch', () => {
    const key = process.env.MUSIXMATCH_API_KEY;
    const p = new URLSearchParams({ apikey: key, s_track_rating: 'desc', page_size: '15' });
    if (artist) p.set('q_artist', artist);
    return `https://api.musixmatch.com/ws/1.1/track.search?${p.toString()}`;
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
  const { artist, geoStateIso, source } = req.query;

  // `source` lets the client pick per request: 'mock' = curated demo tour,
  // 'live' = real JamBase. Otherwise fall back to the service's toggle state.
  const useMock = source === 'mock' || (source !== 'live' && isMock('jambase'));
  if (useMock) return res.json(await serveMock('jambase'));

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

// --- setlist.fm: real setlist for a show (or the artist's most recent) ----
// JamBase shows are upcoming (no setlist yet), so if there's no exact-date
// match we return the most recent PAST setlist = "what they've been playing".
router.get('/setlistfm/setlist', async (req, res) => {
  const { artist, date } = req.query;

  if (isMock('setlistfm')) {
    // No key yet -> return empty so the Show page falls back to top tracks
    // (rather than showing a fake setlist for a real artist).
    record('setlistfm', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', songs: [], exact: false });
  }

  const result = await callLive(
    'setlistfm',
    `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist || '')}&p=1`,
    { headers: { 'x-api-key': process.env.SETLISTFM_API_KEY, Accept: 'application/json' } }
  );
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: `HTTP ${result.status}`, songs: [] });
  }

  const setlists = (result.data?.setlist || []).filter((s) => extractSetlistSongs(s).length);
  const want = isoToDmy(String(date || '').slice(0, 10)); // 2026-06-23 -> 23-06-2026
  const exactMatch = setlists.find((s) => s.eventDate === want);
  const chosen = exactMatch || setlists[0];
  if (!chosen) return res.json({ ok: true, mode: 'live', songs: [], exact: false });

  res.json({
    ok: true,
    mode: 'live',
    exact: Boolean(exactMatch),
    songs: extractSetlistSongs(chosen),
    source: {
      date: chosen.eventDate,
      venue: chosen.venue?.name || '',
      city: chosen.venue?.city?.name || '',
      tour: chosen.tour?.name || '',
    },
  });
});

function extractSetlistSongs(s) {
  return (s?.sets?.set || []).flatMap((set) => (set.song || []).map((x) => x.name)).filter(Boolean);
}

function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

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

// --- Image generation (Pollinations FLUX keyless + HuggingFace FLUX) ------
// Image APIs return raw image BYTES, not JSON, so they can't use callLive
// (which parses text/JSON). This helper fetches binary, validates it's an
// image, records usage, and returns a base64 data URL — the same shape the
// Show page already consumes from /gemini/generate.
async function generateImageLive(id, url, options = {}) {
  const start = Date.now();
  try {
    const r = await fetch(url, options);
    const buf = Buffer.from(await r.arrayBuffer());
    const latencyMs = Date.now() - start;
    const ct = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok) {
      const snippet = buf.toString('utf8').slice(0, 200);
      record(id, { status: r.status, latencyMs, bytes: buf.length, mode: 'live', error: `HTTP ${r.status}` });
      return { ok: false, status: r.status, error: `HTTP ${r.status}: ${snippet}` };
    }
    if (!ct.startsWith('image/') || buf.length < 1024) {
      record(id, { status: 502, latencyMs, bytes: buf.length, mode: 'live', error: 'non-image response' });
      return { ok: false, status: 502, error: `non-image response (ct=${ct}, bytes=${buf.length})` };
    }
    record(id, { status: r.status, latencyMs, bytes: buf.length, mode: 'live', error: null });
    return { ok: true, status: r.status, bytes: buf.length, image: `data:${ct};base64,${buf.toString('base64')}` };
  } catch (err) {
    record(id, { status: 0, latencyMs: Date.now() - start, bytes: 0, mode: 'live', error: err.message });
    return { ok: false, status: 0, error: err.message };
  }
}

// Pollinations — free, keyless FLUX text-to-image (GET, prompt in the path).
router.post('/pollinations/generate', express.json({ limit: '64kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const label = String(req.body?.label || '');
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (isMock('pollinations')) {
    record('pollinations', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', model: 'mock', image: placeholderScene(label || 'Pollinations FLUX') });
  }

  const model = req.body?.model ? String(req.body.model) : 'flux';
  const width = Number(req.body?.width) || 1024;
  const height = Number(req.body?.height) || 1024;
  const encoded = encodeURIComponent(prompt.slice(0, 1900));
  const seed = Date.now() % 1_000_000;
  const url =
    `https://image.pollinations.ai/prompt/${encoded}` +
    `?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&enhance=true`;

  const result = await generateImageLive('pollinations', url, { headers: { 'User-Agent': 'musicathon/0.1' } });
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: result.error, image: placeholderScene(label) });
  }
  res.json({ ok: true, mode: 'live', model: `pollinations/${model}`, image: result.image });
});

// HuggingFace FLUX.1-schnell — POST { inputs, parameters }, Bearer HF_TOKEN.
router.post('/huggingface/generate', express.json({ limit: '64kb' }), async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const label = String(req.body?.label || '');
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

  if (isMock('huggingface')) {
    record('huggingface', { status: 200, latencyMs: 0, bytes: prompt.length, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock', model: 'mock', image: placeholderScene(label || 'FLUX.1-schnell') });
  }

  const model = req.body?.model ? String(req.body.model) : 'black-forest-labs/FLUX.1-schnell';
  const url = `https://router.huggingface.co/hf-inference/models/${model}`;
  const result = await generateImageLive('huggingface', url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt.slice(0, 1900), parameters: { width: 1024, height: 1024 } }),
  });
  if (!result.ok) {
    return res.status(502).json({ ok: false, mode: 'live', error: result.error, image: placeholderScene(label) });
  }
  res.json({ ok: true, mode: 'live', model: `hf/${model}`, image: result.image });
});

// Dashboard "Probe" buttons (GET) — a small live generation so stats populate.
router.get('/pollinations/probe', async (_req, res) => {
  if (isMock('pollinations')) {
    record('pollinations', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock' });
  }
  const seed = Date.now() % 1_000_000;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent('a glowing neon concert stage')}` +
    `?width=512&height=512&model=flux&seed=${seed}&nologo=true`;
  const result = await generateImageLive('pollinations', url, { headers: { 'User-Agent': 'musicathon/0.1' } });
  res.status(result.ok ? 200 : 502).json({ ok: result.ok, mode: 'live', bytes: result.bytes || 0, error: result.ok ? null : result.error });
});

router.get('/huggingface/probe', async (_req, res) => {
  if (isMock('huggingface')) {
    record('huggingface', { status: 200, latencyMs: 0, bytes: 0, mode: 'mock', error: null });
    return res.json({ ok: true, mode: 'mock' });
  }
  const url = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
  const result = await generateImageLive('huggingface', url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'a glowing neon concert stage', parameters: { width: 512, height: 512 } }),
  });
  res.status(result.ok ? 200 : 502).json({ ok: result.ok, mode: 'live', bytes: result.bytes || 0, error: result.ok ? null : result.error });
});

// --- Cerebras / Groq (free-tier text generation) -------------------------
// Both expose an OpenAI-compatible Chat Completions API, so one helper covers
// both: POST {baseUrl}/chat/completions with a Bearer key. Text only — neither
// generates images (Groq has vision = image *understanding*, not generation).
const FREE_LLM = {
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    defaultModel: process.env.CEREBRAS_TEXT_MODEL || 'gpt-oss-120b',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
  },
};

async function chatCompletion(id, { prompt, system, model, maxTokens }) {
  const cfg = FREE_LLM[id];
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const result = await callLive(id, `${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env[cfg.keyEnv]}`,
    },
    body: JSON.stringify({
      model: model || cfg.defaultModel,
      messages,
      // Reasoning models (e.g. gpt-oss-120b) spend tokens thinking before they
      // emit content, so give a generous default budget or `content` comes back
      // empty (finish_reason: length).
      max_tokens: maxTokens || 1024,
    }),
  });
  return result;
}

// Pull the assistant text out of an OpenAI-compatible response (live or mock).
// Reasoning models may leave `content` empty and put the answer (or its
// chain-of-thought) under `reasoning` — fall back to that so the UI isn't blank.
function extractText(data) {
  const msg = data?.choices?.[0]?.message || {};
  return msg.content || msg.reasoning || msg.reasoning_content || '';
}

for (const id of ['cerebras', 'groq']) {
  // Text generation — POST { prompt, system?, model?, maxTokens? } -> { text }.
  router.post(`/${id}/generate`, express.json({ limit: '64kb' }), async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' });

    if (isMock(id)) {
      const mock = await serveMock(id);
      return res.json({ ok: true, mode: 'mock', text: extractText(mock.data), model: 'mock' });
    }

    const result = await chatCompletion(id, {
      prompt,
      system: req.body?.system ? String(req.body.system) : '',
      model: req.body?.model ? String(req.body.model) : '',
      maxTokens: Number(req.body?.maxTokens) || 0,
    });
    if (!result.ok) {
      const msg = result.data?.error?.message || `HTTP ${result.status}`;
      return res.status(502).json({ ok: false, mode: 'live', error: msg });
    }
    res.json({
      ok: true,
      mode: 'live',
      model: result.data?.model || '',
      text: extractText(result.data),
    });
  });

  // Dashboard "Probe" — a tiny live ping so usage stats populate (GET).
  router.get(`/${id}/probe`, async (_req, res) => {
    if (isMock(id)) return res.json(await serveMock(id));
    const result = await chatCompletion(id, {
      prompt: 'Reply with the single word: ok',
      maxTokens: 5,
    });
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: 'live',
      model: result.data?.model || '',
      text: extractText(result.data),
      error: result.ok ? null : result.data?.error?.message || `HTTP ${result.status}`,
    });
  });
}

// --- Stub services (mock only until keys arrive) -------------------------
for (const id of ['cyanite', 'lalalai', 'elevenlabs']) {
  router.get(`/${id}/ping`, async (_req, res) => {
    const result = await serveMock(id);
    res.json(result);
  });
}

// --- Suno: unified multi-account library --------------------------------
// Reads all 6 accounts from suno-dl/accounts.json and fans the live feed out
// across them in parallel. Defaults to LIVE (creds are local & free); pass
// ?source=mock to force the canned payload, or it falls back to mock on failure.

// Auth status for every account — "see all accounts at once".
router.get('/suno/accounts', async (_req, res) => {
  try {
    res.json({ ok: true, accounts: await listAccounts() });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Merged library feed across ALL accounts. ?page=N&pages=M&source=live|mock
router.get('/suno/feed', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 0;
  const pages = parseInt(req.query.pages, 10) || 1;
  if (req.query.source === 'mock') return res.json(await serveMock('suno'));
  try {
    const result = await feedAll({ page, pages });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    record('suno', { status: 0, latencyMs: 0, bytes: 0, mode: 'live', error: e.message });
    res.status(502).json(await serveMock('suno').then((m) => ({ ...m.data, _liveError: e.message })));
  }
});

// --- BYOC generation pool ------------------------------------------------
// Fans join a show and contribute capacity; scene/generate picks the best
// available provider with quota and always falls back to free Pollinations.

// A fan joins a show (creates/refreshes their identity + show membership).
router.post('/byoc/join', express.json(), (req, res) => {
  const { userId, name, showId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json(pool.join(userId, name, showId));
});

// Contribute capacity. v1 wires Meta workers (browser extension) end-to-end;
// the free Pollinations floor is always present. (Gemini/HF key pooling next.)
router.post('/byoc/contribute', express.json(), (req, res) => {
  const { userId, type = 'meta', name, capPerDay } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (type !== 'meta') {
    return res.status(400).json({ error: `only 'meta' is wired in v1 (Gemini/HF key pooling is next)` });
  }
  res.json(pool.contribute(userId, { type, name, capPerDay }));
});

// Live pool status for a show — drives the "N fans contributing X gens" UI.
router.get('/byoc/pool', (req, res) => {
  res.json({ ok: true, ...pool.poolStatus(req.query.showId) });
});

// --- Meta worker relay (the Reverb extension running in a fan's browser) ---
router.post('/byoc/worker/heartbeat', express.json(), (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json({ ok: true, workers: pool.heartbeat(userId) });
});

// Extension long-poll: hands back the next job for this user, or 204 if none.
router.get('/byoc/worker/poll', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  pool.heartbeat(userId);
  const job = pool.claimJob(userId);
  if (!job) return res.status(204).end();
  res.json({ ok: true, job: { id: job.id, prompt: job.prompt } });
});

// Extension posts the generated image (or an error) back.
router.post('/byoc/worker/result', express.json({ limit: '16mb' }), (req, res) => {
  const { jobId, imageUrl, error } = req.body || {};
  if (!jobId) return res.status(400).json({ error: 'jobId required' });
  res.json(pool.completeJob(jobId, { imageUrl, error }));
});

// --- Unified scene generation with fallback chain ------------------------
async function runProvider(p, prompt) {
  if (p.type === 'pollinations') {
    const seed = Date.now() % 100000;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&model=flux&seed=${seed}`;
    return { ok: true, imageUrl: url };
  }
  if (p.type === 'meta') {
    const job = pool.enqueueMeta(p, prompt);
    const deadline = Date.now() + 25000; // wait up to 25s for the fan's browser
    while (Date.now() < deadline) {
      await sleep(800);
      const j = pool.getJob(job.id);
      if (j.status === 'done') return { ok: true, imageUrl: j.result };
      if (j.status === 'failed') return { ok: false, error: j.error };
    }
    return { ok: false, error: 'meta worker timeout (no browser fulfilled it)' };
  }
  return { ok: false, error: `unsupported provider: ${p.type}` };
}

router.post('/scene/generate', express.json(), async (req, res) => {
  const { prompt, showId, preferType } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const tried = [];
  const exclude = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const p = pool.pick(showId, { preferType, exclude });
    if (!p) break;
    tried.push(p.type);
    const r = await runProvider(p, prompt);
    if (r.ok) {
      pool.recordUse(p.id);
      return res.json({ ok: true, provider: p.type, owner: p.owner, imageUrl: r.imageUrl, tried });
    }
    exclude.push(p.id);
  }
  res.status(502).json({ ok: false, error: 'all providers failed', tried });
});

// --- Synthesize a missing performance (full pipeline) -------------------
// YouTube/Music audio -> Suno seed (stub) -> AI visuals (pool) -> slideshow.
router.post('/pipeline/synthesize', express.json(), async (req, res) => {
  const { song, showId, youtubeUrl, audioUrl, imageCount, videoMode } = req.body || {};
  try {
    const result = await synthesize({ song, showId, youtubeUrl, audioUrl, imageCount, videoMode });
    res.json(result);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ========================================================================
// COHERE — live, synchronized "be there from anywhere" experience.
// ========================================================================

// Lightweight clock-sync endpoint: the client measures round-trip and computes
// its offset from server time so a skewed laptop clock still locks on.
router.get('/live/time', (_req, res) => {
  res.json({ now: Date.now() });
});

// The featured show (Post Malone @ Rogers Stadium, Toronto) — always works.
router.get('/live/featured', async (_req, res) => {
  try {
    res.json({ ok: true, event: await live.getFeatured() });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Full event snapshot (static timeline + live correction + crowd clips).
// Polled by the room every few seconds for the shared corrected clock.
router.get('/live/event/:id', (req, res) => {
  const event = live.getEvent(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: 'event not found' });
  res.json({ ok: true, event });
});

// Turn any artist (optionally a real past date/venue) into a live/replay room.
router.post('/live/resolve', express.json(), async (req, res) => {
  try {
    const event = await live.resolveEvent(req.body || {});
    if (!event) return res.status(404).json({ ok: false, error: 'no setlist found for that artist' });
    res.json({ ok: true, event });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Crowd beacon: an attendee taps "they just started song #idx". Server-stamped,
// so no client clock is trusted. Median drift corrects the room for everyone.
router.post('/live/beacon', express.json(), (req, res) => {
  const { eventId, songIndex, userId } = req.body || {};
  const out = live.addBeacon(eventId, { songIndex, userId });
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

// Crowd-curated fan-clip wall: submit a clip URL, or upvote one.
router.post('/live/clip', express.json(), (req, res) => {
  const { eventId, url, platform, title, userId } = req.body || {};
  const out = live.addClip(eventId, { url, platform, title, userId });
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

router.post('/live/clip/vote', express.json(), (req, res) => {
  const { eventId, clipId } = req.body || {};
  const out = live.voteClip(eventId, clipId);
  if (!out) return res.status(404).json({ ok: false, error: 'event not found' });
  res.status(out.ok ? 200 : 400).json(out);
});

// Fan footage of the ACTUAL event: fresh uploads (publishedAfter + order=date)
// and active livestreams (eventType=live) — not old concerts. Falls back to a
// plain recency search when no live broadcasts exist.
router.get('/live/youtube', async (req, res) => {
  const q = String(req.query.q || '').trim() || 'concert';
  const sinceIso = String(req.query.since || '').trim(); // RFC3339
  const wantLive = String(req.query.live || '') === '1';

  if (isMock('youtube')) {
    return res.json(await serveMock('youtube'));
  }
  const key = process.env.YOUTUBE_API_KEY;
  const base = (extra) =>
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8` +
    `&q=${encodeURIComponent(q)}&order=date${extra}&key=${key}`;

  // RFC3339 lower bound — default to the last 24h so we surface tonight's clips.
  const since = sinceIso || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const params = `&publishedAfter=${encodeURIComponent(since)}`;

  const results = {};
  // Active livestreams of the event (the true real-time window).
  if (wantLive) {
    const liveRes = await callLive('youtube', base('&eventType=live'));
    results.live = (liveRes.data?.items || []).filter((i) => i?.id?.videoId);
  }
  const freshRes = await callLive('youtube', base(params));
  results.fresh = (freshRes.data?.items || []).filter((i) => i?.id?.videoId);

  const apiErr = freshRes.data?.error;
  let error = null;
  if (apiErr) error = /quota/i.test(apiErr.errors?.[0]?.reason || '') || apiErr.code === 403 ? 'quota' : 'api';
  res.json({ ok: !error, ...results, error });
});

export default router;
