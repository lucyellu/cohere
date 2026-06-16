// BYOC generation pool — the "bring your own compute" engine.
//
// Fans join a show and contribute capacity:
//   - a Meta AI browser-worker (the Reverb extension running in THEIR logged-in
//     tab — fulfills jobs with their ~25/day free quota), and/or
//   - a free API key (Gemini / HuggingFace) the gateway can call directly.
// Pollinations FLUX is an always-on, unlimited FLOOR so a show never runs dry.
//
// More fans at the same concert -> bigger pool -> more/better AI scenes.
// State is in-memory (resets on restart) — fine for a hackathon.

// Preference order when choosing a provider (higher = tried first).
const QUALITY = { meta: 3, gemini: 2, huggingface: 1, pollinations: 0 };
// Sensible default daily caps per provider type (override per contribution).
const DEFAULT_CAP = { meta: 25, gemini: 100, huggingface: 50, pollinations: Infinity };

const providers = new Map(); // id -> provider record
const shows = new Map();      // showId -> Set(userId)
const users = new Map();      // userId -> { name }
const jobs = new Map();       // jobId -> meta relay job
let _pid = 1;
let _jid = 1;

const today = () => new Date().toISOString().slice(0, 10);

// Always-on free floor.
providers.set('pollinations:global', {
  id: 'pollinations:global', owner: 'system', name: 'Pollinations FLUX (free floor)',
  type: 'pollinations', credential: null, capPerDay: Infinity,
  usedToday: 0, day: today(), online: true, lastSeen: Date.now(),
});

function rollDay(p) { const d = today(); if (p.day !== d) { p.day = d; p.usedToday = 0; } }
function remaining(p) { rollDay(p); return p.capPerDay === Infinity ? Infinity : Math.max(0, p.capPerDay - p.usedToday); }

export function join(userId, name, showId) {
  if (!userId) return { ok: false, error: 'userId required' };
  users.set(userId, { name: name || userId });
  if (showId) { if (!shows.has(showId)) shows.set(showId, new Set()); shows.get(showId).add(userId); }
  return { ok: true };
}

// Register a capacity source for a user. Meta workers come online via heartbeat;
// API-key providers are usable immediately.
export function contribute(userId, { type, credential = null, name = null, capPerDay = null }) {
  if (!users.has(userId)) users.set(userId, { name: userId });
  if (!(type in DEFAULT_CAP)) return { ok: false, error: `unknown provider type: ${type}` };
  if ((type === 'gemini' || type === 'huggingface') && !credential) {
    return { ok: false, error: `${type} requires an API key` };
  }
  const id = `${type}:${userId}:${_pid++}`;
  providers.set(id, {
    id, owner: userId, name: name || `${type} · ${users.get(userId)?.name || userId}`,
    type, credential, capPerDay: capPerDay ?? DEFAULT_CAP[type],
    usedToday: 0, day: today(), online: type !== 'meta', lastSeen: Date.now(),
  });
  return { ok: true, providerId: id };
}

// Meta workers ping this so we know their browser tab is live and ready.
export function heartbeat(userId) {
  let n = 0;
  for (const p of providers.values()) {
    if (p.owner === userId && p.type === 'meta') { p.online = true; p.lastSeen = Date.now(); n++; }
  }
  return n;
}

// A meta worker is considered offline if it hasn't pinged in 90s.
function freshenOnline() {
  const cutoff = Date.now() - 90_000;
  for (const p of providers.values()) {
    if (p.type === 'meta' && p.lastSeen < cutoff) p.online = false;
  }
}

// Providers usable for a show: the global floor + those owned by fans who joined.
function poolFor(showId) {
  freshenOnline();
  const out = [];
  for (const p of providers.values()) {
    if (p.type === 'pollinations') { out.push(p); continue; }
    if (!showId) { out.push(p); continue; }
    if (shows.get(showId)?.has(p.owner)) out.push(p);
  }
  return out;
}

export function poolStatus(showId) {
  const list = poolFor(showId);
  const byType = {};
  let finiteRemaining = 0, unlimited = false;
  for (const p of list) {
    const r = remaining(p);
    byType[p.type] ||= { count: 0, online: 0, remaining: 0 };
    byType[p.type].count++;
    if (p.online) byType[p.type].online++;
    if (r === Infinity) unlimited = true; else { byType[p.type].remaining += r; finiteRemaining += r; }
  }
  return {
    showId: showId || null,
    fans: showId ? (shows.get(showId)?.size || 0) : users.size,
    providers: list.length,
    unlimited,
    finiteRemaining,
    byType,
  };
}

// Choose the best provider with quota left, optionally excluding ids already tried.
export function pick(showId, { preferType = null, exclude = [] } = {}) {
  let list = poolFor(showId).filter((p) => p.online && remaining(p) > 0 && !exclude.includes(p.id));
  if (preferType) {
    const pref = list.filter((p) => p.type === preferType);
    if (pref.length) list = pref;
  }
  return list.sort((a, b) =>
    (QUALITY[b.type] - QUALITY[a.type]) ||
    ((remaining(b) === Infinity ? 1e9 : remaining(b)) - (remaining(a) === Infinity ? 1e9 : remaining(a)))
  )[0] || null;
}

export function recordUse(id) {
  const p = providers.get(id);
  if (p) { rollDay(p); if (p.capPerDay !== Infinity) p.usedToday++; p.lastSeen = Date.now(); }
}

export function getProvider(id) { return providers.get(id); }

// --- Meta relay queue: gateway <-> a fan's browser extension ----------------
export function enqueueMeta(provider, prompt) {
  const id = `job${_jid++}`;
  jobs.set(id, {
    id, providerId: provider.id, owner: provider.owner, prompt,
    status: 'pending', result: null, error: null, createdAt: Date.now(),
  });
  return jobs.get(id);
}

// The extension polls for the next job assigned to its user.
export function claimJob(userId) {
  for (const j of jobs.values()) {
    if (j.status === 'pending' && j.owner === userId) { j.status = 'claimed'; j.claimedAt = Date.now(); return j; }
  }
  return null;
}

export function completeJob(jobId, { imageUrl = null, error = null }) {
  const j = jobs.get(jobId);
  if (!j) return { ok: false, error: 'unknown job' };
  if (error) { j.status = 'failed'; j.error = error; } else { j.status = 'done'; j.result = imageUrl; }
  return { ok: true };
}

export function getJob(jobId) { return jobs.get(jobId); }
