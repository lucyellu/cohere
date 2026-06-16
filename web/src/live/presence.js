// Live presence — "you and N others are here right now."
//
// Wired to Supabase Realtime presence in the supabase.js module (task 5). Until
// a Supabase project is configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
// this hook reports `supported:false` and the room honestly shows the count of
// people actively crowd-syncing (from the gateway) instead of a fake viewer tally.

import { useEffect, useState } from 'react';

let impl = null; // set by supabase.js when configured: (eventId, onCount) => unsubscribe

export function registerPresenceImpl(fn) {
  impl = fn;
}

export function usePresence(eventId) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!impl || !eventId) return undefined;
    const off = impl(eventId, setCount);
    return off;
  }, [eventId]);

  return { count, supported: Boolean(impl) };
}
