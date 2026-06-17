import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { youtubeTop } from './liveApi.js';

// A single persistent player shared across the whole app (like Spotify's bottom
// bar). Lives above the view switch so it keeps playing as you change tabs.
// For any song it loads the YouTube top result — "Music" (studio) or "Live".

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

export function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null); // { videoId, title, channel, artist, song }
  const [mode, setMode] = useState('live'); // 'live' | 'music'
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const queryFor = (artist, song, m) => (m === 'live' ? `${artist} ${song} live` : `${artist} ${song}`);

  const load = useCallback(async (artist, song, m) => {
    const id = ++reqId.current;
    // Show the bar immediately (even before the search resolves) so a click
    // always gets a visible reaction.
    setTrack({ artist, song, videoId: null, title: song, channel: '', notFound: false });
    setLoading(true);
    const top = await youtubeTop(queryFor(artist, song, m)).catch(() => null);
    if (id !== reqId.current) return; // a newer request superseded this one
    setLoading(false);
    setTrack(top ? { ...top, artist, song } : { artist, song, videoId: null, title: song, channel: '', notFound: true });
  }, []);

  // Play a song; remembers artist/song so the Music/Live toggle can re-query.
  const playSong = useCallback((artist, song) => {
    if (!artist || !song) return;
    setExpanded(false);
    load(artist, song, mode);
  }, [load, mode]);

  // Switch Music <-> Live and reload the current song in that mode.
  const switchMode = useCallback((m) => {
    setMode(m);
    if (track?.artist && track?.song) load(track.artist, track.song, m);
  }, [load, track]);

  const close = useCallback(() => setTrack(null), []);

  return (
    <PlayerCtx.Provider value={{ track, mode, expanded, loading, playSong, switchMode, setExpanded, close }}>
      {children}
    </PlayerCtx.Provider>
  );
}
