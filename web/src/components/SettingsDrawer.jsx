import { useEffect, useState } from 'react';
import ControlRoom from './ControlRoom.jsx';
import { CURRENCIES, TIME_ZONES, ENDED_GRACE_OPTIONS } from '../settings.js';

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
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-white/10 bg-[#090a0d] shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="cohear-label">Settings</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Cohear controls</h2>
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

function graceLabel(h) {
  if (h === 0) return 'Hide as soon as they end';
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
