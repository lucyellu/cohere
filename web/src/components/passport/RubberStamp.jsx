import { useId } from 'react';
import { hashString } from './palette.js';

// A hand-inked immigration stamp drawn in SVG — curved lettering around a
// circular / oval die, a centre date block with the little ✈, and a
// turbulence-displaced outline so every impression looks pressed by a real
// rubber stamp (see stamps (1).jpg). Shape and wear are deterministic per id,
// so the same city always leaves the same mark.
const SHAPES = ['circle', 'oval', 'box'];

export default function RubberStamp({
  id = 'stamp',
  city = '',
  subtitle = 'COHERE · BORDER CONTROL',
  label = 'ADMITTED',
  date = '',
  ink = '#2f5fb4',
  shape, // circle | oval | box — deterministic when omitted
  className = '',
  style,
  title,
  onClick,
  onKeyDown,
  role,
  tabIndex,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const h = hashString(id);
  const form = shape || SHAPES[h % SHAPES.length];
  const wear = 0.78 + ((h >>> 4) % 18) / 100; // 0.78–0.95 — some stamps landed lighter
  const seed = (h % 90) + 1; // turbulence seed → unique ink bleed per stamp
  const cityText = (city || 'UNKNOWN').toUpperCase();
  // Long city names shrink instead of colliding with themselves on the arc.
  const citySize = cityText.length > 12 ? 10.5 : cityText.length > 8 ? 12 : 13.5;

  return (
    <svg
      viewBox="0 0 120 120"
      className={`cohear-rubber ${className}`}
      style={{ '--ink': ink, opacity: wear, ...style }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={title || `${cityText} entry stamp`}
    >
      {title && <title>{title}</title>}
      <defs>
        {/* Rough ink edge: fractal noise nudges every stroke like rubber on paper */}
        <filter id={`rough-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" />
        </filter>
        {/* Text arcs — top carries the city, bottom the issuing office. Ovals
            get flattened arcs so the lettering hugs the elliptical die. */}
        {form === 'oval' ? (
          <>
            <path id={`arcTop-${uid}`} d="M 15,60 A 45,36 0 0 1 105,60" fill="none" />
            <path id={`arcBot-${uid}`} d="M 13,60 A 47,38 0 0 0 107,60" fill="none" />
          </>
        ) : (
          <>
            <path id={`arcTop-${uid}`} d="M 15,60 A 45,45 0 0 1 105,60" fill="none" />
            <path id={`arcBot-${uid}`} d="M 13,60 A 47,47 0 0 0 107,60" fill="none" />
          </>
        )}
      </defs>

      <g filter={`url(#rough-${uid})`} stroke="var(--ink)" fill="var(--ink)">
        {form === 'circle' && (
          <>
            <circle cx="60" cy="60" r="57" fill="none" strokeWidth="3" />
            <circle cx="60" cy="60" r="37" fill="none" strokeWidth="1.2" opacity="0.8" />
          </>
        )}
        {form === 'oval' && (
          <>
            <ellipse cx="60" cy="60" rx="57" ry="48" fill="none" strokeWidth="3" />
            <ellipse cx="60" cy="60" rx="38" ry="30" fill="none" strokeWidth="1.2" opacity="0.8" />
          </>
        )}
        {form === 'box' && (
          <>
            <rect x="4" y="14" width="112" height="92" rx="7" fill="none" strokeWidth="3" />
            <rect x="11" y="21" width="98" height="78" rx="4" fill="none" strokeWidth="1.2" opacity="0.8" />
          </>
        )}

        {form === 'box' ? (
          /* Box dies read straight, like the dated FRANCE / registration stamps */
          <text x="60" y="36" textAnchor="middle" stroke="none" fontSize={citySize} fontWeight="800" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1">{cityText}</text>
        ) : (
          <text stroke="none" fontSize={citySize} fontWeight="800" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1.5">
            <textPath href={`#arcTop-${uid}`} startOffset="50%" textAnchor="middle">{cityText}</textPath>
          </text>
        )}

        {/* Centre block: admitted · ✈ · date */}
        <text x="60" y="52" textAnchor="middle" stroke="none" fontSize="6.5" fontWeight="700" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="2">{label}</text>
        <text x="60" y="64" textAnchor="middle" stroke="none" fontSize="9" fontFamily="ui-sans-serif, sans-serif">✈</text>
        <text x="60" y="76" textAnchor="middle" stroke="none" fontSize="8.5" fontWeight="800" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1">{date || '— — —'}</text>

        {form === 'box' ? (
          <text x="60" y="94" textAnchor="middle" stroke="none" fontSize="5.5" fontWeight="700" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1.6" opacity="0.85">{subtitle}</text>
        ) : (
          <text stroke="none" fontSize="5.5" fontWeight="700" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="1.6" opacity="0.85">
            <textPath href={`#arcBot-${uid}`} startOffset="50%" textAnchor="middle">{subtitle}</textPath>
          </text>
        )}
      </g>
    </svg>
  );
}
