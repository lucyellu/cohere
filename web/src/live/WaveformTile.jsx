import { useEffect, useRef } from 'react';

// Neon color palette — self gets indigo, peers cycle through the rest.
const PALETTE = [
  { r: 129, g: 140, b: 248 }, // indigo  (self)
  { r: 34,  g: 211, b: 238 }, // cyan
  { r: 52,  g: 211, b: 153 }, // emerald
  { r: 251, g: 113, b: 133 }, // rose
  { r: 251, g: 191, b: 36  }, // amber
  { r: 167, g: 139, b: 250 }, // violet
];

/**
 * WaveformTile — renders a single participant's audio waveform on a canvas.
 *
 * Props:
 *   stream   – MediaStream (mic audio)
 *   name     – display name
 *   isSelf   – true for the local user
 *   muted    – true when mic is muted
 *   colorIdx – index into the PALETTE array
 */
export default function WaveformTile({ stream, name, isSelf, muted, colorIdx = 0 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(0);
  const ctxRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) return undefined;

    // Set up Web Audio analyser
    let audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return undefined;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    const bufLen = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufLen);

    const color = PALETTE[colorIdx % PALETTE.length];
    const lineColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
    const glowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.55)`;

    function draw() {
      animRef.current = requestAnimationFrame(draw);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctxRef.current = ctx;

      // Match canvas internal resolution to display size
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      analyser.getByteTimeDomainData(dataArray);

      // Draw the waveform as a thick line
      ctx.lineWidth = 3.5 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Glow effect
      ctx.shadowBlur = 12 * dpr;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = lineColor;

      ctx.beginPath();
      const sliceWidth = w / bufLen;
      let x = 0;

      for (let i = 0; i < bufLen; i++) {
        const v = dataArray[i] / 128.0; // normalize to 0–2 range (1 = center)
        const y = (v * h) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();

      // Reset shadow for next frame
      ctx.shadowBlur = 0;
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      source.disconnect();
      analyser.disconnect();
      audioCtx.close().catch(() => {});
    };
  }, [stream, colorIdx]);

  return (
    <div className={`cohear-voice-tile ${isSelf ? 'cohear-voice-tile--self' : ''}`}>
      <canvas
        ref={canvasRef}
        className="cohear-voice-tile__canvas"
        aria-label={`Audio waveform for ${name}`}
      />
      {/* Muted overlay */}
      {muted && (
        <div className="cohear-voice-tile__muted-overlay">
          <span className="cohear-voice-tile__muted-icon">🔇</span>
        </div>
      )}
      {/* Name label */}
      <div className="cohear-voice-tile__label">
        <span className="cohear-voice-tile__name">{name}</span>
        {isSelf && <span className="cohear-voice-tile__you-badge">You</span>}
      </div>
    </div>
  );
}
