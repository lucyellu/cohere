import { useEffect, useRef, useState } from 'react';
import { guestName, submitVoiceNote, voteVoiceNote } from './liveApi.js';
import { fmtDur } from './clock.js';

export function VoiceNoteRecorder({ event, np, onSubmitted, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'review' | 'uploading' | 'success'
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState(null);
  const [audioLevels, setAudioLevels] = useState([20, 40, 60, 30, 50, 70, 45, 25]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  const previewAudioRef = useRef(null);

  // Compute live song tag from nowPlaying
  const defaultIdx = np?.index != null && np.index >= 0 ? np.index : 0;
  const [songIdx, setSongIdx] = useState(defaultIdx);

  useEffect(() => {
    if (np?.index != null && np.index >= 0) {
      setSongIdx(np.index);
    }
  }, [np?.index]);

  const selectedSong = event?.timeline?.[Number(songIdx)]?.song || 'General';

  // Compute live timecode text
  const currentSongTimecode = (() => {
    if (np?.status === 'live' && np.song) {
      const elapsed = fmtDur(np.elapsedSec || 0);
      const total = fmtDur(np.durSec || 210);
      return `${elapsed} into “${np.song}” (Song #${(np.index ?? 0) + 1})`;
    }
    if (np?.status === 'pre') return 'Pre-show · Starting soon';
    if (np?.status === 'ended') return 'Post-show encore memories';
    return selectedSong ? `During “${selectedSong}”` : 'Live show moment';
  })();

  const MAX_DURATION_SEC = 120; // 2 minutes

  async function startRecording() {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Audio analysis for live visualizer
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevels = () => {
            if (!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            const levels = Array.from(dataArray.slice(0, 8)).map((v) => Math.max(15, Math.min(100, Math.round((v / 255) * 100))));
            setAudioLevels(levels);
            animFrameRef.current = requestAnimationFrame(updateLevels);
          };
          updateLevels();
        }
      } catch {
        /* audio context analyzer optional */
      }

      audioChunksRef.current = [];
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Stop stream tracks
        stream.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});

        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioBase64(reader.result);
          setStatus('review');
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setStatus('recording');
      setDuration(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setDuration(elapsed);
        if (elapsed >= MAX_DURATION_SEC) {
          stopRecording();
        }
      }, 200);
    } catch (err) {
      setError(err.message || 'Could not access microphone');
      setStatus('idle');
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function discard() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBase64(null);
    setCaption('');
    setDuration(0);
    setStatus('idle');
    setIsPlayingPreview(false);
  }

  async function handlePost() {
    if (!audioBase64 || !event?.id) return;
    setStatus('uploading');
    setError(null);
    try {
      const res = await submitVoiceNote(event.id, {
        audioData: audioBase64,
        durationSec: Math.max(1, duration),
        title: caption.trim() || `Voice note during “${selectedSong}”`,
        songIndex: Number(songIdx),
        songTimecode: currentSongTimecode,
      });

      if (res?.ok) {
        setStatus('success');
        setTimeout(() => {
          discard();
          setIsOpen(false);
          onSubmitted?.();
        }, 1200);
      } else {
        throw new Error(res?.error || 'Failed to post voice note');
      }
    } catch (e) {
      setError(e.message || 'Upload failed');
      setStatus('review');
    }
  }

  const togglePlayPreview = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-950/40 via-purple-950/30 to-black/40 p-3 shadow-lg">
      {!isOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-500/20 text-lg text-fuchsia-300 ring-1 ring-fuchsia-400/40">
              🎙️
            </span>
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                Leave a Voice Note
                <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">
                  Friends replay
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Record a voice message pinned to {np?.song ? <span className="text-fuchsia-300 font-medium">“{np.song}”</span> : 'this moment'}. Friends hear it when they join later!
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition hover:from-fuchsia-500 hover:to-indigo-500"
          >
            <span>🎙️ Record note</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎙️</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200">
                Voice Note for Friends
              </span>
            </div>
            <button
              onClick={() => {
                discard();
                setIsOpen(false);
              }}
              className="rounded p-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Song selection and timecode tag */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400">Tag to song:</span>
            <select
              value={songIdx}
              onChange={(e) => setSongIdx(Number(e.target.value))}
              disabled={status === 'recording' || status === 'uploading'}
              className="rounded-lg border border-white/15 bg-black/60 px-2 py-1 text-xs font-medium text-fuchsia-200 outline-none focus:border-fuchsia-400"
            >
              {event?.timeline?.map((s) => (
                <option key={s.i} value={s.i}>
                  {s.i + 1}. {s.song} {np?.index === s.i ? '🔴 (Now Playing)' : ''}
                </option>
              ))}
            </select>
            <span className="rounded bg-black/40 px-2 py-1 text-[11px] text-zinc-400">
              ⏱ {currentSongTimecode}
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/20 p-2 text-xs text-rose-200 border border-rose-500/30">
              {error}
            </div>
          )}

          {/* RECORDING STATE */}
          {status === 'recording' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/40 bg-rose-950/20 p-4">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <span className="h-3 w-3 animate-ping rounded-full bg-rose-500" />
                Recording voice note...
              </div>

              {/* Live animated waveform visualizer */}
              <div className="flex h-12 items-center gap-1">
                {audioLevels.map((lvl, idx) => (
                  <div
                    key={idx}
                    className="w-1.5 rounded-full bg-gradient-to-t from-fuchsia-500 to-rose-400 transition-all duration-75"
                    style={{ height: `${lvl}%` }}
                  />
                ))}
              </div>

              <div className="text-xs font-mono text-zinc-300">
                {fmtDur(duration)} / {fmtDur(MAX_DURATION_SEC)}
              </div>

              <button
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-rose-500 active:scale-95"
              >
                <span>⏹ Stop & Preview</span>
              </button>
            </div>
          )}

          {/* IDLE STATE */}
          {status === 'idle' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-black/40 p-4 text-center">
              <p className="text-xs text-zinc-300 max-w-sm">
                Press the record button below to speak. Your voice note will be saved with the timestamp of <strong className="text-fuchsia-300">“{selectedSong}”</strong> for anyone entering the room.
              </p>
              <button
                onClick={startRecording}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition hover:from-rose-500 hover:to-fuchsia-500 active:scale-95"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                <span>Start Recording</span>
              </button>
            </div>
          )}

          {/* REVIEW STATE */}
          {status === 'review' && audioUrl && (
            <div className="space-y-3 rounded-lg border border-fuchsia-500/30 bg-black/50 p-3">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="font-semibold text-fuchsia-300">🎙️ Preview Voice Note ({fmtDur(duration)})</span>
                <span className="text-[11px] text-zinc-400">Tagged: {selectedSong}</span>
              </div>

              {/* Audio player preview */}
              <audio
                ref={previewAudioRef}
                src={audioUrl}
                onTimeUpdate={(e) => setPreviewTime(Math.round(e.target.currentTime))}
                onEnded={() => setIsPlayingPreview(false)}
                className="hidden"
              />

              <div className="flex items-center gap-3 rounded-lg bg-white/[0.05] p-2.5">
                <button
                  onClick={togglePlayPreview}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-500 text-sm text-white transition hover:bg-fuchsia-400"
                >
                  {isPlayingPreview ? '⏸' : '▶'}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{fmtDur(previewTime)}</span>
                    <span>{fmtDur(duration)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-indigo-400 transition-all"
                      style={{ width: `${duration > 0 ? (previewTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Optional text caption */}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add an optional caption (e.g. 'The crowd went wild on this drop!')"
                maxLength={120}
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-fuchsia-400"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={discard}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  Discard ↺
                </button>
                <button
                  onClick={handlePost}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:from-fuchsia-500 hover:to-indigo-500"
                >
                  <span>Post for friends 🚀</span>
                </button>
              </div>
            </div>
          )}

          {/* UPLOADING STATE */}
          {status === 'uploading' && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-black/40 p-4 text-xs text-fuchsia-300">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-fuchsia-400 border-t-transparent" />
              <span>Saving voice note to room...</span>
            </div>
          )}

          {/* SUCCESS STATE */}
          {status === 'success' && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 p-3 text-xs text-emerald-200">
              <span>✓ Voice note posted! Friends can play it back when they join.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VoiceNoteCard({ item, event, onVote }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(item.durationSec || 0);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(Math.round(audioRef.current.currentTime));
    if (!duration && audioRef.current.duration) {
      setDuration(Math.round(audioRef.current.duration));
    }
  };

  const handleSeek = (e) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formattedTime = (() => {
    if (!item.ts) return '';
    const d = new Date(item.ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  })();

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-fuchsia-500/30 bg-gradient-to-b from-[#180e29] via-[#120a1f] to-[#0c0614] p-3.5 shadow-xl transition hover:border-fuchsia-400/50">
      {/* Top badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            🎙️ Voice Note
          </span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
            {item.by || 'Friend'}
          </span>
        </div>
        {formattedTime && <span className="text-[10px] text-zinc-500 font-mono">{formattedTime}</span>}
      </div>

      {/* Song / Timecode banner */}
      <div className="my-2.5 rounded-lg border border-fuchsia-500/20 bg-black/40 p-2 text-left">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-200 truncate">
          <span>🎵</span>
          <span className="truncate">{item.song || item.title || 'Live Show Note'}</span>
        </div>
        {item.songTimecode && (
          <div className="mt-0.5 text-[10px] text-zinc-400 truncate">
            ⏱ {item.songTimecode}
          </div>
        )}
        {item.title && item.title !== `Voice note during “${item.song}”` && item.title !== item.song && (
          <p className="mt-1 line-clamp-2 text-[11px] italic text-zinc-300">
            "{item.title}"
          </p>
        )}
      </div>

      {/* Audio Element & Controls */}
      <audio
        ref={audioRef}
        src={item.audioData || item.url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => setDuration(Math.round(e.target.duration || item.durationSec || 0))}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        className="hidden"
      />

      <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] p-2">
        <button
          onClick={togglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-600 to-indigo-500 text-sm font-bold text-white shadow-md transition hover:scale-105 active:scale-95"
          title={isPlaying ? 'Pause' : 'Play voice note'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="min-w-0 flex-1">
          {/* Animated sound bars while playing */}
          <div className="mb-1 flex h-3 items-center gap-0.5">
            {[30, 70, 45, 90, 60, 80, 40, 65, 85, 50, 75, 35].map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isPlaying ? 'bg-fuchsia-400 animate-pulse' : 'bg-zinc-600'
                }`}
                style={{
                  height: isPlaying ? `${Math.max(25, (h * ((i % 3) + 1)) % 100)}%` : '25%',
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span>{fmtDur(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 1}
              value={currentTime}
              onChange={handleSeek}
              className="mx-2 h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-fuchsia-400 outline-none"
            />
            <span>{fmtDur(duration)}</span>
          </div>
        </div>
      </div>

      {/* Footer / Votes */}
      <div className="mt-2 flex items-center justify-between pt-1 text-[10px] text-zinc-400">
        <span className="text-[10px] text-fuchsia-300/80">Saved to room record</span>
        {item.id && (
          <button
            onClick={() => voteClip(event.id, item.id).then(onVote)}
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>▲</span>
            <span className="font-semibold">{item.votes || 1}</span>
          </button>
        )}
      </div>
    </div>
  );
}
