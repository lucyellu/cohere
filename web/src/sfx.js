import { bind, play, setEnabled } from 'cuelume';

// App-wide interaction sounds (cuelume — synthesized live, no audio files).
// Elements can pick a specific sound with data-cuelume-* attributes; anything
// interactive without one gets a sensible default from the delegated handler
// below. The preference persists; default is ON.

const KEY = 'cohear_sfx_enabled';

export function sfxEnabled() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setSfxEnabled(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch { /* private mode — the toggle still works for this session */ }
  setEnabled(on);
  if (on) play('chime'); // audible confirmation that sound is back
}

let inited = false;
export function initSfx() {
  if (inited) return;
  inited = true;
  bind(); // wires every data-cuelume-* attribute, present and future
  setEnabled(sfxEnabled());

  // Default click feedback for everything interactive. Elements that declare
  // their own cuelume sound are skipped so nothing fires twice.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const el = target?.closest('button, a, select, [role="button"], input[type="checkbox"], input[type="radio"]');
      if (!el || el.closest('[data-cuelume-press], [data-cuelume-release], [data-cuelume-toggle]')) return;
      if (el.matches('select, input[type="checkbox"], input[type="radio"]')) play('toggle');
      else if (el.matches('a')) play('tick');
      else play('release');
    },
    { capture: true },
  );
}

export { play };
