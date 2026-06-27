import { useEffect, useState } from 'react';
import { db } from '../firebase.js';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';

function fmtDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ts));
}

export default function TranscriptsView() {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    async function load() {
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, 'voice_transcripts'), orderBy('created_at', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTranscripts(data);
      } catch (error) {
        console.error("Error fetching transcripts:", error);
      }
      setLoading(false);
    }
    load();
  }, []);

  function toggle(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) {
    return <section className="p-5 text-zinc-500">Loading past chats...</section>;
  }

  if (!supabase) {
    return (
      <section className="cohear-panel m-5 p-8 text-center text-zinc-500">
        Saving transcripts requires Supabase. Please configure your .env file.
      </section>
    );
  }

  if (transcripts.length === 0) {
    return (
      <section className="cohear-panel m-5 p-8 text-center text-zinc-500">
        No past voice chats saved yet. Go into a Live Room and click "Save Transcript"!
      </section>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white">Past Voice Chats</h2>
      </div>

      <div className="grid gap-4">
        {transcripts.map((t) => (
          <div key={t.id} className="cohear-panel flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-zinc-200">Room: {t.event_id}</h3>
                <p className="text-xs text-zinc-500">Saved on {fmtDate(t.created_at)}</p>
              </div>
              <button 
                onClick={() => toggle(t.id)} 
                className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
              >
                {expanded[t.id] ? 'Hide Chat' : 'Read Chat'}
              </button>
            </div>
            
            {expanded[t.id] && (
              <div className="cohear-chat mt-2 max-h-[400px] overflow-y-auto rounded-xl bg-black/40">
                <div className="cohear-chat__messages border-none">
                  {(t.transcript || []).map((msg, i) => (
                    <div key={i} className="cohear-chat__msg">
                      <span className="cohear-chat__author">{msg.name}</span>
                      <span className="cohear-chat__text text-zinc-300">{msg.text}</span>
                      <span className="cohear-chat__time">{fmtTime(msg.ts)}</span>
                    </div>
                  ))}
                  {(!t.transcript || t.transcript.length === 0) && (
                    <p className="cohear-chat__empty">This transcript was empty.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
