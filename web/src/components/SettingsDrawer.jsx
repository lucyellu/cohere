import { useEffect, useState } from 'react';
import ControlRoom from './ControlRoom.jsx';
import { CURRENCIES, TIME_ZONES, ENDED_GRACE_OPTIONS } from '../settings.js';
import { SEED_SWATCHES, monoShades, randomSeed } from '../theme.js';

const TABS = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'apis', label: 'API keys' },
  { id: 'dev', label: 'Dev status' },
];

const API_KEYS = [
  {
    id: 'ticketmaster',
    label: 'Ticketmaster Discovery',
    status: 'Wired',
    placeholder: 'Discovery API key',
    note: 'Used for selected-concert price ranges and buy-ticket links.',
  },
  {
    id: 'googleCse',
    label: 'Google Programmable Search',
    status: 'Wired',
    placeholder: 'Custom Search JSON API key',
    note: 'Optional fallback for web ticket-price estimates from top search result snippets.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    status: 'Wired',
    placeholder: 'Gemini API key',
    note: 'Used as your own image-generation key in the AI scene flow.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    status: 'Gateway only',
    placeholder: 'Coming later',
    note: 'The current YouTube flow uses the gateway key so quota stays centralized.',
    disabled: true,
  },
  {
    id: 'huggingface',
    label: 'HuggingFace',
    status: 'Planned',
    placeholder: 'Coming later',
    note: 'Per-user HF keys need server-side routing before this should be enabled.',
    disabled: true,
  },
];

