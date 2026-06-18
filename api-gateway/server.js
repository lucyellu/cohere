import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './src/routes.js';

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
});
