// Loads the Google Maps JS API once (idempotent across components).
// Key comes from VITE_GOOGLE_MAPS_KEY (web/.env, gitignored; set in Netlify too).
// Restrict the key by HTTP referrer in the GCP console for production.

let promise = null;
let callbackId = 0;

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (promise) return promise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!key) return Promise.reject(new Error('missing VITE_GOOGLE_MAPS_KEY'));

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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker&v=weekly&callback=${callbackName}`;
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
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY);
}
