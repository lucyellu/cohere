import dotenv from 'dotenv';
dotenv.config();

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
const JB_KEY = process.env.JAMBASE_API_KEY || '';

if (!SB_URL || !SB_KEY) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}
if (!JB_KEY) {
  console.error('Missing JamBase API key.');
  process.exit(1);
}

// Trial safety: extended to end of 2026
if (new Date() > new Date('2026-12-31T23:59:59Z')) {
  console.log('Trial safety: cron job disabled after extended period.');
  process.exit(0);
}

const JB_BASE = 'https://api.data.jambase.com/v3';

// Fetch options for Supabase
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

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const schemaTxt = (v) => (!v ? '' : typeof v === 'string' ? v : v.name || v.identifier || '');

// --- Call budget ---------------------------------------------------------
// JamBase free tier is 1,000 calls/MONTH and one call returns at most 100
// events (perPage is hard-capped: "must be between 1 and 100"). There is also
// no popularity/capacity filter or sort — `sort` only accepts eventDate —
// so "the biggest shows" can only be found by pulling a window and ranking
// locally. At ~950 events/day worldwide that means ~9.5 calls per day of
// coverage, which is what these constants are budgeting against.
// Overridable so a run can be scoped down (or dry-run) without a code change —
// this job spends real quota, so it should be cheap to rehearse.
const envInt = (name, fallback) => (Number.isFinite(+process.env[name]) ? +process.env[name] : fallback);
// 7 days is deliberate: it exactly covers the 'tonight' and 'week' browse
// windows, costs ~67 calls (~290/month at a weekly refresh) and ~30MB of the
// 500MB Supabase free tier. Doubling it to 14 doubles both. Raise via
// JB_NEAR_DAYS if the far-term sample proves too thin.
const NEAR_DAYS = envInt('JB_NEAR_DAYS', 7); // days 0..N fetched CONTIGUOUSLY (nothing sampled away)
const NEAR_MAX_CALLS = envInt('JB_MAX_CALLS', 150); // ceiling so a busy window can't run away
const FAR_DAYS = envInt('JB_FAR_DAYS', 60); // sampled tail: browsing that far out doesn't need every show
const FAR_STEP = envInt('JB_FAR_STEP', 5); // one sampled day every N days from NEAR_DAYS..FAR_DAYS
const PAGE_DELAY_MS = 300; // rate limit is 120/min; this keeps us well under
const DRY_RUN = String(process.env.JB_DRY_RUN || '').toLowerCase() === 'true';

const isoIn = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function jbGet(params, label) {
  const url = `${JB_BASE}/events?${params}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${JB_KEY}`, Accept: 'application/json' } });
    if (r.ok) return r.json();
    if (r.status === 429) {
      console.warn(`  rate limited on ${label}, waiting 5s...`);
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }
    throw new Error(`JamBase HTTP ${r.status} on ${label}`);
  }
  throw new Error(`JamBase still rate limited after retries on ${label}`);
}

