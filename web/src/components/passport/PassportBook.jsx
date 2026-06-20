import { hashString } from './palette.js';

// The passport "data page" — identity + stats + a machine-readable zone, ported
// from the Tailwind passport pen. Name is editable; everything else is derived.
export default function PassportBook({ profile, onName, identitySeed, memberSince, stats }) {
  const name = (profile.name || '').trim();
  const display = name || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);
  const initials = display.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tint = hashString(`${seed}:tint`) % 360;

  return (
    <div className="cohear-passport-page overflow-hidden p-5">
      <div className="flex items-center justify-between gap-2 border-b border-black/15 pb-3">
        <span className="text-[11px] font-black uppercase tracking-[0.3em]">Passport</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">Cohear · Citizen of Live Music</span>
        <span className="text-lg">🛂</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        {/* Photo / monogram */}
        <div className="space-y-2">
          <div
            className="grid h-[120px] w-[108px] place-items-center rounded text-3xl font-black text-white/90"
            style={{ background: `linear-gradient(150deg, hsl(${tint} 45% 42%), hsl(${(tint + 40) % 360} 40% 28%))` }}
          >
            {initials || '☻'}
          </div>
          <div className="font-mono text-[10px] leading-tight opacity-70">
            <div>No. {passportNo}</div>
            <div>Since {memberSince || '—'}</div>
          </div>
        </div>

        {/* Identity fields */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name" wide>
            <input
              className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-base font-bold outline-none placeholder:text-black/30 focus:border-black/60"
              value={profile.name || ''}
              onChange={(e) => onName(e.target.value)}
              placeholder="Add your name"
              maxLength={28}
            />
          </Field>
          <Field label="Type"><span className="font-mono text-base font-bold">P</span></Field>
          <Field label="Authority"><span className="font-mono text-base font-bold">COHEAR</span></Field>
          <Stat label="Countries" value={stats.countries} />
          <Stat label="Cities" value={stats.cities} />
          <Stat label="Entries" value={stats.visits} />
          <Stat label="Artists" value={stats.artists} />
          <Stat label="Tickets" value={stats.stubs} />
        </div>
      </div>

      {/* Machine-readable zone */}
      <div className="mt-4 overflow-hidden border-t border-black/15 pt-2">
        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-tight tracking-[0.04em] opacity-80">{mrz(display, passportNo, stats)}</pre>
      </div>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-60">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-60">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function mrz(name, passportNo, stats) {
  const surname = name.split(/\s+/).slice(-1)[0] || 'TRAVELLER';
  const given = name.split(/\s+/).slice(0, -1).join('<') || name.replace(/\s+/g, '<');
  const pad = (s, n) => (s.toUpperCase().replace(/[^A-Z<]/g, '<') + '<'.repeat(n)).slice(0, n);
  const line1 = `P<COH${pad(surname, 10)}<<${pad(given, 26)}`.slice(0, 44).padEnd(44, '<');
  const code = `${passportNo}<COH<${stats.countries}C${stats.cities}T${stats.visits}E${stats.stubs}S`;
  const line2 = pad(code.replace(/[^A-Z0-9<]/g, '<'), 44);
  return `${line1}\n${line2}`;
}
