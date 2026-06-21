// Loads the Google Maps JS API once (idempotent across components).
// Key comes from VITE_GOOGLE_MAPS_KEY (web/.env, gitignored; set in Netlify too).
// Restrict the key by HTTP referrer in the GCP console for production.

let promise = null;
let callbackId = 0;

// The key can come from a build-time env var (local dev / Netlify env) OR be
// supplied at runtime by the gateway via loadPublicConfig() — so the deployed
// frontend works without the key being committed to the repo or set in Netlify.
let runtimeKey = '';
export function setMapsKey(key) {
  if (key && typeof key === 'string') runtimeKey = key;
}
function mapsKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_KEY || runtimeKey || '';
}

// Fetch non-secret client config (the Maps key) from the gateway once at startup.
export async function loadPublicConfig() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('/api/config/public', { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    if (j?.googleMapsKey) setMapsKey(j.googleMapsKey);
  } catch {
    /* gateway unreachable — maps just fall back to the paper list */
  }
}

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (promise) return promise;

  const key = mapsKey();
  if (!key) return Promise.reject(new Error('missing Google Maps key'));

  promise = new Promise((resolve, reject) => {
    const callbackName = `__cohearGoogleMapsReady${++callbackId}`;
    const timeout = window.setTimeout(() => {
      delete window[callbackName];
      promise = null;
      reject(new Error('maps load timed out'));
    }, 12000);

    window[callbackName] = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      if (window.google?.maps) resolve(window.google.maps);
      else {
        promise = null;
        reject(new Error('maps failed to init'));
      }
    };

    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker&v=weekly&loading=async&callback=${callbackName}`;
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      promise = null;
      reject(new Error('maps script failed to load'));
    };
    document.head.appendChild(s);
  });
  return promise;
}

export function hasMapsKey() {
  return Boolean(mapsKey());
}
