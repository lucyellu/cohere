import { ticketPalette, ticketTypography, barcodeBars, hashString } from './palette.js';

// Vintage admit-one ticket, ported from the css-grid-train-ticket pen: a grid
// body + a perforated tear-off stub. Paper color is deterministic per artist,
// and so is the print shop's typography — no two artists' tickets read alike
// (see the Rolling Stones vs Fleetwood Mac stubs in ticketstubs (2).jpg).
//
// Two views per ticket: the standard letterpress card, and an "art" view where
// generated poster art becomes the ticket's printed background (not a pasted
// image) with the header/counterfoil structure kept. `showArt` toggles them;
// regenerating is a separate action.
export default function TicketStub({ stub, art, showArt, onToggleArt, onGenerate, generating, onOpen }) {
  const seat = stub.seat || {};
  const pal = ticketPalette(stub.artist || stub.id);
  const typo = ticketTypography(stub.artist || stub.id);
  const artOn = Boolean(art && showArt);
  const style = {
    '--paper': pal.paper,
    '--ink': pal.ink,
    '--accent': pal.accent,
    '--head-font': typo.head,
    '--head-weight': typo.headWeight,
    '--head-tracking': typo.headTracking,
    '--head-size': typo.headSize,
    ...(artOn ? { '--art': `url(${art})` } : null),
  };
  const mint = String(stub.mintNo ?? stub.edition ?? 1).padStart(4, '0');
  const place = [stub.city, stub.country].filter(Boolean).join(', ');
  const clickable = Boolean(onOpen && stub.city);

  return (
    <article
      className={`cohear-stub ${artOn ? 'cohear-stub--art' : ''} ${clickable ? 'cohear-stub--link' : ''}`}
      style={style}
      onClick={clickable ? () => onOpen(stub.city, stub.country) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onOpen(stub.city, stub.country); } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `${place} — view city` : undefined}
    >
      <div className="cohear-stub__main">
        <header className="cohear-stub__head">
          <span className="cohear-stub__artist">{stub.artist || 'Live Concert'}</span>
          <span className="flex items-center gap-1.5">
            <ArtControls art={art} showArt={showArt} onToggleArt={onToggleArt} onGenerate={onGenerate} generating={generating} />
            <span className="cohear-stub__admit">Admit One</span>
          </span>
        </header>

        <div className="cohear-stub__grid">
          <Field label="Venue" value={stub.venue || '—'} span={2} />
          <Field label="Date" value={stub.date || 'TBA'} />
          <Field label="City" value={place || '—'} span={2} />
          <Field label="Sec" value={seat.section || 'GA'} />
          <Field label="Row" value={seat.row || '—'} />
          <Field label="Seat" value={seat.seat ?? '—'} />
          <Field label="Gate" value={seat.gate ?? '—'} />
        </div>

        <Barcode seed={stub.serial || stub.id} />
        <div className="flex items-center justify-between">
          <span className="cohear-stub__serial">{stub.serial}</span>
          <VerifyChip verified={stub.verified} />
        </div>
      </div>

      <div className="cohear-stub__side">
        <span className="cohear-stub__side-artist">{stub.artist || 'Concert'}</span>
        <AdmitRosette seed={stub.artist || stub.id} />
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.14em] opacity-70">No.</div>
          <div className="cohear-stub__serial">#{mint}</div>
        </div>
      </div>
    </article>
  );
}

// ✨ generates on first use; once art exists the primary click flips between
// the standard and art views, and the small ↻ re-rolls the artwork.
function ArtControls({ art, showArt, onToggleArt, onGenerate, generating }) {
  if (!onGenerate) return null;
  const btn = 'whitespace-nowrap rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white/30 disabled:opacity-60';
  if (!art) {
    return (
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--paper)' }}
        onClick={(e) => { e.stopPropagation(); onGenerate(); }}
        disabled={generating}
        title="Generate poster art for this ticket"
      >
        {generating ? '…' : '✨ Art'}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--paper)' }}
        onClick={(e) => { e.stopPropagation(); onToggleArt?.(); }}
        title={showArt ? 'Show the standard ticket' : 'Show the art ticket'}
      >
        {showArt ? 'Plain' : '✨ Art'}
      </button>
      <button
        type="button"
        className={btn}
        style={{ color: 'var(--paper)' }}
        onClick={(e) => { e.stopPropagation(); onGenerate(); }}
        disabled={generating}
        title="Regenerate the art"
      >
        {generating ? '…' : '↻'}
      </button>
    </>
  );
}

function Field({ label, value, span = 1 }) {
  return (
    <div className="cohear-stub__f" style={span > 1 ? { gridColumn: `span ${span}` } : undefined}>
      <label>{label}</label>
      <b title={String(value)}>{value}</b>
    </div>
  );
}

// Scan-real barcode: deterministic varied bar widths from the serial.
function Barcode({ seed }) {
  const bars = barcodeBars(seed);
  let x = 0;
  const rects = bars.map(({ w, gap }, i) => {
    const r = <rect key={i} x={x} y={0} width={w} height={12} />;
    x += w + gap;
    return r;
  });
  return (
    <svg className="cohear-stub__barcode" viewBox={`0 0 ${x} 12`} preserveAspectRatio="none" aria-hidden="true">
      {rects}
    </svg>
  );
}

// The ADMIT ONE rosette — a scalloped seal punched onto the counterfoil.
function AdmitRosette({ seed }) {
  const spin = (hashString(`${seed}:rosette`) % 24) - 12;
  return (
    <div className="cohear-stub__rosette" style={{ transform: `rotate(${spin}deg)` }} aria-hidden="true">
      <span>Admit<br />One</span>
    </div>
  );
}

function VerifyChip({ verified }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em]"
      style={
        verified
          ? { background: 'rgba(16,122,40,.16)', color: '#0a6b25' }
          : { background: 'rgba(0,0,0,.08)', color: 'rgba(0,0,0,.5)' }
      }
      title={verified ? 'Signed & registered' : 'Awaiting signature'}
    >
      {verified ? '✓ Verified' : '• Pending'}
    </span>
  );
}
