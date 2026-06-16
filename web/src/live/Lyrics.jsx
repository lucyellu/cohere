import { useEffect, useState } from 'react';
import { getLyrics } from '../api.js';

// Real lyrics (Musixmatch) for whatever the crowd is on right now — so you can
// sing along from your bedroom. Refetches as the live song changes.

export default function Lyrics({ artist, song }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!song) {
      setText('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    getLyrics(song, artist)
      .then((p) => {
        if (cancelled) return;
        setText(parseLyrics(p) || 'none');
        setLoading(false);
      })
      .catch(() => !cancelled && (setText('none'), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [artist, song]);

  if (!song) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h4 className="mb-2 text-sm font-semibold text-zinc-100">{song} — lyrics</h4>
      {loading ? (
        <p className="text-xs text-zinc-600">Loading lyrics…</p>
      ) : text && text !== 'none' ? (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-400">{text}</pre>
      ) : (
        <p className="text-xs text-zinc-600">Lyrics unavailable for this track.</p>
      )}
    </div>
  );
}

function parseLyrics(payload) {
  const body = payload?.data?.message?.body?.lyrics?.lyrics_body;
  if (!body) return null;
  return body.replace(/\*+.*?\*+/gs, '').replace(/\n{3,}/g, '\n\n').trim();
}
