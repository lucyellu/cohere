import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Click-to-inspect lightbox: any stamp or visa opens hero-size over a dimmed
// backdrop (the marijanapav.com select-and-center gesture, minus the physics).
// Esc, backdrop click or the ✕ closes it.
export default function StampHero({ open, onClose, wide = false, label = 'Stamp', children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="cohear-hero" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className={`cohear-hero__body${wide ? ' cohear-hero__body--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <button type="button" className="cohear-hero__close" onClick={onClose} aria-label="Close">✕</button>
    </div>,
    document.body,
  );
}
