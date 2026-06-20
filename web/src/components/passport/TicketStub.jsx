import { ticketPalette } from './palette.js';

// Vintage admit-one ticket, ported from the css-grid-train-ticket pen: a grid
// body + a perforated tear-off stub. Paper color is deterministic per artist.
export default function TicketStub({ stub, art, onGenerate, generating, onOpen }) {
  const seat = stub.seat || {};
  const pal = ticketPalette(stub.artist || stub.id);
  const style = { '--paper': pal.paper, '--ink': pal.ink, '--accent': pal.accent };
  const mint = String(stub.mintNo ?? stub.edition ?? 1).padStart(4, '0');
  const place = [stub.city, stub.country].filter(Boolean).join(', ');
  const clickable = Boolean(onOpen && stub.city);

  return (
    <article
      className={`cohear-stub ${clickable ? 'cohear-stub--link' : ''}`}
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
            {onGenerate && (
              <button
                type="button"
                className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white/30 disabled:opacity-60"
                style={{ color: 'var(--paper)' }}
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                disabled={generating}
                title="Generate AI poster art for this ticket"
              >
                {generating ? '…' : art ? '✨ Redo' : '✨ Art'}
              </button>
            )}
            <span className="cohear-stub__admit">Admit One</span>
          </span>
        </header>

        {art && (
          <img src={art} alt="" className="w-full rounded" style={{ height: 86, objectFit: 'cover' }} />
        )}

        <div className="cohear-stub__grid">
          <Field label="Venue" value={stub.venue || '—'} span={2} />
          <Field label="Date" value={stub.date || 'TBA'} />
          <Field label="City" value={place || '—'} span={2} />
          <Field label="Sec" value={seat.section || 'GA'} />
          <Field label="Row" value={seat.row || '—'} />
          <Field label="Seat" value={seat.seat ?? '—'} />
          <Field label="Gate" value={seat.gate ?? '—'} />
        </div>

        <div className="cohear-stub__barcode" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <span className="cohear-stub__serial">{stub.serial}</span>
          <VerifyChip verified={stub.verified} />
        </div>
      </div>

      <div className="cohear-stub__side">
        <span className="cohear-stub__side-artist">{stub.artist || 'Concert'}</span>
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.14em] opacity-70">No.</div>
          <div className="cohear-stub__serial">#{mint}</div>
        </div>
      </div>
    </article>
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
