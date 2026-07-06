import { useState, useEffect } from 'react';

export default function SunoLibrary({ onPlayUrl }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSuno() {
      setLoading(true);
      setError(null);
      try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://127.0.0.1:7777' : window.location.origin;
        
        const res = await fetch(`${baseUrl}/api/library/suno`);
        if (!res.ok) throw new Error('Failed to fetch library');
        const data = await res.json();
        setSongs(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSuno();
  }, []);

  function handlePlay(song) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'http://127.0.0.1:7777' : window.location.origin;
    onPlayUrl(`${baseUrl}${song.url}`);
  }

  return (
    <div className="cohear-panel mt-4 p-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <h3 className="text-sm font-semibold text-[var(--lcd-glow)]">DJ Local: Suno Library</h3>
      </div>
      
      {loading && <p className="text-xs text-zinc-400">Loading your library...</p>}
      {error && <p className="text-xs text-red-400">Error: {error}</p>}
      
      <div className="max-h-64 overflow-y-auto space-y-2">
        {songs.map((song) => (
          <div key={song.id} className="flex items-center justify-between rounded bg-black/20 p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{song.title}</p>
              <p className="truncate text-xs text-zinc-400">{song.tags}</p>
            </div>
            <button
              className="ml-3 cohear-primary text-[11px] py-1 px-3"
              onClick={() => handlePlay(song)}
            >
              Play
            </button>
          </div>
        ))}
        {!loading && !error && songs.length === 0 && (
          <p className="text-xs text-zinc-400">No songs found in local Suno library.</p>
        )}
      </div>
    </div>
  );
}
