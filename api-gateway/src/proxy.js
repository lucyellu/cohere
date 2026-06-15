// Generic live-call helper. Wraps fetch with usage recording and graceful
// error handling so a 401/429/network failure never crashes the server thread.
// Uses Node 18+ global fetch (no axios dependency).

import { record } from './usage.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    return { ok: res.ok, status: res.status, mode: 'live', data };
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
