import { useEffect, useRef, useState } from 'react';
import { youtubeSearch, getLyrics, synthesizeScene, getTopTracks, getSetlist } from '../api.js';
import { fmtDate, fmtCapacity } from '../tour.js';

// The Show: relive one concert. Per setlist song we pull real fan clips
// (YouTube) as multi-angle footage + real lyrics (Musixmatch). Songs nobody
// filmed get the BYOC "synthesize" path (wired in the next phase).

export default function ShowView({ show, onBack, onOpenByoc }) {
  const [activeSong, setActiveSong] = useState(show?.setlist?.[0] || null);
  const [songs, setSongs] = useState(show?.setlist || []);
  const [songsKind, setSongsKind] = useState(show?.setlist?.length ? 'setlist' : 'loading');
  const [setlistSrc, setSetlistSrc] = useState(null); // setlist.fm source meta
  const [angle, setAngle] = useState(0);
  const [clips, setClips] = useState({}); // song -> [videos] | 'none'
  const [lyrics, setLyrics] = useState({}); // song -> text | 'none'
  const [synth, setSynth] = useState({}); // song -> { loading, image, mode, error }
  const [synthView, setSynthView] = useState(false); // show AI scene instead of video
  const [loading, setLoading] = useState(false);
  const cache = useRef({ clips: {}, lyrics: {} });

  async function synthesize(song) {
    setSynth((s) => ({ ...s, [song]: { loading: true } }));
    const lyr = lyrics[song] && lyrics[song] !== 'none' ? lyrics[song] : '';
    const mood = lyr.split('\n').filter(Boolean).slice(0, 6).join(' ').slice(0, 240);
    const prompt =
      `Cinematic wide concert photograph of ${show.artist} performing "${song}" live at ${show.venue}, ` +
      `${show.city}. Dramatic stage lighting, lasers, crowd silhouettes with phone lights, atmospheric haze, ` +
      `emotional and epic. Mood from the lyrics: ${mood}. No text, no watermark.`;
    const res = await synthesizeScene(prompt, song).catch(() => null);
    setSynth((s) => ({
      ...s,
      [song]: { loading: false, image: res?.image || null, mode: res?.mode, error: res?.error || null },
    }));
  }

  async function selectSong(song) {
    setActiveSong(song);
    setAngle(0);
    setSynthView(false);
    if (cache.current.clips[song] !== undefined) {
      setClips((c) => ({ ...c, [song]: cache.current.clips[song] }));
      setLyrics((l) => ({ ...l, [song]: cache.current.lyrics[song] }));
      return;
    }
    setLoading(true);
    const [yt, lyr] = await Promise.all([
      youtubeSearch(`${show.artist} ${song} ${show.venue} live`).catch(() => null),
      getLyrics(song, show.artist).catch(() => null),
    ]);
    const items = (yt?.data?.items || []).filter((i) => i?.id?.videoId);
    const clipVal = items.length ? items.slice(0, 4) : 'none';
    const body = yt && parseLyrics(lyr);
    cache.current.clips[song] = clipVal;
    cache.current.lyrics[song] = body || 'none';
    setClips((c) => ({ ...c, [song]: clipVal }));
    setLyrics((l) => ({ ...l, [song]: body || 'none' }));
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      // 1. Curated demo tour already carries a setlist.
      if (show?.setlist?.length) {
        setSongs(show.setlist);
        setSongsKind('setlist');
        selectSong(show.setlist[0]);
        return;
      }
      setSongsKind('loading');
      // 2. Real setlist via setlist.fm (exact date, else most recent past show).
      const sf = await getSetlist(show.artist, show.date).catch(() => null);
      if (cancelled) return;
      if (sf?.songs?.length) {
        setSongs(sf.songs);
        setSongsKind(sf.exact ? 'setlist' : 'recent');
        setSetlistSrc(sf.source || null);
        selectSong(sf.songs[0]);
        return;
      }
      // 3. Fall back to the artist's top tracks.
      const tracks = await getTopTracks(show.artist).catch(() => []);
      if (cancelled) return;
      setSongs(tracks);
      setSongsKind(tracks.length ? 'toptracks' : 'empty');
      if (tracks.length) selectSong(tracks[0]);
    }
    setup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id]);

  if (!show) return null;
  const songClips = clips[activeSong];
  const hasFootage = Array.isArray(songClips) && songClips.length > 0;
  const showSynth = synthView || songClips === 'none';
  const current = hasFootage ? songClips[Math.min(angle, songClips.length - 1)] : null;

  function openSynth() {
    setSynthView(true);
    const st = synth[activeSong];
    if (!st?.image && !st?.loading) synthesize(activeSong);
  }

  return (
    <div>
      {/* Show header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10">
          ← Globe
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-zinc-100">{show.artist}</h2>
          <p className="text-sm text-zinc-500">
            {show.venue} · {[show.city, show.country].filter(Boolean).join(', ')} · {fmtDate(show.date)}
          </p>
        </div>
        <span className="ml-auto rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300">
          {fmtCapacity(show.capacity)} capacity
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Setlist */}
        <aside className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {songsKind === 'toptracks' ? 'Popular songs' : songsKind === 'recent' ? 'Recent setlist' : 'Setlist'}
          </h3>
          {songsKind === 'recent' && (
            <p className="mb-2 text-[11px] text-zinc-600">
              What they've been playing — from their {setlistSrc?.date || 'last'} show
              {setlistSrc?.venue ? ` at ${setlistSrc.venue}` : ''} (via setlist.fm).
            </p>
          )}
          {songsKind === 'toptracks' && (
            <p className="mb-2 text-[11px] text-zinc-600">No setlist on record — showing this artist's top tracks.</p>
          )}
          {songs.length ? (
            <ol className="space-y-1.5">
              {songs.map((song, i) => {
                const c = clips[song];
                const state = c === undefined ? '' : c === 'none' ? 'gap' : 'footage';
                return (
                  <li key={i}>
                    <button
                      onClick={() => selectSong(song)}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        song === activeSong
                          ? 'border-indigo-400/50 bg-indigo-500/10 text-zinc-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <span className="w-5 text-xs tabular-nums text-zinc-600">{i + 1}</span>
                      <span className="flex-1 truncate">{song}</span>
                      {state === 'footage' && <span title="Crowd footage found">🎥</span>}
                      {state === 'gap' && <span title="No footage — synthesize">✨</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-zinc-600">
              {songsKind === 'loading' ? 'Loading songs…' : 'No songs found for this artist.'}
            </p>
          )}
        </aside>

        {/* Stage */}
        <main className="lg:col-span-3">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Finding footage…</div>
            ) : showSynth ? (
              <SynthStage
                gap={songClips === 'none'}
                state={synth[activeSong]}
                onSynthesize={() => synthesize(activeSong)}
                onOpenByoc={onOpenByoc}
              />
            ) : current ? (
              <iframe
                key={current.id.videoId}
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${current.id.videoId}`}
                title={current.snippet.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Select a song to begin.
              </div>
            )}
          </div>

          {/* Angle switcher: crowd footage angles + the AI scene (always available) */}
          {(hasFootage || songClips === 'none') && (
            <div className="mt-2 flex flex-wrap gap-2">
              {hasFootage &&
                songClips.map((v, i) => (
                  <button
                    key={v.id.videoId}
                    onClick={() => {
                      setSynthView(false);
                      setAngle(i);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      !showSynth && i === angle ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                    title={v.snippet.title}
                  >
                    Angle {i + 1} · {v.snippet.channelTitle.slice(0, 16)}
                  </button>
                ))}
              <button
                onClick={openSynth}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  showSynth ? 'bg-fuchsia-500 text-white' : 'bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20'
                }`}
              >
                ✨ AI scene
              </button>
            </div>
          )}

          {/* Lyrics */}
          {activeSong && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-100">{activeSong} — lyrics</h4>
              {lyrics[activeSong] && lyrics[activeSong] !== 'none' ? (
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-400">
                  {lyrics[activeSong]}
                </pre>
              ) : (
                <p className="text-xs text-zinc-600">{loading ? 'Loading lyrics…' : 'Lyrics unavailable for this track.'}</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SynthStage({ gap, state, onSynthesize, onOpenByoc }) {
  if (state?.loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-400">
        <div className="animate-pulse text-3xl">✨</div>
        Synthesizing scene…
      </div>
    );
  }
  if (state?.image) return <SynthScene state={state} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-3xl">✨</div>
      <p className="text-sm text-zinc-300">
        {gap ? 'No crowd footage found for this song.' : 'Reimagine this performance with AI.'}
      </p>
      <p className="max-w-sm text-xs text-zinc-600">
        Bring your own compute to synthesize the scene from the song's lyrics &amp; mood.
      </p>
      <button
        onClick={onSynthesize}
        className="rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Synthesize performance →
      </button>
      <button onClick={onOpenByoc} className="text-[11px] text-zinc-500 hover:text-zinc-300">
        add a Gemini key for real AI generation →
      </button>
    </div>
  );
}

function SynthScene({ state }) {
  const badge =
    state.mode === 'byoc'
      ? 'AI · your compute'
      : state.mode === 'live'
        ? 'AI · gateway'
        : state.mode === 'seed'
          ? 'Pinterest seed'
          : 'placeholder';
  return (
    <div className="relative h-full w-full">
      <img src={state.image} alt="synthesized concert scene" className="h-full w-full object-cover" />
      <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-fuchsia-200">
        ✨ {badge}
      </span>
      {state.error && (
        <span className="absolute bottom-3 left-3 right-3 truncate rounded-md bg-red-500/20 px-2 py-1 text-[11px] text-red-200">
          {state.error}
        </span>
      )}
    </div>
  );
}

// Pull lyric text out of a Musixmatch matcher.lyrics.get payload and strip the
// non-commercial tracking footer.
function parseLyrics(payload) {
  const body = payload?.data?.message?.body?.lyrics?.lyrics_body;
  if (!body) return null;
  return body.replace(/\*+.*?\*+/gs, '').replace(/\n{3,}/g, '\n\n').trim();
}
