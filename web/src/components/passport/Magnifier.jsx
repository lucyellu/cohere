import { useRef, useState } from 'react';

// A philatelist's loupe (the marijanapav.com stamps page has a fancy WebGL
// one; this is the honest CSS version). Wrap a stamp in <Magnifier> and set
// `active`: a circular lens follows the pointer showing `content` — a second
// render of the same stamp — scaled up, offset so the point under the cursor
// stays under the lens center.
export default function Magnifier({ active, zoom = 2.6, size = 118, content, children }) {
  const ref = useRef(null);
  const [lens, setLens] = useState(null); // pointer position + host box, in host px

  function onMove(e) {
    if (!active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setLens({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
  }

  return (
    <div
      ref={ref}
      className="cohear-loupe-host"
      onPointerMove={onMove}
      onPointerLeave={() => setLens(null)}
    >
      {children}
      {active && lens && (
        <div className="cohear-loupe" style={{ left: lens.x, top: lens.y, width: size, height: size }} aria-hidden="true">
          <div
            className="cohear-loupe__view"
            style={{
              width: lens.w * zoom,
              height: lens.h * zoom,
              left: size / 2 - lens.x * zoom,
              top: size / 2 - lens.y * zoom,
            }}
          >
            {content ?? children}
          </div>
        </div>
      )}
    </div>
  );
}
