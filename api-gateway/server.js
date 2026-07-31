import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './src/routes.js';
import { spawn } from 'node:child_process';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());

// Lightweight request logger: method, path, status, latency.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}${res.statusCode}\x1b[0m ${req.method} ${req.originalUrl} \x1b[2m${ms}ms\x1b[0m`);
  });
  next();
});

app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({ name: 'Cohear API Gateway', health: '/api/health' });
});

app.listen(PORT, () => {
  console.log(`\n  🎛️  Cohear API Gateway`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  ➜  health: http://localhost:${PORT}/api/health`);
  console.log(`  ➜  mock default: ${String(process.env.USE_MOCK_DATA).toLowerCase() !== 'false' ? 'ON' : 'OFF'}\n`);
  
  maybeSyncJambase();
});

// Ask the DATABASE when it was last synced — never a local file. Render's disk
// is ephemeral, so the old `.last-sync` marker reverted to whatever was
// committed on every deploy and every cold start after the free tier's idle
// sleep, firing a full sync (dozens of JamBase calls) each time. The JamBase
// free tier is 1,000 calls/month, so that alone could exhaust it.
const SYNC_EVERY_DAYS = 7;

async function maybeSyncJambase() {
  const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
  if (!SB_URL || !SB_KEY) {
    console.log('  ⏭️  No Supabase credentials — skipping JamBase sync check.');
    return;
  }
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/jambase_global_cache?select=updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) throw new Error(`freshness check HTTP ${res.status}`);
    const [newest] = await res.json();
    const ageDays = newest?.updated_at
      ? (Date.now() - new Date(newest.updated_at).getTime()) / 86_400_000
      : Infinity;

    if (ageDays < SYNC_EVERY_DAYS) {
      console.log(`  ✅ JamBase cache is ${ageDays.toFixed(1)}d old (< ${SYNC_EVERY_DAYS}d) — no sync needed.`);
      return;
    }
    console.log(`  🔄 JamBase cache is ${ageDays === Infinity ? 'empty' : `${ageDays.toFixed(1)}d old`}. Spawning background sync...`);
    const p = spawn('node', ['src/cron-jambase.js'], { stdio: 'inherit', detached: true });
    p.unref(); // don't block server shutdown
  } catch (err) {
    // Never sync on an inconclusive check — a failed probe must not become a
    // reason to spend API calls.
    console.error('  ⚠️  JamBase freshness check failed, skipping sync:', err.message);
  }
}
