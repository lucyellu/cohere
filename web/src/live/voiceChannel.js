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

/** Maximum number of participants in a voice call (including self). */
const MAX_VOICE_PARTICIPANTS = 6;

/**
 * useVoice(eventId) — WebRTC voice chat for a live room.
 *
 * Returns:
 *   joined       – boolean, whether we're in the voice channel
 *   muted        – boolean, mic mute state
 *   peers        – array of { uid, name, stream } for everyone in voice
 *   localStream  – the local MediaStream (mic), or null
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
  const [localStream, setLocalStream] = useState(null);
  const [localTranscript, setLocalTranscript] = useState('');
  const [transcriptHistory, setTranscriptHistory] = useState([]);

  const channelRef = useRef(null);
  const streamRef = useRef(null);
  const speechRef = useRef(null);
  const connectionsRef = useRef({}); // uid → { pc, name, stream, transcript }
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

    // Stop local mic stream and transcription
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (speechRef.current) {
      try { speechRef.current.stop(); } catch {}
      speechRef.current = null;
    }
    setLocalStream(null);
    setLocalTranscript('');
    setTranscriptHistory([]);

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

  function createPeerConnection(remoteUid, remoteName, channel, localStreamArg) {
    if (connectionsRef.current[remoteUid]) return connectionsRef.current[remoteUid].pc;

    // Enforce participant cap (5 remote peers + self = 6 total)
    const currentPeerCount = Object.keys(connectionsRef.current).length;
    if (currentPeerCount >= MAX_VOICE_PARTICIPANTS - 1) {
      console.warn(`[voice] Room full (${MAX_VOICE_PARTICIPANTS} max). Rejecting peer ${remoteUid}`);
      setError(`Voice call is full (${MAX_VOICE_PARTICIPANTS} max).`);
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add our local audio tracks
    if (localStreamArg) {
      localStreamArg.getTracks().forEach((track) => pc.addTrack(track, localStreamArg));
    }

    // Handle remote audio — store the stream for waveform visualization AND play it
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        const remoteStream = e.streams[0];
        addRemoteStream(remoteUid, remoteStream);

        // Store the stream on the connection entry for waveform access
        if (connectionsRef.current[remoteUid]) {
          connectionsRef.current[remoteUid].stream = remoteStream;
          syncPeerList();
        }
      }
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

    connectionsRef.current[remoteUid] = { pc, name: remoteName, stream: null };
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

  const syncPeerList = useCallback(() => {
    setPeers(
      Object.entries(connectionsRef.current).map(([uid, { name, stream, transcript }]) => ({ uid, name, stream, transcript })),
    );
  }, []);

  const join = useCallback(async () => {
    if (!supabase || !eventId) {
      setError('Chat requires Supabase to be configured.');
      return;
    }
    setError(null);

    // 1) Get mic permission
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (err) {
      setError('Microphone access denied. Please allow mic access and try again.');
      return;
    }
    streamRef.current = stream;
    setLocalStream(stream);

    // 2) Set up SpeechRecognition for live subtitles
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let transcript = '';
        let isFinal = false;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        setLocalTranscript(transcript);
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'voice:transcript',
            payload: { 
              uid: myUid, 
              name: myName,
              text: transcript, 
              isFinal, 
              ts: Date.now() 
            },
          });
        }
        // Locally add to history just like we received it
        handleIncomingTranscript({ uid: myUid, name: myName, text: transcript, isFinal, ts: Date.now() });
      };
      recognition.onerror = () => {};
      recognition.onend = () => {
        // restart if still joined
        if (streamRef.current) {
          try { recognition.start(); } catch {}
        }
      };
      try {
        recognition.start();
        speechRef.current = recognition;
      } catch (err) {
        console.warn('SpeechRecognition start error', err);
      }
    }

    // 3) Set up Supabase signaling channel
    const channel = supabase.channel(`voice:${eventId}`);
    channelRef.current = channel;
    const myName = guestName() || 'Guest';

    channel
      // Someone new joined — create an offer to them
      .on('broadcast', { event: 'voice:join' }, async ({ payload }) => {
        if (payload.uid === myUid) return;
        const pc = createPeerConnection(payload.uid, payload.name, channel, streamRef.current);
        if (!pc) return; // room full
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
        if (!pc) return; // room full
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
      // Received a transcript chunk
      .on('broadcast', { event: 'voice:transcript' }, ({ payload }) => {
        if (payload.uid === myUid) return;
        const entry = connectionsRef.current[payload.uid];
        if (entry) {
          entry.transcript = payload.text;
          syncPeerList();
        }
        handleIncomingTranscript(payload);
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
  }, [eventId, myUid, cleanup, syncPeerList]);

  // Helper to append/update the transcript history array
  const handleIncomingTranscript = useCallback((payload) => {
    setTranscriptHistory((prev) => {
      const next = [...prev];
      // Find the last open (not final) message from this user
      const idx = next.findLastIndex((msg) => msg.uid === payload.uid && !msg.isFinal);
      if (idx !== -1) {
        next[idx] = { ...next[idx], text: payload.text, isFinal: payload.isFinal, ts: payload.ts };
      } else {
        next.push({
          id: Math.random().toString(36).slice(2),
          uid: payload.uid,
          name: payload.name || 'Guest',
          text: payload.text,
          isFinal: payload.isFinal,
          ts: payload.ts,
        });
      }
      // Optional: keep array from growing infinitely if room runs for 12 hours
      if (next.length > 500) return next.slice(-500);
      return next;
    });
  }, []);

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

  return {
    joined,
    muted,
    peers,
    localStream,
    localTranscript,
    transcriptHistory,
    join,
    leave,
    toggleMute,
    supported: supabaseEnabled,
    error,
  };
}
