import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './src/routes.js';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
  
  // Ensure the global concert cache is fresh for today
  const todayStr = new Date().toISOString().slice(0, 10);
  const syncFile = './.last-sync';
  let shouldSync = true;
  if (existsSync(syncFile)) {
    const lastSync = readFileSync(syncFile, 'utf8').trim();
    if (lastSync === todayStr) shouldSync = false;
  }
  if (shouldSync) {
    console.log(`  🔄 JamBase cache stale for ${todayStr}. Spawning background sync...`);
    try {
      writeFileSync(syncFile, todayStr);
      const p = spawn('node', ['src/cron-jambase.js'], { stdio: 'inherit', detached: true });
      p.unref(); // don't block server shutdown
    } catch (err) {
      console.error('Failed to trigger JamBase sync:', err);
    }
  }
});
