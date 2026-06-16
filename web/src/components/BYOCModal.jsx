import { useState } from 'react';
import { extractPin } from '../api.js';

const KEY_STORAGE = 'reverb_byoc_gemini';
const SEED_IMG = 'reverb_seed_image';
const SEED_TXT = 'reverb_seed_text';
const SEED_SRC = 'reverb_seed_src';
const IMG_PROVIDER = 'reverb_img_provider';

const PROVIDERS = [
  { id: 'auto', label: 'Auto', hint: 'Gemini if a key is set, otherwise free FLUX.' },
  { id: 'pollinations', label: 'Pollinations', hint: 'Free, keyless FLUX. No setup — works right now.' },
  { id: 'huggingface', label: 'HF FLUX', hint: 'FLUX.1-schnell — needs HF_TOKEN on the gateway.' },
];

export function getByocKey() {
  return localStorage.getItem(KEY_STORAGE) || '';
}
export function getSeedImage() {
  return localStorage.getItem(SEED_IMG) || '';
}

export default function BYOCModal({ open, onClose, onSaved }) {
  const [value, setValue] = useState(getByocKey());
  const [provider, setProvider] = useState(localStorage.getItem(IMG_PROVIDER) || 'auto');
  const [seedUrl, setSeedUrl] = useState(localStorage.getItem(SEED_SRC) || '');
  const [seedImg, setSeedImg] = useState(getSeedImage());
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedErr, setSeedErr] = useState('');
  if (!open) return null;

  function save() {
    const v = value.trim();
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
    localStorage.setItem(IMG_PROVIDER, provider);
    onSaved?.(v);
    onClose();
  }

  function pickProvider(id) {
    setProvider(id);
    localStorage.setItem(IMG_PROVIDER, id); // persist immediately, even without Save
  }

  function clearKey() {
    localStorage.removeItem(KEY_STORAGE);
    setValue('');
    onSaved?.('');
  }

  async function loadSeed() {
    const url = seedUrl.trim();
    setSeedErr('');
    if (!url) return;
    setSeedBusy(true);
    const res = await extractPin(url).catch(() => null);
    setSeedBusy(false);
    if (!res?.ok || !res.image) {
      setSeedErr(res?.error || 'Could not read an image from that URL.');
      return;
    }
    localStorage.setItem(SEED_IMG, res.image);
    localStorage.setItem(SEED_TXT, res.text || '');
    localStorage.setItem(SEED_SRC, url);
    setSeedImg(res.image);
  }

  function clearSeed() {
    [SEED_IMG, SEED_TXT, SEED_SRC].forEach((k) => localStorage.removeItem(k));
    setSeedImg('');
    setSeedUrl('');
    setSeedErr('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h3 className="text-base font-semibold text-zinc-100">Bring Your Own Compute</h3>
        </div>

        {/* Image model picker */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-zinc-100">Image model</h4>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => pickProvider(p.id)}
                className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                  provider === p.id
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            {PROVIDERS.find((p) => p.id === provider)?.hint}
          </p>
        </div>

        {/* Gemini key */}
        <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-sm text-zinc-400">
          Paste your own <span className="text-zinc-200">Google&nbsp;Gemini</span> key to power real AI scene synthesis
          for songs no one filmed.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
          />
          {value && (
            <button onClick={clearKey} className="shrink-0 rounded-lg px-2 text-xs text-zinc-500 hover:text-zinc-300">
              clear
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Stored only in this browser.{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
            Get a free key →
          </a>
        </p>
        </div>

        {/* Pinterest style seed */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <span>📌</span> Style seed <span className="text-xs font-normal text-zinc-500">(optional)</span>
          </h4>
          <p className="mt-1 text-xs text-zinc-500">
            Paste a Pinterest Pin/board or any image URL to ground the aesthetic. Its image &amp; description seed the
            generation (image-to-image).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
              placeholder="https://pinterest.com/pin/…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-fuchsia-400 focus:outline-none"
            />
            <button
              onClick={loadSeed}
              disabled={seedBusy}
              className="shrink-0 rounded-lg bg-fuchsia-500/20 px-3 py-2 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-500/30 disabled:opacity-50"
            >
              {seedBusy ? '…' : 'Load'}
            </button>
          </div>
          {seedErr && <p className="mt-1.5 text-[11px] text-red-300">{seedErr}</p>}
          {seedImg && (
            <div className="mt-3 flex items-center gap-3">
              <img src={seedImg} alt="style seed" className="h-16 w-16 rounded-lg object-cover" />
              <button onClick={clearSeed} className="text-[11px] text-zinc-500 hover:text-zinc-300">
                remove seed
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
            Cancel
          </button>
          <button onClick={save} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
