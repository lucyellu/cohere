// Hard monthly usage cap for JamBase, backed by a Postgres row in Supabase
// (table `api_quota`, function `bump_api_quota`) so the count survives
// server restarts and free-plan sleeps — unlike src/usage.js, which is
// in-memory only.
//
// JamBase's free tier is 1,000 calls/month. Every code path that hits
// JamBase (the weekly cron ingest AND the live fallback routes) must call
// tryConsumeJambaseCall() first and skip the request if it returns
// allowed: false. That is the actual reassurance this buys: even with a
// card on file and a fresh non-trial key, the app physically cannot place
// a JamBase request once the cap is hit this month — it falls back to
// cache/mock instead, no billing risk, no manual watching required.
//
// Cap defaults to 900 (100-call safety margin under the 1,000 limit).
// Override with JAMBASE_MONTHLY_CAP if you know the real plan limit differs.

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
const CAP = Number.isFinite(+process.env.JAMBASE_MONTHLY_CAP) ? +process.env.JAMBASE_MONTHLY_CAP : 900;

// Fail-closed: if the quota check itself can't be verified (missing
// Supabase config, network error, RPC error), we treat the call as NOT
// allowed rather than letting it through unmetered. Worse case is the app
// serves cache/mock when it didn't strictly need to; it never risks an
// uncounted live call.
export async function tryConsumeJambaseCall() {
  if (!SB_URL || !SB_KEY) {
    console.warn('[jambaseBudget] Supabase not configured — refusing live JamBase call (fail-closed).');
    return { allowed: false, calls: null, cap: CAP, month: null, reason: 'no-supabase' };
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/bump_api_quota`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_service: 'jambase', p_cap_fallback: CAP }),
    });
    if (!res.ok) {
      console.warn(`[jambaseBudget] quota RPC failed (HTTP ${res.status}) — refusing live call (fail-closed).`);
      return { allowed: false, calls: null, cap: CAP, month: null, reason: 'rpc-error' };
    }
    const rows = await res.json();
    const row = rows?.[0];
    if (!row) {
      console.warn('[jambaseBudget] quota RPC returned no row — refusing live call (fail-closed).');
      return { allowed: false, calls: null, cap: CAP, month: null, reason: 'empty-response' };
    }
    if (!row.allowed) {
      console.warn(`[jambaseBudget] monthly cap hit: ${row.calls}/${row.cap} calls used in ${row.month}. Blocking further live JamBase calls until next month.`);
    }
    return row;
  } catch (err) {
    console.warn(`[jambaseBudget] quota check errored (${err.message}) — refusing live call (fail-closed).`);
    return { allowed: false, calls: null, cap: CAP, month: null, reason: 'network-error' };
  }
}
