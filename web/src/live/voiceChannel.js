// WebRTC voice chat with Supabase Realtime as the signaling layer.
//
// Architecture: peer-to-peer mesh — each participant creates an RTCPeerConnection
// to every other participant. Works well for small rooms (2–8 people). Signaling
// (SDP offers/answers + ICE candidates) goes through a Supabase broadcast channel.
//
// STUN servers: Google's free public STUN is used for NAT traversal. No TURN
// server is included, so users behind symmetric NATs may not connect (covers the
// vast majority of home/mobile networks though).

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase, supabaseEnabled } from './supabase.js';
import { guestId, guestName } from './liveApi.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * useVoice(eventId) — WebRTC voice chat for a live room.
 *
 * Returns:
 *   joined       – boolean, whether we're in the voice channel
 *   muted        – boolean, mic mute state
 *   peers        – array of { uid, name } for everyone in voice
 *   join()       – request mic and join voice
 *   leave()      – disconnect from voice
 *   toggleMute() – toggle local mic
 *   supported    – false when Supabase isn't configured
 *   error        – string | null
 */
export function useVoice(eventId) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);

  const channelRef = useRef(null);
  const streamRef = useRef(null);
  const connectionsRef = useRef({}); // uid → { pc, name }
  const audioContainerRef = useRef(null);
  const myUid = guestId();

  // Clean up everything on unmount or when leaving.
  const cleanup = useCallback(() => {
    // Stop all peer connections
    Object.values(connectionsRef.current).forEach(({ pc }) => {
      try { pc.close(); } catch { /* ignore */ }
    });
    connectionsRef.current = {};
    setPeers([]);

    // Stop local mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Remove audio elements
    if (audioContainerRef.current) {
      audioContainerRef.current.innerHTML = '';
    }

    // Leave the signaling channel
    if (channelRef.current && supabase) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'voice:leave',
        payload: { uid: myUid },
      });
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setJoined(false);
    setMuted(false);
  }, [myUid]);

  // Unmount cleanup
  useEffect(() => cleanup, [cleanup]);

  // Ensure the hidden audio container exists.
  useEffect(() => {
    if (!audioContainerRef.current) {
      const div = document.createElement('div');
      div.style.display = 'none';
      div.id = 'cohear-voice-audio';
      document.body.appendChild(div);
      audioContainerRef.current = div;
    }
    return () => {
      if (audioContainerRef.current) {
        audioContainerRef.current.remove();
        audioContainerRef.current = null;
      }
    };
  }, []);

  function addRemoteStream(uid, stream) {
    if (!audioContainerRef.current) return;
    // Remove any existing audio element for this peer
    const existing = audioContainerRef.current.querySelector(`[data-uid="${uid}"]`);
    if (existing) existing.remove();

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('data-uid', uid);
    audio.srcObject = stream;
    audioContainerRef.current.appendChild(audio);
  }

  function createPeerConnection(remoteUid, remoteName, channel, localStream) {
    if (connectionsRef.current[remoteUid]) return connectionsRef.current[remoteUid].pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add our local audio tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    // Handle remote audio
    pc.ontrack = (e) => {
      if (e.streams[0]) addRemoteStream(remoteUid, e.streams[0]);
    };

    // ICE candidates → send to the specific peer
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'voice:ice',
          payload: { from: myUid, to: remoteUid, candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(remoteUid);
      }
    };

    connectionsRef.current[remoteUid] = { pc, name: remoteName };
    syncPeerList();
    return pc;
  }

  function removePeer(uid) {
    const entry = connectionsRef.current[uid];
    if (entry) {
      try { entry.pc.close(); } catch { /* ignore */ }
      delete connectionsRef.current[uid];
    }
    if (audioContainerRef.current) {
      const el = audioContainerRef.current.querySelector(`[data-uid="${uid}"]`);
      if (el) el.remove();
    }
    syncPeerList();
  }

  function syncPeerList() {
    setPeers(
      Object.entries(connectionsRef.current).map(([uid, { name }]) => ({ uid, name })),
    );
  }

  const join = useCallback(async () => {
    if (!supabase || !eventId) {
      setError('Chat requires Supabase to be configured.');
      return;
    }
    setError(null);

    // 1) Get mic permission
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      setError('Microphone access denied. Please allow mic access and try again.');
      return;
    }
    streamRef.current = stream;

    // 2) Set up Supabase signaling channel
    const channel = supabase.channel(`voice:${eventId}`);
    channelRef.current = channel;
    const myName = guestName() || 'Guest';

    channel
      // Someone new joined — create an offer to them
      .on('broadcast', { event: 'voice:join' }, async ({ payload }) => {
        if (payload.uid === myUid) return;
        const pc = createPeerConnection(payload.uid, payload.name, channel, streamRef.current);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast',
            event: 'voice:offer',
            payload: { from: myUid, fromName: myName, to: payload.uid, sdp: pc.localDescription.toJSON() },
          });
        } catch (err) {
          console.warn('[voice] offer error', err);
        }
      })
      // Received an offer — answer it
      .on('broadcast', { event: 'voice:offer' }, async ({ payload }) => {
        if (payload.to !== myUid) return;
        const pc = createPeerConnection(payload.from, payload.fromName, channel, streamRef.current);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({
            type: 'broadcast',
            event: 'voice:answer',
            payload: { from: myUid, to: payload.from, sdp: pc.localDescription.toJSON() },
          });
        } catch (err) {
          console.warn('[voice] answer error', err);
        }
      })
      // Received an answer
      .on('broadcast', { event: 'voice:answer' }, async ({ payload }) => {
        if (payload.to !== myUid) return;
        const entry = connectionsRef.current[payload.from];
        if (entry) {
          try {
            await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } catch (err) {
            console.warn('[voice] setRemoteDescription error', err);
          }
        }
      })
      // ICE candidate exchange
      .on('broadcast', { event: 'voice:ice' }, async ({ payload }) => {
        if (payload.to !== myUid) return;
        const entry = connectionsRef.current[payload.from];
        if (entry) {
          try {
            await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (err) {
            console.warn('[voice] addIceCandidate error', err);
          }
        }
      })
      // Someone left
      .on('broadcast', { event: 'voice:leave' }, ({ payload }) => {
        if (payload.uid !== myUid) removePeer(payload.uid);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Announce ourselves
          channel.send({
            type: 'broadcast',
            event: 'voice:join',
            payload: { uid: myUid, name: myName },
          });
        }
      });

    setJoined(true);
  }, [eventId, myUid, cleanup]);

  const leave = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const enabled = streamRef.current.getAudioTracks()[0]?.enabled;
      streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !enabled; });
      setMuted(!enabled ? true : false);
    }
  }, []);

  return { joined, muted, peers, join, leave, toggleMute, supported: supabaseEnabled, error };
}
