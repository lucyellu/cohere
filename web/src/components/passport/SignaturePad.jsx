import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Modal signature pad: draw with pointer/touch on a transparent canvas, or
// upload an existing signature image. Saves a PNG data URL — transparent for
// drawn signatures, so the ink sits straight on the passport paper.
export default function SignaturePad({ open, hasSignature, onSave, onClose }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drawing = useRef(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  // Size the canvas to its CSS box at device resolution each time it opens.
  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setError('');
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c2e6e'; // fountain-pen blue-black
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = pos(e);
  }
  function move(e) {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(drawing.current.x, drawing.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.current = p;
    setDirty(true);
  }
  function up() {
    drawing.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  }

  function save() {
    if (!dirty) return;
    onSave?.(canvasRef.current.toDataURL('image/png'));
    onClose?.();
  }

  // Uploaded image: downscale to a compact PNG so it fits in localStorage.
  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setError('Could not read that file.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setError('That image could not be loaded.');
      img.onload = () => {
        const w = Math.min(600, img.width);
        const h = Math.round(img.height * (w / img.width));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        onSave?.(canvas.toDataURL('image/png'));
        onClose?.();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-black/20 bg-[#f4eddc] p-5 text-[#2c2216] shadow-2xl"
        role="dialog"
        aria-label="Sign your passport"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/15 pb-2">
          <h3 className="text-sm font-black uppercase tracking-[0.18em]">Signature of bearer</h3>
          <button type="button" className="text-lg leading-none opacity-60 hover:opacity-100" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="relative mt-4 h-44 rounded-lg border border-dashed border-black/30 bg-white/55">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
          />
          {/* baseline, like the signing box on a real application form */}
          <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-black/30" aria-hidden="true" />
          {!dirty && (
            <span className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs italic opacity-45">
              Sign here with your mouse or finger
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-md border border-black/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-black/[0.06]" onClick={clear}>
            Clear
          </button>
          <button type="button" className="rounded-md border border-black/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-black/[0.06]" onClick={() => fileRef.current?.click()}>
            Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          {hasSignature && (
            <button
              type="button"
              className="rounded-md border border-red-800/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-800 hover:bg-red-800/10"
              onClick={() => { onSave?.(''); onClose?.(); }}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            className="ml-auto rounded-md bg-[#1c2e6e] px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-[#24397f] disabled:opacity-40"
            onClick={save}
            disabled={!dirty}
          >
            Save signature
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-800">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
