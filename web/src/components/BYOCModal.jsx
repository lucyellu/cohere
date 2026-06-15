import { useState } from 'react';

const STORAGE_KEY = 'reverb_byoc_gemini';

export function getByocKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export default function BYOCModal({ open, onClose, onSaved }) {
  const [value, setValue] = useState(getByocKey());
  if (!open) return null;

  function save() {
    const v = value.trim();
    if (v) localStorage.setItem(STORAGE_KEY, v);
    else localStorage.removeItem(STORAGE_KEY);
    onSaved?.(v);
    onClose();
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    setValue('');
    onSaved?.('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h3 className="text-base font-semibold text-zinc-100">Bring Your Own Compute</h3>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Paste your own <span className="text-zinc-200">Google&nbsp;Gemini</span> API key to power real AI scene
          synthesis for songs no one filmed. The more compute the crowd brings, the richer the archive.
        </p>

        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-zinc-600">
          Stored only in this browser (localStorage). Sent to the gateway per request to call Gemini on your behalf —
          never persisted server-side.{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline"
          >
            Get a free key →
          </a>
        </p>

        <div className="mt-5 flex justify-between gap-2">
          <button onClick={clear} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">
            Clear
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
              Cancel
            </button>
            <button onClick={save} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
