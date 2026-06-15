// In-memory usage tracker. Resets on restart — fine for a hackathon.
// Records per-service call counts, last status, latency, bytes, and errors
// so the monitor panel can show live diagnostics and quota burn.

import { SERVICE_IDS } from './services.js';

function blank() {
  return {
    calls: 0,
    errors: 0,
    bytes: 0,
    lastStatus: null,
    lastLatencyMs: null,
    lastMode: null,
    lastError: null,
    lastAt: null,
  };
}

const stats = Object.fromEntries(SERVICE_IDS.map((id) => [id, blank()]));

export function record(id, { status, latencyMs, bytes, mode, error }) {
  const s = stats[id];
  if (!s) return;
  s.calls += 1;
  s.bytes += bytes || 0;
  s.lastStatus = status;
  s.lastLatencyMs = latencyMs;
  s.lastMode = mode;
  s.lastAt = new Date().toISOString();
  if (error) {
    s.errors += 1;
    s.lastError = error;
  } else {
    s.lastError = null;
  }
}

export function snapshot() {
  return stats;
}

export function snapshotFor(id) {
  return stats[id];
}
