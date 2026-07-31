// Generic live-call helper. Wraps fetch with usage recording and graceful
// error handling so a 401/429/network failure never crashes the server thread.
// Uses Node 18+ global fetch (no axios dependency).

import { record } from './usage.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Several partner APIs echo the request back inside their ERROR bodies, keys
// included — JamBase returns `request.params.apikey` verbatim on a 400. Routes
// forward upstream failures to the browser as-is (`res.status(502).json(result)`),
// so without this a malformed public request would hand out our partner key.
// Scrub by key name rather than dropping the body: the human-readable error
// text is what makes a 502 debuggable.
const SECRET_KEYS = /^(api_?key|access_?key|key|token|secret|password|authorization|client_?secret|jbd_user_id)$/i;

function scrubSecrets(value) {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : scrubSecrets(v);
  }
  return out;
}

export async function callLive(id, url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const latencyMs = Date.now() - start;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    const error = res.ok ? null : `HTTP ${res.status}`;
    record(id, { status: res.status, latencyMs, bytes: text.length, mode: 'live', error });
    return { ok: res.ok, status: res.status, mode: 'live', data: res.ok ? data : scrubSecrets(data) };
  } catch (err) {
    const latencyMs = Date.now() - start;
    record(id, { status: 0, latencyMs, bytes: 0, mode: 'live', error: err.message });
    return { ok: false, status: 0, mode: 'live', data: { error: err.message } };
  }
}

// Load a mock JSON payload from src/mocks/<id>.json and record it as a mock hit.
export async function serveMock(id) {
  const start = Date.now();
  try {
    const raw = await readFile(join(__dirname, 'mocks', `${id}.json`), 'utf8');
    const data = JSON.parse(raw);
    record(id, {
      status: 200,
      latencyMs: Date.now() - start,
      bytes: raw.length,
      mode: 'mock',
      error: null,
    });
    return { ok: true, status: 200, mode: 'mock', data };
  } catch (err) {
    record(id, { status: 500, latencyMs: Date.now() - start, bytes: 0, mode: 'mock', error: err.message });
    return { ok: false, status: 500, mode: 'mock', data: { error: `mock missing: ${err.message}` } };
  }
}
