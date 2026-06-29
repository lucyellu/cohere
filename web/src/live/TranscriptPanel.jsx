import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

function fmtTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ts));
}

export default function TranscriptPanel({ eventId, voice }) {
  const listRef = useRef(null);
  const [incognito, setIncognito] = useState(false);

  const history = voice.transcriptHistory || [];
  const historyRef = useRef(history);
  const joinedRef = useRef(voice.joined);
  const savedRef = useRef(false);
  const incognitoRef = useRef(incognito);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    incognitoRef.current = incognito;
  }, [incognito]);

  // Auto-scroll to latest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  // Auto-save when leaving the voice chat or unmounting
  useEffect(() => {
    return () => {
      if (joinedRef.current && historyRef.current.length > 0 && !savedRef.current && supabase && !incognitoRef.current) {
        supabase.from('voice_transcripts').insert({
          event_id: eventId,
          transcript: historyRef.current
        }).catch(e => console.error('Auto-save failed:', e));
        savedRef.current = true;
      }
    };
  }, [eventId]);

  // Handle case where we leave the voice chat without unmounting
  useEffect(() => {
    if (!voice.joined && joinedRef.current && historyRef.current.length > 0 && !savedRef.current && supabase && !incognitoRef.current) {
      supabase.from('voice_transcripts').insert({
        event_id: eventId,
        transcript: historyRef.current
      }).catch(e => console.error('Auto-save failed:', e));
      savedRef.current = true;
    }
    // Update joined state tracker
    joinedRef.current = voice.joined;
  }, [voice.joined, eventId]);



  if (!voice.joined) {
    return (
      <div className="cohear-chat cohear-chat--disabled">
        <p className="cohear-chat__empty">
          Join the voice chat to start live transcription.
        </p>
      </div>
    );
  }

  return (
    <div className="cohear-chat relative flex flex-col h-full bg-black/40">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/60 px-4 py-2">
        <span className="text-xs text-zinc-400">
          Live Group Transcription
        </span>
        <button
          onClick={() => setIncognito(!incognito)}
          className={`rounded px-2.5 py-1 text-[11px] font-semibold ${incognito ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
          title="When incognito is on, this chat will not be saved."
        >
          {incognito ? '🕵️ Incognito (On)' : 'Incognito (Off)'}
        </button>
      </div>
      
      <div className="cohear-chat__messages flex-1" ref={listRef}>
        {history.length === 0 ? (
          <p className="cohear-chat__empty">
            Listening for voices...
          </p>
        ) : (
          history.map((msg) => (
            <div key={msg.id} className="cohear-chat__msg">
              <span className="cohear-chat__author">{msg.name}</span>
              <span className={`cohear-chat__text ${!msg.isFinal ? 'opacity-60 italic' : ''}`}>
                {msg.text}
              </span>
              <span className="cohear-chat__time">{fmtTime(msg.ts)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