export default function SettingsDrawer({ open, settings, onChange, onClose }) {
  const [tab, setTab] = useState('preferences');

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  function update(patch) {
    onChange((prev) => ({ ...prev, ...patch }));
  }

  function updateApiKey(id, value) {
    onChange((prev) => ({
      ...prev,
      apiKeys: {
        ...(prev.apiKeys || {}),
        [id]: value,
      },
    }));
  }

  function updateAffiliateId(id, value) {
    onChange((prev) => ({
      ...prev,
      affiliateIds: {
        ...(prev.affiliateIds || {}),
        [id]: value,
      },
    }));
  }

  function updateSearchEngineId(id, value) {
    onChange((prev) => ({
      ...prev,
      searchEngineIds: {
        ...(prev.searchEngineIds || {}),
        [id]: value,
      },
    }));
  }

  function resetLayout() {
    window.dispatchEvent(new Event('cohear:reset-layout'));
  }

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 cursor-default bg-black/62 backdrop-blur-sm" onClick={onClose} aria-label="Close settings" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-white/10 bg-[var(--paper-card)] shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="cohear-label">Settings</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Cohere controls</h2>
          </div>
          <button className="cohear-icon-button" onClick={onClose} aria-label="Close settings" title="Close settings">
            <CloseIcon />
          </button>
        </header>

        <div className="border-b border-white/10 px-5 py-3">
          <div className="cohear-tabs" role="tablist" aria-label="Settings sections">
            {TABS.map((item) => (
              <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} role="tab" aria-selected={tab === item.id}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === 'preferences' && (
            <div className="grid gap-5">
              <ThemeSection settings={settings} update={update} />

              <section className="cohear-settings-section">
                <div>
                  <h3 className="text-sm font-semibold text-white">Locale</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">Used for your concert times and preferred money display where a source does not supply its own currency.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-zinc-300">
                    Local timezone
                    <select className="cohear-select" value={settings.timezone} onChange={(e) => update({ timezone: e.target.value })}>
                      {TIME_ZONES.map((tz) => (
                        <option key={tz.zone} value={tz.zone}>{tz.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-zinc-300">
                    Preferred currency
                    <select className="cohear-select" value={settings.currency} onChange={(e) => update({ currency: e.target.value })}>
                      {CURRENCIES.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="cohear-settings-section">
                <div>
                  <h3 className="text-sm font-semibold text-white">Recently-ended concerts</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">
                    How long a show stays in Discover after it ends — long enough to still join and collect its passport stamp + ticket stub. Past shows always live in the Archive.
                  </p>
                </div>
                <label className="grid max-w-xs gap-2 text-sm font-medium text-zinc-300">
                  Keep ended shows visible for
                  <select
                    className="cohear-select"
                    value={settings.endedGraceHours ?? 2}
                    onChange={(e) => update({ endedGraceHours: Number(e.target.value) })}
                  >
                    {ENDED_GRACE_OPTIONS.map((h) => (
                      <option key={h} value={h}>{graceLabel(h)}</option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="cohear-settings-section">
                <div>
                  <h3 className="text-sm font-semibold text-white">Layout</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">Restore the Discover panels to the default list view and inspector width.</p>
                </div>
                <button className="cohear-secondary w-fit" onClick={resetLayout}>
                  Reset Discover layout
                </button>
              </section>
            </div>
          )}

          {tab === 'apis' && (
            <div className="grid gap-4">
              <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100/85">
                User keys are stored locally on this machine for now. The durable account version should encrypt them server-side after Supabase Auth lands.
              </div>
              {API_KEYS.map((key) => (
                <section key={key.id} className="cohear-settings-section">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{key.label}</h3>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${key.disabled ? 'bg-white/5 text-zinc-500' : 'bg-emerald-300/10 text-emerald-200'}`}>
                          {key.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-zinc-500">{key.note}</p>
                    </div>
                  </div>
                  <input
                    type="password"
                    className="cohear-input"
                    placeholder={key.placeholder}
                    value={settings.apiKeys?.[key.id] || ''}
                    onChange={(e) => updateApiKey(key.id, e.target.value)}
                    disabled={key.disabled}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {key.id === 'ticketmaster' && (
                    <input
                      className="cohear-input"
                      placeholder="Affiliate ID / CAMEFROM code"
                      value={settings.affiliateIds?.ticketmaster || ''}
                      onChange={(e) => updateAffiliateId('ticketmaster', e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                  )}
                  {key.id === 'googleCse' && (
                    <input
                      className="cohear-input"
                      placeholder="Search engine ID (cx)"
                      value={settings.searchEngineIds?.googleCse || ''}
                      onChange={(e) => updateSearchEngineId('googleCse', e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                  )}
                </section>
              ))}
            </div>
          )}

          {tab === 'dev' && <ControlRoom />}
        </div>
      </aside>
    </div>
  );
}

// TimeGrid-style palette controls: a seed colour drives a 12-shade monochrome
// ramp that paints the whole UI. Pick a preset, shuffle a random hue, scrub the
// shade strip, or use the native picker; the Dark/Light toggle flips the ramp.
function ThemeSection({ settings, update }) {
  const seed = settings.themeAccent || '#e0662f';
  const inverted = Boolean(settings.themeInverted);
  const shades = monoShades(seed, 12);
  const activeShade = nearestShadeIndex(shades, seed);

  return (
    <section className="cohear-settings-section">
      <div>
        <h3 className="text-sm font-semibold text-white">Theme</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          One seed colour drives the entire palette — the whole app is built from varying shades of it. Only concert start and end times stay green and red.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="cohear-label">Skin</span>
        <div className="cohear-tabs">
          <button className={!inverted ? 'active' : ''} onClick={() => update({ themeInverted: false })}>Dark</button>
          <button className={inverted ? 'active' : ''} onClick={() => update({ themeInverted: true })}>Light</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SEED_SWATCHES.map((p) => {
          const active = seed.toLowerCase() === p.hex.toLowerCase();
          return (
            <button
              key={p.hex}
              onClick={() => update({ themeAccent: p.hex })}
              title={p.label}
              aria-label={p.label}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${active ? 'scale-110 border-white' : 'border-transparent hover:border-white/50'}`}
              style={{ background: p.hex }}
            />
          );
        })}
        <button
          onClick={() => update({ themeAccent: randomSeed() })}
          title="Shuffle a random hue"
          aria-label="Shuffle theme colour"
          className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-zinc-400 transition hover:border-white/40 hover:text-white"
        >
          <ShuffleIcon />
        </button>
        <label className="grid h-8 w-8 cursor-pointer place-items-center" title="Pick a custom colour">
          <input
            type="color"
            value={seed}
            onChange={(e) => update({ themeAccent: e.target.value })}
            className="cohear-color-picker"
          />
        </label>
      </div>

      <div>
        <div className="cohear-label mb-2">Shade ramp</div>
        <div className="flex h-9 overflow-hidden rounded-lg border border-white/10">
          {shades.map((hex, i) => (
            <button
              key={hex + i}
              onClick={() => update({ themeAccent: hex })}
              title={hex}
              className={`h-full flex-1 transition-transform hover:scale-y-110 ${i === activeShade ? 'ring-2 ring-inset ring-white' : ''}`}
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function nearestShadeIndex(shades, seed) {
  const target = relLum(seed);
  let best = 0;
  let bestDelta = Infinity;
  shades.forEach((hex, i) => {
    const d = Math.abs(relLum(hex) - target);
    if (d < bestDelta) { bestDelta = d; best = i; }
  });
  return best;
}

function relLum(hex) {
  const c = String(hex).replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

function graceLabel(h) {
  if (h === 0) return 'Hide as soon as they end';
  if (h < 1) return `${Math.round(h * 60)} min after ending`;
  return `${h} hour${h === 1 ? '' : 's'} after ending${h === 2 ? ' (default)' : ''}`;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
