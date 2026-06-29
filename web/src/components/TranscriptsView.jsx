import { useEffect, useState } from 'react';
import { supabase } from '../live/supabase.js';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export default function TranscriptsView() {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      try {
        let query = supabase.from('voice_transcripts').select('*').order('created_at', { ascending: false });
        
        if (showTrash) {
          query = query.not('deleted_at', 'is', null);
        } else {
          query = query.is('deleted_at', null);
        }

        const { data, error } = await query;
        if (error) throw error;
        setTranscripts(data || []);
      } catch (error) {
        console.error("Error fetching transcripts:", error);
      }
      setLoading(false);
    }
    load();
  }, [showTrash]);



  async function moveToTrash(id) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('voice_transcripts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setTranscripts(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert("Failed to move to trash: " + e.message);
    }
  }

  async function restore(id) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('voice_transcripts').update({ deleted_at: null }).eq('id', id);
      if (error) throw error;
      setTranscripts(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert("Failed to restore: " + e.message);
    }
  }

  async function permanentlyDelete(id) {
    if (!supabase || !confirm("Are you sure you want to permanently delete this chat?")) return;
    try {
      const { error } = await supabase.from('voice_transcripts').delete().eq('id', id);
      if (error) throw error;
      setTranscripts(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert("Failed to delete: " + e.message);
    }
  }

  if (loading) {
    return <section className="p-5 text-zinc-500">Loading past chats...</section>;
  }

  if (!supabase) {
    return (
      <section className="cohear-panel m-5 p-8 text-center text-zinc-500">
        Saving transcripts requires Supabase. Please check your setup.
      </section>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white">{showTrash ? 'Trash' : 'Past Voice Chats'}</h2>
        <button 
          onClick={() => setShowTrash(!showTrash)}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
        >
          {showTrash ? 'View Active Chats' : 'View Trash'}
        </button>
      </div>

      {transcripts.length === 0 ? (
        <section className="cohear-panel p-8 text-center text-zinc-500">
          {showTrash ? "Trash is empty." : "No past voice chats saved yet. Go into a Live Room to start one!"}
        </section>
      ) : (
        <div className="grid gap-4">
          {transcripts.map((t) => (
            <div key={t.id} className="cohear-panel flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-200">Room: {t.event_id}</h3>
                  <p className="text-xs text-zinc-500">
                    {showTrash ? `Deleted on ${fmtDate(t.deleted_at)}` : `Saved on ${fmtDate(t.created_at)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {showTrash ? (
                    <>
                      <button onClick={() => restore(t.id)} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30">
                        Restore
                      </button>
                      <button onClick={() => permanentlyDelete(t.id)} className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30">
                        Delete
                      </button>
                    </>
                  ) : (
                    <button onClick={() => moveToTrash(t.id)} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-red-500/20 hover:text-red-300">
                      Trash
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
