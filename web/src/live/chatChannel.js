// Text chat over Supabase Realtime broadcast.
// Each room gets a `chat:${eventId}` channel. Messages are ephemeral (not
// persisted to a database) — they live only while users are in the room.

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase, supabaseEnabled } from './supabase.js';
import { guestId, guestName } from './liveApi.js';

const MAX_MESSAGES = 200;

/**
 * useChat(eventId) — text chat for a live room.
 *
 * Returns:
 *   messages  – array of { id, uid, name, text, ts }
 *   send(text) – broadcast a message to the room
 *   supported – false when Supabase isn't configured
 */
export function useChat(eventId) {
  const [messages, setMessages] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!supabase || !eventId) return undefined;

    const channel = supabase.channel(`chat:${eventId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        setMessages((prev) => {
          const next = [...prev, payload];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [eventId]);

  const send = useCallback(
    (text) => {
      const ch = channelRef.current;
      if (!ch || !text.trim()) return;
      const msg = {
        id: `${guestId()}-${Date.now()}`,
        uid: guestId(),
        name: guestName() || 'Guest',
        text: text.trim(),
        ts: Date.now(),
      };
      // Broadcast does NOT echo back to the sender, so add it locally too.
      ch.send({ type: 'broadcast', event: 'msg', payload: msg });
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      });
    },
    [],
  );

  return { messages, send, supported: supabaseEnabled };
}
