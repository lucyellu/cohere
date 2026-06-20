// Per-country visa, postage-stamp styled (perforated edge) with a real-world-ish
// validity window from the bundled VISA_RULES. CSS vignette by default; an
// on-demand FLUX illustration drops into `art`.
export default function VisaCard({ visa, entryCount = 1, art, onGenerate, generating }) {
  const rule = visa.rule || {};
  const accent = rule.accent || '#3b82f6';
  const status = visaStatus(visa.expiresAt);

  return (
    <article className="cohear-visa cohear-perf" style={{ '--accent': accent }} title={`${visa.country} — ${rule.label || 'Tourist Visa'}`}>
      <div className="cohear-visa__inner">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: accent }}>Visa</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">{rule.label || 'Tourist'}</span>
        </div>

        <div className="cohear-visa__vignette">
          {art ? <img src={art} alt="" /> : <span className="cohear-visa__seal">{countryEmoji(visa.country)}</span>}
          {onGenerate && (
            <button
              type="button"
              className="absolute right-1 top-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-black/65 disabled:opacity-60"
              onClick={onGenerate}
              disabled={generating}
              title="Generate AI art for this visa"
            >
              {generating ? '…' : art ? '✨ Redo' : '✨ Art'}
            </button>
          )}
        </div>

        <div>
          <div className="text-base font-black uppercase leading-none" style={{ color: '#2c2418' }}>{visa.country}</div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-75">
            <span>{rule.entries === 'multiple' ? 'Multiple entry' : 'Single entry'}</span>
            <span>· {entryCount} {entryCount === 1 ? 'visit' : 'visits'}</span>
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="text-[9px] font-mono leading-tight opacity-80">
            <div>Valid&nbsp;until</div>
            <div className="font-bold">{fmtDate(visa.expiresAt)}</div>
          </div>
          <span
            className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em]"
            style={status.valid
              ? { background: 'rgba(16,122,40,.16)', color: '#0a6b25' }
              : { background: 'rgba(180,40,40,.16)', color: '#9c2a2a' }}
          >
            {status.label}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-black/10 pt-1 text-[8px] font-mono tracking-[0.08em] opacity-70">
          <span>{visa.serial}</span>
          <span>{visa.verified ? `✓ #${visa.mintNo ?? '—'}` : '• pending'}</span>
        </div>
      </div>
    </article>
  );
}

function visaStatus(expiresAt) {
  const exp = new Date(expiresAt).getTime();
  if (!exp || Number.isNaN(exp)) return { valid: true, label: 'Valid' };
  const valid = exp > Date.now();
  if (!valid) return { valid: false, label: 'Expired' };
  const days = Math.ceil((exp - Date.now()) / 86400000);
  return { valid: true, label: days <= 30 ? `${days}d left` : 'Valid' };
}

function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

const COUNTRY_EMOJI = {
  Canada: '🍁', 'United States': '🗽', 'United Kingdom': '🎡', Ireland: '☘️',
  France: '🗼', Germany: '🍺', Spain: '💃', Italy: '🏛️', Netherlands: '🌷',
  Portugal: '⛵', Switzerland: '🏔️', Austria: '🎻', Japan: '🗾', 'South Korea': '🏯',
  Singapore: '🦁', Australia: '🦘', 'New Zealand': '🥝', Mexico: '🌮', Brazil: '🎉',
  India: '🛕', 'United Arab Emirates': '🕌',
};
function countryEmoji(country) {
  return COUNTRY_EMOJI[country] || '🛂';
}
