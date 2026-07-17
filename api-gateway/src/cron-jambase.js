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

const today = new Date().toISOString().slice(0, 10);
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

async function run() {
  console.log(`Starting JamBase sync for events >= ${today}...`);
  let page = 1;
  let totalFetched = 0;
  const maxPages = 15; // 15 pages * 100 = 1,500 events (drastically reduces API calls)
  const allEvents = [];

  for (let step = 0; step < 15; step++) {
    // Space queries out by 4 days to cover a ~60 day window with 15 requests
    const d = new Date();
    d.setDate(d.getDate() + (step * 4));
    const targetDate = d.toISOString().slice(0, 10);

    try {
      const url = `${JB_BASE}/events?eventDateFrom=${targetDate}&eventDateTo=${targetDate}&perPage=100`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${JB_KEY}`, Accept: 'application/json' } });
      
      if (!r.ok) {
        if (r.status === 429) {
          console.warn('Rate limited! Waiting 5s...');
          await new Promise((res) => setTimeout(res, 5000));
          step--; // retry
          continue;
        }
        throw new Error(`JamBase API HTTP ${r.status}`);
      }

      const data = await r.json();
      const events = data.events || [];
      if (events.length > 0) {
        allEvents.push(...events);
        totalFetched += events.length;
      }
      console.log(`Fetched ${events.length} events for ${targetDate}...`);
      
      // Sleep slightly to respect rate limits (e.g. 5 requests/sec)
      await new Promise((res) => setTimeout(res, 300));
    } catch (e) {
      console.error(`Error on date ${targetDate}:`, e.message);
    }
  }

  console.log(`Total events fetched: ${totalFetched}`);

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

  // Only require an artist. Sort descending to find the biggest stadiums, but keep smaller ones
  const ranked = parsed
    .filter(e => e.artist)
    .sort((a, b) => b.capacity - a.capacity);

  // Take up to 1500 concerts
  const topConcerts = ranked.slice(0, 1500);
  console.log(`Filtered to the top ${topConcerts.length} massive concerts.`);

  if (topConcerts.length === 0) {
    console.log('No valid concerts found with capacity metadata.');
    process.exit(0);
  }

  // First, clear the cache (or just delete old ones, but a truncate is cleaner for a pure cache)
  // Wait, Supabase REST API doesn't support TRUNCATE easily without a function.
  // Instead, we just delete everything (or we could just UPSERT, but upsert leaves old deleted concerts).
  // Let's delete all rows.
  console.log('Clearing old cache...');
  await sbFetch('jambase_global_cache?id=not.is.null', { method: 'DELETE' });

  // Bulk insert
  console.log('Uploading to Supabase...');
  const res = await sbFetch('jambase_global_cache', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(topConcerts),
  });

  if (!res.ok) {
    console.error('Failed to upload to Supabase:', await res.text());
    process.exit(1);
  }

  console.log('✅ Sync complete!');
}

run();
