// Usage analytics via PostHog. Fully optional — with no key set, every export
// here is a no-op so local dev and forks work without a PostHog project.
import posthog from 'posthog-js';
import { guestKey } from './account.js';

const KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let ready = false;

export function initAnalytics() {
  if (!KEY || ready) return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // single-page app — views tracked manually via trackView()
  });
  // Ties events to the same anonymous id the app already uses for the gateway
  // (account.js), so a guest's PostHog trail survives across sessions/devices
  // without collecting any real identity.
  posthog.identify(guestKey());
  ready = true;
}

// Call on every top-level view change (App.jsx's `view` state) since there's
// no URL-per-view routing to hook a pageview off of.
export function trackView(view, extra = {}) {
  if (!ready) return;
  posthog.capture('$pageview', { view, ...extra });
}

export function track(event, props = {}) {
  if (!ready) return;
  posthog.capture(event, props);
}
