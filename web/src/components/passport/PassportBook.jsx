import { useRef, useState } from 'react';
import { hashString } from './palette.js';
import { fileToAvatar, generateAvatar } from './avatar.js';

// The passport as a real booklet: a navy gold-foil hardcover that flips open on
// click to reveal the inside data page (photo + identity + machine-readable
// zone). Name + home city are editable; everything else is derived.
export default function PassportBook({
  profile,
  onName,
  onAvatar,
  onHome,
  identitySeed,
  memberSince,
  stats,
  travel,
  home,
}) {
  const name = (profile.name || '').trim();
  const display = name || 'Guest Traveller';
  const seed = identitySeed || name || 'cohear-guest';
  const passportNo = 'CO' + String(hashString(seed) % 9000000 + 1000000);
  const initials = display.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tint = hashString(`${seed}:tint`) % 360;
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const homeLocated = Boolean(home && home.lat != null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy('upload');
    try {
      onAvatar?.(await fileToAvatar(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function onGenerate() {
    setError('');
    setBusy('generate');
    try {
      onAvatar?.(await generateAvatar(name));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className={`cohear-book ${open ? 'is-open' : ''}`}>
      {/* Inside data page (revealed when the cover swings open) */}
      <div className="cohear-book__page cohear-passport-page" aria-hidden={!open}>
        <div className="flex items-center justify-between gap-2 border-b border-black/15 pb-2">
          <span className="text-[11px] font-black uppercase tracking-[0.3em]">Passport</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">Cohere · Citizen of Live Music</span>
          <button
            type="button"
            className="rounded border border-black/25 bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide hover:bg-black/[0.1]"
            onClick={() => setOpen(false)}
            title="Close passport"
          >
            ✕ Close
          </button>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-[108px_minmax(0,1fr)]">
          {/* Photo / monogram */}
          <div className="space-y-2">
            <div
              className="cohear-book__photo relative grid h-[124px] w-[104px] place-items-center overflow-hidden text-3xl font-black text-white/90"
              style={profile.avatar ? undefined : { background: `linear-gradient(150deg, hsl(${tint} 45% 42%), hsl(${(tint + 40) % 360} 40% 28%))` }}
            >
              {profile.avatar ? (
                <img src={profile.avatar} alt="Passport photo" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span>{initials || '☻'}</span>
              )}
              {busy && (
                <div className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-semibold uppercase tracking-wider text-white">
                  {busy === 'generate' ? 'Generating…' : 'Loading…'}
                </div>
              )}
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                className="rounded border border-black/25 bg-black/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-black/[0.08] disabled:opacity-50"
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(busy)}
                title="Upload a photo"
              >
                Upload
              </button>
              <button
                type="button"
                className="rounded border border-black/25 bg-black/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-black/[0.08] disabled:opacity-50"
                onClick={onGenerate}
                disabled={Boolean(busy)}
                title="Generate an AI passport photo"
              >
                ✨ Generate
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
            {profile.avatar && (
              <button type="button" className="text-[10px] underline opacity-60 hover:opacity-100" onClick={() => onAvatar?.('')} disabled={Boolean(busy)}>
                Remove photo
              </button>
            )}
            {error && <p className="text-[10px] leading-tight text-red-700">{error}</p>}

            <div className="font-mono text-[10px] leading-tight opacity-70">
              <div>No. {passportNo}</div>
              <div>Since {memberSince || '—'}</div>
            </div>
          </div>

          {/* Identity fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 content-start">
            <Field label="Name" wide>
              <input
                className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-base font-bold outline-none placeholder:text-black/30 focus:border-black/60"
                value={profile.name || ''}
                onChange={(e) => onName(e.target.value)}
                placeholder="Add your name"
                maxLength={28}
              />
            </Field>
            <Field label="Place of issue" wide>
              <input
                className="w-full border-b border-dashed border-black/30 bg-transparent font-mono text-sm font-bold outline-none placeholder:text-black/30 focus:border-black/60"
                value={profile.homeCity || ''}
                onChange={(e) => onHome?.(e.target.value)}
                placeholder="Your home city"
                maxLength={32}
              />
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-60">
                {profile.homeCity
                  ? homeLocated
                    ? '✓ Located — used as your travel origin'
                    : '• Unrecognised city — add a major city to map it'
                  : 'Sets where your journeys depart from'}
              </div>
            </Field>
            <Field label="Type"><span className="font-mono text-base font-bold">P</span></Field>
            <Field label="Authority"><span className="font-mono text-base font-bold">COHERE</span></Field>
          </div>
        </div>

        {/* Distance travelled — the headline souvenir number */}
        <div className="cohear-book__miles">
          <span className="cohear-book__globe" aria-hidden="true">🌍</span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-70">Distance travelled</div>
            <div className="font-mono text-2xl font-black leading-none tabular-nums">
              {fmtNum(Math.round(travel?.miles || 0))} <span className="text-sm font-bold">mi</span>
            </div>
            <div className="font-mono text-[11px] font-semibold opacity-70">{fmtNum(Math.round(travel?.km || 0))} km · {travel?.stops || 0} stops</div>
          </div>
          {!homeLocated && (travel?.stops || 0) > 0 && (
            <span className="ml-auto max-w-[120px] text-right text-[9px] leading-tight opacity-60">Set a home city to count the trip out &amp; back</span>
          )}
        </div>

        {/* Stat chips */}
        <div className="mt-3 grid grid-cols-5 gap-2">
          <Stat label="Countries" value={stats.countries} />
          <Stat label="Cities" value={stats.cities} />
          <Stat label="Entries" value={stats.visits} />
          <Stat label="Artists" value={stats.artists} />
          <Stat label="Tickets" value={stats.stubs} />
        </div>

        {/* Machine-readable zone */}
        <div className="mt-3 overflow-hidden border-t border-black/15 pt-2">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-tight tracking-[0.04em] opacity-80">{mrz(display, passportNo, stats)}</pre>
        </div>
      </div>

      {/* Navy gold-foil hardcover — click to open/close */}
      <button
        type="button"
        className="cohear-book__cover"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        aria-label={open ? 'Close passport' : 'Open passport'}
        title={open ? 'Close passport' : 'Open passport'}
      >
        <span className="cohear-book__cover-face">
          <span className="cohear-book__emblem" aria-hidden="true">✦</span>
          <span className="cohear-book__cover-title">Cohere</span>
          <span className="cohear-book__cover-sub">Passport</span>
          <span className="cohear-book__crest" aria-hidden="true">🛂</span>
          <span className="cohear-book__cover-foot">Citizen of Live Music</span>
          <span className="cohear-book__hint">Tap to open</span>
        </span>
        {/* the inner back of the cover (visible while open) */}
        <span className="cohear-book__cover-back" aria-hidden="true">
          <span className="cohear-book__cover-back-note">This passport remains the property of Cohere.<br />Found stamps should be returned to their city.</span>
        </span>
      </button>
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
    <div className="rounded border border-black/10 bg-black/[0.03] px-1.5 py-1 text-center">
      <div className="font-mono text-lg font-black leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] opacity-55">{label}</div>
    </div>
  );
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
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
