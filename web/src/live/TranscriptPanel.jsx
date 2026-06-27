import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase.js';
import { collection, addDoc } from 'firebase/firestore';

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const history = voice.transcriptHistory || [];

  // Auto-scroll to latest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  async function handleSave() {
    if (!history.length || !db) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'voice_transcripts'), {
        event_id: eventId,
        transcript: history,
        created_at: new Date().toISOString()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save transcript:', e.message);
      alert('Failed to save transcript: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

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
          onClick={handleSave}
          disabled={saving || !history.length}
          className="rounded bg-fuchsia-500/20 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-300 hover:bg-fuchsia-500/30 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Transcript'}
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
