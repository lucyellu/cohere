// Suno multi-account library access. Reads the 6 accounts from suno-dl's
// accounts.json, refreshes a short-lived JWT per account from the long-lived
// __client cookie (Clerk), and fans out the library feed across ALL accounts
// in parallel so the app sees one unified catalog.
//
// Auth flow mirrors the proven suno-dl implementation:
//   __client cookie -> GET  auth.suno.com/v1/client          (pick active session)
//                   -> POST .../v1/client/sessions/{id}/tokens (fresh JWT)
//                   -> GET  studio-api.prod.suno.com/api/feed/?page=N  (Bearer JWT)
// The 6 accounts share one browser client, so we match the correct session by
// the account's email (decoded from its stored token).

import { readFile } from 'node:fs/promises';
import { record } from './usage.js';

const CLERK_API = 'https://auth.suno.com';
const API_BASE = 'https://studio-api.prod.suno.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Default points at the existing suno-dl credentials store; override via env.
const ACCOUNTS_FILE =
  process.env.SUNO_ACCOUNTS_FILE ||
  'C:/Users/lucyl/Desktop/hold/projects/suno-dl/accounts.json';

let _accounts = null;
async function loadAccounts() {
  if (_accounts) return _accounts;
  const raw = await readFile(ACCOUNTS_FILE, 'utf8');
  _accounts = JSON.parse(raw);
  return _accounts;
}

function decodeJwtEmail(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json['suno.com/claims/email'] || '';
  } catch {
    return '';
  }
}

// name -> { jwt, exp(ms) }. JWTs live ~1h; cache for 50m to avoid re-auth spam.
const _jwtCache = new Map();

async function getJwt(acct) {
  const name = acct.name || 'unknown';
  const cached = _jwtCache.get(name);
  if (cached && cached.exp > Date.now() + 60_000) return cached.jwt;

  const cookie = acct.cookie || '';
  const email = acct.email || decodeJwtEmail(acct.token || '');
  if (!cookie || cookie === 'PASTE_COOKIE_HERE') {
    return acct.token && acct.token !== 'PASTE_TOKEN_HERE' ? acct.token : null;
  }

  const headers = { Cookie: `__client=${cookie}`, 'User-Agent': UA };
  const r = await fetch(`${CLERK_API}/v1/client`, { headers });
  if (!r.ok) throw new Error(`clerk client HTTP ${r.status}`);
  const data = await r.json();
  const sessions = (data.response?.sessions || []).filter((s) => s.status === 'active');
  if (!sessions.length) throw new Error('no active session (logged out?)');

  let active = null;
  if (email && sessions.length > 1) {
    active =
      sessions.find((s) => (s.public_user_data?.identifier || '') === email) ||
      sessions.find((s) =>
        (s.user?.email_addresses || []).some((e) => e.email_address === email)
      );
  }
  if (!active) active = sessions[0];

  const r2 = await fetch(`${CLERK_API}/v1/client/sessions/${active.id}/tokens`, {
    method: 'POST',
    headers,
  });
  if (!r2.ok) throw new Error(`token HTTP ${r2.status}`);
  const jwt = (await r2.json()).jwt;
  if (jwt) _jwtCache.set(name, { jwt, exp: Date.now() + 50 * 60_000 });
  return jwt;
}

async function fetchFeed(jwt, page) {
  const r = await fetch(`${API_BASE}/api/feed/?page=${page}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : j.clips || [];
}

function slimClip(clip, account) {
  const m = clip.metadata || {};
  return {
    account,
    id: clip.id,
    title: clip.title || '',
    status: clip.status,
    created_at: clip.created_at,
    model: clip.model_name,
    audio_url: clip.audio_url,
    image_url: clip.image_url,
    video_url: clip.video_url,
    duration: m.duration,
    tags: m.tags,
    prompt: m.prompt,
    play_count: clip.play_count,
    upvote_count: clip.upvote_count,
    is_liked: clip.is_liked,
  };
}

// Auth-only status check for every account (for the "see all accounts" view).
export async function listAccounts() {
  const accts = await loadAccounts();
  return Promise.all(
    accts.map(async (a) => {
      const email = a.email || decodeJwtEmail(a.token || '');
      const base = { name: a.name, email, hasCookie: Boolean(a.cookie), hasToken: Boolean(a.token) };
      try {
        const jwt = await getJwt(a);
        return { ...base, authed: Boolean(jwt), status: jwt ? 'authed' : 'no-credentials' };
      } catch (e) {
        return { ...base, authed: false, status: `error: ${e.message}` };
      }
    })
  );
}

// Fan out the feed across ALL accounts in parallel and merge into one list.
// `page` is per-account; `pages` fetches pages 0..pages-1 per account (capped).
export async function feedAll({ page = 0, pages = 1 } = {}) {
  const accts = await loadAccounts();
  const start = Date.now();
  const pageList = Array.from({ length: Math.min(Math.max(pages, 1), 10) }, (_, i) => page + i);

  const perAccount = await Promise.all(
    accts.map(async (a) => {
      try {
        const jwt = await getJwt(a);
        if (!jwt) return { account: a.name, count: 0, error: 'no-jwt', clips: [] };
        const pagesClips = await Promise.all(pageList.map((p) => fetchFeed(jwt, p)));
        const clips = pagesClips.flat().map((c) => slimClip(c, a.name));
        return { account: a.name, count: clips.length, error: null, clips };
      } catch (e) {
        return { account: a.name, count: 0, error: e.message, clips: [] };
      }
    })
  );

  const clips = perAccount.flatMap((r) => r.clips);
  clips.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  const latencyMs = Date.now() - start;
  const anyOk = perAccount.some((r) => !r.error);
  record('suno', {
    status: anyOk ? 200 : 502,
    latencyMs,
    bytes: JSON.stringify(clips).length,
    mode: 'live',
    error: anyOk ? null : 'all accounts failed',
  });

  return {
    ok: anyOk,
    page,
    pages: pageList.length,
    accounts: perAccount.map(({ account, count, error }) => ({ account, count, error })),
    total: clips.length,
    clips,
  };
}
