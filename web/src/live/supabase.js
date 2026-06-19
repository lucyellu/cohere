// Supabase Realtime presence — the "you and N others are here right now" magic.
//
// This is the ONE thing gateway-polling can't do well: a live, shared,
// cross-network count of everyone in the room. It's pure client-side Realtime
// presence (no tables/RLS/migration needed), keyed by the anonymous guest id.
//
// If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set, this module is inert
// and the room falls back to the honest "N syncing the crowd" beacon count.

import { createClient } from '@supabase/supabase-js';
import { registerPresenceImpl } from './presence.js';
import { guestId, guestName } from './liveApi.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anon);
export const supabase = supabaseEnabled
  ? createClient(url, anon, { realtime: { params: { eventsPerSecond: 5 } } })
  : null;

if (supabase) {
  // Anonymous auth so each viewer is a distinct (if nameless) presence. Falls
  // back gracefully if anonymous sign-ins are disabled on the project.
  supabase.auth.signInAnonymously().catch(() => {});

  // (eventId, onCount) => unsubscribe
  registerPresenceImpl((eventId, onCount) => {
    const channel = supabase.channel(`room:${eventId}`, {
      config: { presence: { key: guestId() } },
    });

    const recount = () => {
      const state = channel.presenceState();
      onCount(Object.keys(state).length);
    };

    channel
      .on('presence', { event: 'sync' }, recount)
      .on('presence', { event: 'join' }, recount)
      .on('presence', { event: 'leave' }, recount)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ name: guestName() || 'guest', at: Date.now() });
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  });
}
