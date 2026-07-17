import { useId } from 'react';
import { hashString, postageHue, countryEmoji } from './palette.js';
import { paperPath, PlateText, Denomination, SERIF, placeSize } from './PostageStamp.jsx';

// Per-country visa as a landscape perforated postage stamp (same die-cut
// system as PostageStamp, wider format like real airmail issues): duotone
// guilloché-rosette face with the country name, visa class, entry terms and
// the visit count as the stamp's denomination. Generated art replaces the
// procedural face edge-to-edge with the type overlaid.

const W = 216;
const H = 156;
const MARGIN = 7;
const PAPER_D = paperPath(W, H);

export default function VisaStamp({ visa, entryCount = 1, art }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rule = visa.rule || {};
  const status = visaStatus(visa.expiresAt);
  const hue = postageHue(visa.id);
  const h = hashString(visa.id);

  const win = { x: MARGIN, y: MARGIN, w: W - MARGIN * 2, h: H - MARGIN * 2 - 15 };
  const captionY = H - MARGIN - 4.5;

  const deep = `hsl(${hue} 46% 28%)`;
  const mid = `hsl(${hue} 40% 48%)`;
  const light = `hsl(${hue} 55% 78%)`;
  const paleBg = `hsl(${hue} 34% 90%)`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="cohear-postage__svg"
      role="img"
      aria-label={`${visa.country} visa stamp`}
    >
      <title>{`${visa.country} — ${rule.label || 'Tourist Visa'}`}</title>
      <defs>
        <clipPath id={`vwin-${uid}`}><rect x={win.x} y={win.y} width={win.w} height={win.h} /></clipPath>
        <filter id={`vgrain-${uid}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={h % 89} />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.4 0.4 0.4 0 0" />
        </filter>
      </defs>

      <path d={PAPER_D} fill="#f7f2e4" fillRule="evenodd" />

      <g clipPath={`url(#vwin-${uid})`}>
        {art ? (
          <image href={art} x={win.x} y={win.y} width={win.w} height={win.h} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <ProceduralFace win={win} deep={deep} mid={mid} light={light} paleBg={paleBg} country={visa.country} seed={h} />
        )}

        {/* type overlays live on both faces so art stays "a visa, not a photo" */}
        <PlateText x={win.x + 10} y={win.y + 17} fontSize="9" fill={art ? '#2c2418' : deep} font={SERIF} tracking="3" halo={art ? '#f7f2e4' : paleBg}>
          VISA
        </PlateText>
        <PlateText x={win.x + win.w / 2} y={win.y + 30} anchor="middle" fontSize={placeSize(visa.country) + 3} fill={art ? '#2c2418' : deep} font={SERIF} halo={art ? '#f7f2e4' : paleBg}>
          {visa.country.toUpperCase()}
        </PlateText>
        {!art && (
          <>
            <text x={win.x + win.w / 2} y={win.y + 41} textAnchor="middle" fontSize="6.5" fontWeight="700" letterSpacing="1.6" fontFamily='ui-sans-serif, system-ui, sans-serif' fill={mid}>
              {(rule.label || 'TOURIST VISA').toUpperCase()}
            </text>
            <text x={win.x + win.w / 2} y={win.y + 51} textAnchor="middle" fontSize="5.6" fontWeight="700" letterSpacing="1.2" fontFamily='ui-monospace, "Courier New", monospace' fill={mid}>
              {rule.entries === 'multiple' ? 'MULTIPLE ENTRY' : 'SINGLE ENTRY'} · {entryCount} {entryCount === 1 ? 'VISIT' : 'VISITS'}
            </text>
          </>
        )}
        <Denomination x={win.x + win.w - 10} y={win.y + win.h - 9} value={entryCount} fill={art ? '#2c2418' : deep} halo={art ? '#f7f2e4' : paleBg} size={24} />

        {/* inspection imprint — the border officer's verdict */}
        <g transform={`rotate(-9 ${win.x + 30} ${win.y + win.h - 18})`}>
          <rect x={win.x + 9} y={win.y + win.h - 25} width={status.valid ? 40 : 50} height={13} fill="none" stroke={status.valid ? '#2e7d43' : '#b03434'} strokeWidth="1.4" opacity="0.75" />
          <text x={win.x + 9 + (status.valid ? 20 : 25)} y={win.y + win.h - 15.5} textAnchor="middle" fontSize="7.5" fontWeight="900" letterSpacing="1.5" fontFamily='ui-sans-serif, system-ui, sans-serif' fill={status.valid ? '#2e7d43' : '#b03434'} opacity="0.8">
            {status.valid ? 'VALID' : 'EXPIRED'}
          </text>
        </g>

        <rect x={win.x} y={win.y} width={win.w} height={win.h} filter={`url(#vgrain-${uid})`} opacity="0.13" />
      </g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="none" stroke="rgba(40,30,10,0.35)" strokeWidth="0.75" />

      {/* caption strip */}
      <text x={MARGIN + 1} y={captionY} fontSize="5.4" fontFamily='ui-monospace, "Courier New", monospace' fontWeight="700" letterSpacing="0.6" fill="#5d5340">
        VALID UNTIL {fmtDate(visa.expiresAt)}{status.valid && status.days != null ? ` · ${status.days}D LEFT` : ''}
      </text>
      <text x={W - MARGIN - 1} y={captionY} textAnchor="end" fontSize="4.6" fontFamily='ui-monospace, "Courier New", monospace' letterSpacing="0.4" fill="#8a7d61">
        {visa.serial}{visa.verified ? ` · #${visa.mintNo ?? '—'}` : ' · PENDING'}
      </text>
    </svg>
  );
}

// Guilloché rosette + engraved ring field, duotone like the postage faces.
function ProceduralFace({ win, deep, mid, light, paleBg, country, seed }) {
  const cx = win.x + win.w / 2;
  const r = 29;
  const cy = win.y + win.h - r - 10; // rosette sits low, under the type block
  return (
    <g>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill={paleBg} />
      {/* fine engraved line field, the security-print background */}
      {Array.from({ length: 26 }, (_, i) => (
        <line key={i} x1={win.x + 4} y1={win.y + 5 + i * 4.6} x2={win.x + win.w - 4} y2={win.y + 5 + i * 4.6} stroke={mid} strokeWidth="0.4" opacity="0.26" />
      ))}
      {/* rosette: concentric + dashed rings around the national seal */}
      <circle cx={cx} cy={cy} r={r + 5} fill={paleBg} stroke={mid} strokeWidth="1" opacity="0.95" />
      <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={deep} strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={mid} strokeWidth="0.9" strokeDasharray="2.4 1.6" />
      <circle cx={cx} cy={cy} r={r - 4.5} fill="none" stroke={deep} strokeWidth="0.7" strokeDasharray="0.8 1.4" />
      {/* petal ring */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r}
            x2={cx + Math.cos(a) * (r + 5)} y2={cy + Math.sin(a) * (r + 5)}
            stroke={mid} strokeWidth="0.8"
          />
        );
      })}
      <text x={cx} y={cy + 6.5} textAnchor="middle" fontSize="19">{countryEmoji(country)}</text>
      {/* corner ornaments */}
      {[[win.x + 12, win.y + win.h - 12], [win.x + win.w - 12, win.y + 14]].map(([x, y], i) => (
        <g key={i} fill={mid} opacity="0.8">
          <circle cx={x} cy={y - 4} r="1.4" /><circle cx={x} cy={y + 4} r="1.4" />
          <circle cx={x - 4} cy={y} r="1.4" /><circle cx={x + 4} cy={y} r="1.4" />
        </g>
      ))}
    </g>
  );
}

export function visaStatus(expiresAt) {
  const exp = new Date(expiresAt).getTime();
  if (!exp || Number.isNaN(exp)) return { valid: true, days: null };
  const valid = exp > Date.now();
  if (!valid) return { valid: false, days: null };
  const days = Math.ceil((exp - Date.now()) / 86400000);
  return { valid: true, days: days <= 30 ? days : null };
}

function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
