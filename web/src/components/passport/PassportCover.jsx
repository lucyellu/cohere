// The passport's front cover: black pebbled leather under a deep navy tint
// (layered, not blended — html2canvas can't do blend modes) with gold-foil
// type and a lyre-viol crest: a ring holding four strings, a scalloped
// tailpiece and two mirrored f-holes. Bottom carries the ICAO biometric chip
// symbol like a real e-passport.
//
// The whole face is ONE inline SVG (viewBox matches the 88×125 cover ratio):
// html2canvas rasterises SVG natively, so the type can never drift or clip in
// exports the way HTML text layout does.

const GOLD = '#d9a94e';
const GOLD_DIM = '#c79a3e';
const SERIF = 'Georgia, "Times New Roman", serif';

export default function PassportCover({ className = '' }) {
  return (
    <div className={`cohear-cover ${className}`}>
      <div className="cohear-cover__leather" aria-hidden="true" />
      <div className="cohear-cover__tint" aria-hidden="true" />
      <svg className="cohear-cover__face" viewBox="0 0 352 500" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cohere passport cover">
        <Emboss x={176} y={66} size={27} tracking={11} font={SERIF} weight={700}>PASSPORT</Emboss>

        <g transform="translate(176 240) scale(0.62)">
          <LyreCrest />
        </g>

        <Emboss x={176} y={412} size={34} tracking={1} font={SERIF} weight={700} italic>Cohere</Emboss>
        <Emboss x={176} y={436} size={9} tracking={4.6} font='ui-sans-serif, system-ui, sans-serif' weight={700} opacity={0.82}>CITIZEN OF LIVE MUSIC</Emboss>

        {/* ICAO e-passport chip symbol */}
        <g transform="translate(176 468)" stroke={GOLD} strokeWidth="2.6" fill="none">
          <line x1="-26" y1="0" x2="-9" y2="0" />
          <line x1="9" y1="0" x2="26" y2="0" />
          <circle cx="0" cy="0" r="6.5" />
          <line x1="-26" y1="9" x2="26" y2="9" strokeWidth="2.2" />
        </g>
      </svg>
    </div>
  );
}

// Gold-foil lettering with a pressed shadow: a dark copy 1px below the gold.
function Emboss({ x, y, size, tracking, font, weight, italic, opacity = 1, children }) {
  const common = {
    textAnchor: 'middle', fontSize: size, fontFamily: font, fontWeight: weight,
    letterSpacing: tracking, fontStyle: italic ? 'italic' : undefined, opacity,
  };
  return (
    <>
      <text x={x} y={y + 1.4} {...common} fill="rgba(0,0,0,0.55)">{children}</text>
      <text x={x} y={y} {...common} fill={GOLD}>{children}</text>
    </>
  );
}

// Ring + strings + scalloped tailpiece + mirrored f-holes, gold monoline.
// Drawn in a -110..110 square, centered on the ring.
export function LyreCrest() {
  const fHole = (
    <g>
      {/* long S-body */}
      <path d="M -30 -34 C -47 -20 -49 8 -33 24" fill="none" />
      {/* curled ends */}
      <path d="M -30 -34 a 5.5 5.5 0 1 0 -8 4.4" fill="none" />
      <path d="M -33 24 a 5.5 5.5 0 1 0 8.6 -3.4" fill="none" />
      {/* nicks */}
      <line x1="-40.5" y1="-7" x2="-35.5" y2="-7" />
      <line x1="-41.5" y1="1" x2="-36.5" y2="1" />
    </g>
  );
  return (
    <g stroke={GOLD} strokeWidth="5" strokeLinecap="round" fill="none">
      {/* body ring */}
      <circle cx="0" cy="4" r="86" />
      {/* strings through the ring */}
      {[-10.5, -3.5, 3.5, 10.5].map((x) => (
        <line key={x} x1={x} y1="-78" x2={x} y2="86" strokeWidth="3.4" />
      ))}
      {/* tailpiece: block with three scallops bitten from its bottom edge */}
      <path d="M -24 -96 H 24 V -74 a 5.5 5.5 0 0 1 -11 0 a 6.5 6.5 0 0 1 -13 0 a 6.5 6.5 0 0 1 -13 0 a 5.5 5.5 0 0 1 -11 0 Z" strokeWidth="4.5" />
      {/* arch above */}
      <path d="M -14 -96 a 14 14 0 0 1 28 0" strokeWidth="5" />
      {fHole}
      <g transform="scale(-1,1)">{fHole}</g>
    </g>
  );
}
