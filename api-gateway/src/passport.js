// Passport token layer — Ed25519 signed credentials + a Supabase registry.
// "Tokenization without a blockchain": the gateway signs each stamp/visa/ticket
// and records it in passport_tokens, which assigns a global mint number. Anyone
// can verify a serial against the published public key.

import {
  sign as edSign,
  verify as edVerify,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.passport-key');

// --- Key management: env secret → key file → generate + persist --------------
let privateKey;
(function initKey() {
  const fromEnv = (process.env.PASSPORT_SIGNING_SECRET || '').trim();
  if (fromEnv) {
    privateKey = createPrivateKey({ key: Buffer.from(fromEnv, 'base64'), format: 'der', type: 'pkcs8' });
    return;
  }
  if (existsSync(KEY_FILE)) {
    privateKey = createPrivateKey({ key: Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'base64'), format: 'der', type: 'pkcs8' });
    return;
  }
  const pair = generateKeyPairSync('ed25519');
  privateKey = pair.privateKey;
  const b64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  try {
    writeFileSync(KEY_FILE, b64, 'utf8');
    console.log('  🔑 generated passport signing key →', KEY_FILE);
  } catch {
    console.log('  🔑 generated ephemeral passport signing key (could not persist)');
  }
})();

const publicKey = createPublicKey(privateKey);
export const PUBLIC_KEY_B64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function signMessage(msg) {
  return edSign(null, Buffer.from(msg), privateKey).toString('base64url');
}
function verifyMessage(msg, sigB64, pubB64) {
  try {
    const pub = pubB64
      ? createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' })
      : publicKey;
    return edVerify(null, Buffer.from(msg), pub, Buffer.from(sigB64, 'base64url'));
  } catch {
    return false;
  }
}

// Deterministic, key-sorted serialization so a signature made at issue time
// matches one recomputed from the (unordered) jsonb payload at verify time.
function canonical(obj) {
  const sorted = Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = obj[k] == null ? '' : String(obj[k]);
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

// --- Supabase registry (PostgREST via service key, no extra dependency) ------
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
export const registryEnabled = Boolean(SB_URL && SB_KEY);

function sbFetch(path, opts = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function registerToken(row) {
  const res = await sbFetch('passport_tokens?on_conflict=type,scope_key,user_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`registry ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function lookupToken(serial) {
  const res = await sbFetch(`passport_tokens?serial=eq.${encodeURIComponent(serial)}&select=*&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] || null : null;
}

// --- Public API --------------------------------------------------------------
export async function issue(input = {}) {
  const type = String(input.type || '');
  if (!['visa', 'entry', 'ticket'].includes(type)) return { ok: false, error: 'bad type' };
  const serial = String(input.serial || '');
  if (!serial) return { ok: false, error: 'serial required' };
  const issuedAt = new Date().toISOString();
  const core = {
    t: type,
    s: String(input.scopeKey || ''),
    u: String(input.userKey || 'guest'),
    sn: serial,
    c: String(input.concertId || ''),
    city: String(input.city || ''),
    country: String(input.country || ''),
    d: String(input.date || ''),
    iss: issuedAt,
  };
  const signature = signMessage(canonical(core));
  let mintNo = null;
  let registered = false;
  if (registryEnabled) {
    try {
      const saved = await registerToken({
        type,
        scope_key: core.s,
        user_key: core.u,
        artist: input.artist || null,
        venue: input.venue || null,
        city: core.city || null,
        country: core.country || null,
        concert_date: core.d || null,
        serial,
        payload: core,
        signature,
        public_key: PUBLIC_KEY_B64,
        issued_at: issuedAt,
      });
      mintNo = saved?.mint_no ?? null;
      // A merge-duplicate keeps the ORIGINAL row's signature; trust the registry's.
      registered = mintNo != null;
      return { ok: true, serial, mintNo, signature: saved?.signature || signature, publicKey: PUBLIC_KEY_B64, issuedAt: saved?.issued_at || issuedAt, registered };
    } catch (e) {
      console.warn('  ⚠️  passport registry write failed:', e.message);
    }
  }
  // Signed but unregistered (registry offline) — still verifiable by signature.
  return { ok: true, serial, mintNo, signature, publicKey: PUBLIC_KEY_B64, issuedAt, registered };
}

export async function verify(serial) {
  if (!serial) return { ok: false, error: 'serial required' };
  if (!registryEnabled) return { ok: false, error: 'registry offline' };
  const row = await lookupToken(serial);
  if (!row) return { ok: true, found: false, valid: false };
  const valid = verifyMessage(canonical(row.payload), row.signature, row.public_key);
  return {
    ok: true,
    found: true,
    valid,
    mintNo: row.mint_no,
    type: row.type,
    artist: row.artist,
    city: row.city,
    country: row.country,
    date: row.concert_date,
    issuedAt: row.issued_at,
  };
}