async function run() {
  const allEvents = [];
  let calls = 0;

  // --- Near term: every show worldwide, days 0..NEAR_DAYS, no gaps ---------
  // A range query returns the whole span in date order, so paging through it
  // gives contiguous coverage. The old code asked for one day per call
  // (eventDateFrom === eventDateTo) and skipped 3 days in 4, which is why
  // "tonight" could be missing from the cache entirely.
  // Start YESTERDAY (UTC), not today. This job runs in UTC but users are not:
  // at 10 PM Pacific it is already tomorrow in UTC, so a window starting at
  // isoIn(0) omits the viewer's current evening entirely — the exact bug that
  // made "tonight" look empty. One extra day of coverage is ~10 calls.
  const nearFrom = isoIn(-1);
  const nearTo = isoIn(NEAR_DAYS);
  console.log(`Near term: ${nearFrom} .. ${nearTo} (contiguous)`);

  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= NEAR_MAX_CALLS) {
    const data = await jbGet(
      `eventDateFrom=${nearFrom}&eventDateTo=${nearTo}&perPage=100&page=${page}`,
      `near p${page}`
    );
    calls++;
    const events = data.events || [];
    allEvents.push(...events);
    totalPages = data.pagination?.totalPages ?? 1;
    if (page === 1) {
      console.log(`  ${data.pagination?.totalItems ?? '?'} events across ${totalPages} pages`);
    }
    page++;
    await new Promise((res) => setTimeout(res, PAGE_DELAY_MS));
  }
  if (totalPages > NEAR_MAX_CALLS) {
    console.warn(`  ⚠️  Stopped at the ${NEAR_MAX_CALLS}-call ceiling; ${totalPages - NEAR_MAX_CALLS} pages of near-term events were NOT fetched.`);
  }
  console.log(`Near term done: ${allEvents.length} events in ${calls} calls.`);

  // --- Far term: sampled, one day every FAR_STEP days ----------------------
  // Contiguous coverage to day 60 would cost ~570 calls — over half the
  // monthly budget for a range nobody browses hour-by-hour. Sample it instead
  // and let the capacity ranking below keep the big ones.
  for (let offset = NEAR_DAYS + 1; offset <= FAR_DAYS; offset += FAR_STEP) {
    const day = isoIn(offset);
    try {
      const data = await jbGet(`eventDateFrom=${day}&eventDateTo=${day}&perPage=100`, day);
      calls++;
      allEvents.push(...(data.events || []));
      await new Promise((res) => setTimeout(res, PAGE_DELAY_MS));
    } catch (e) {
      console.error(`  error on ${day}:`, e.message);
    }
  }

  console.log(`Total events fetched: ${allEvents.length} in ${calls} JamBase calls.`);

  // Process, filter, and sort
  const parsed = allEvents.map((e) => {
    const loc = e.location || {};
    const addr = loc.address || {};
    const capacity = numOrNull(loc.maximumAttendeeCapacity ?? loc.capacity) || 0;
    
    return {
      id: e.identifier || `${loc.name}-${(e.startDate || '').slice(0, 10)}`,
      artist: e.performer?.[0]?.name || '',
      venue: loc.name || 'Unknown venue',
      city: addr.addressLocality || '',
      country: schemaTxt(addr.addressCountry),
      date: (e.startDate || '').slice(0, 10),
      capacity,
      jambase_payload: e
    };
  });

  // `id` is the primary key and a multi-day festival can surface in both the
  // near range and a sampled far day, so dedupe before insert or the batch
  // dies on a duplicate key.
  const byId = new Map();
  for (const e of parsed) if (e.artist && e.id) byId.set(e.id, e);
  const rows = [...byId.values()].sort((a, b) => b.capacity - a.capacity);

  // No top-N slice any more. The near-term range is fetched contiguously
  // precisely so the app can serve "everything on tonight" from the DB;
  // trimming to the biggest 1,500 would throw that away again. Capacity order
  // is kept because the browse feed still ranks by it.
  console.log(`Prepared ${rows.length} unique concerts (from ${parsed.length} fetched).`);

  if (rows.length === 0) {
    console.log('No valid concerts found — leaving the existing cache untouched.');
    process.exit(0);
  }

  if (DRY_RUN) {
    const dates = {};
    for (const r of rows) dates[r.date] = (dates[r.date] || 0) + 1;
    console.log('DRY RUN — database untouched. Coverage by date:');
    console.log(JSON.stringify(dates, null, 0));
    console.log(`Would have written ${rows.length} rows (~${Math.round(JSON.stringify(rows).length / 1e6)}MB).`);
    process.exit(0);
  }

  console.log('Clearing old cache...');
  const del = await sbFetch('jambase_global_cache?id=not.is.null', { method: 'DELETE' });
  if (!del.ok) {
    console.error('Failed to clear cache:', await del.text());
    process.exit(1);
  }

  // Insert in batches — a single POST of every row is tens of MB of jsonb and
  // will time out.
  const BATCH = 500;
  console.log(`Uploading to Supabase in batches of ${BATCH}...`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await sbFetch('jambase_global_cache', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`Failed to upload batch ${i / BATCH + 1}:`, await res.text());
      process.exit(1);
    }
    console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  console.log('✅ Sync complete!');
}

run();
