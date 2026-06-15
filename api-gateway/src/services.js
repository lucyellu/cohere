// Central registry of every partner service. Drives routing, mock fallbacks,
// and what the monitor panel renders. `live: true` means a real proxy route
// is implemented; `live: false` services run on mock data only for now.

export const SERVICES = {
  musixmatch: {
    label: 'Musixmatch',
    category: 'data',
    envKey: 'MUSIXMATCH_API_KEY',
    live: true,
    description: 'Lyrics, track metadata, time-synced subtitles',
  },
  jambase: {
    label: 'JamBase',
    category: 'data',
    envKey: 'JAMBASE_API_KEY',
    live: true,
    // Default to mock: the curated mock tour includes setlists (which the live
    // JamBase Data API doesn't return) and gives the globe a clean world tour.
    // Still fully toggleable to live from the Control Room.
    preferMock: true,
    description: 'Tour dates, venues (lat/long), setlists',
  },
  youtube: {
    label: 'YouTube',
    category: 'media',
    envKey: 'YOUTUBE_API_KEY',
    live: true,
    description: 'Crowd-sourced concert videos',
  },
  songstats: {
    label: 'Songstats',
    category: 'data',
    envKey: 'SONGSTATS_API_KEY',
    live: true,
    description: 'Streaming & chart analytics',
  },
  pinterest: {
    label: 'Pinterest',
    category: 'media',
    keyless: true, // public Open Graph data — no API key/OAuth needed
    live: true,
    description: 'Style-seed images from public Pin/board URLs',
  },
  gemini: {
    label: 'Gemini (BYOC)',
    category: 'ai',
    envKey: 'GEMINI_API_KEY',
    live: true,
    // Default to placeholder scenes; flips live once the Generative Language
    // API is enabled and toggled, or when a viewer supplies their own key.
    preferMock: true,
    description: 'AI scene synthesis for missing footage',
  },
  cyanite: {
    label: 'Cyanite',
    category: 'ai',
    envKey: 'CYANITE_API_KEY',
    live: false,
    description: 'AI mood / energy / BPM tagging',
  },
  lalalai: {
    label: 'LALAL.AI',
    category: 'audio',
    envKey: 'LALALAI_API_KEY',
    live: false,
    description: 'Stem separation (vocals / instrumental)',
  },
  elevenlabs: {
    label: 'ElevenLabs',
    category: 'ai',
    envKey: 'ELEVENLABS_API_KEY',
    live: false,
    description: 'Voice generation / TTS',
  },
};

export const SERVICE_IDS = Object.keys(SERVICES);

export function hasKey(id) {
  const svc = SERVICES[id];
  if (!svc) return false;
  if (svc.keyless) return true; // no credentials required (e.g. public OG data)
  return Boolean(process.env[svc.envKey] && process.env[svc.envKey].trim());
}

// Per-service runtime override of mock/live mode (set from the monitor panel).
// null = follow the global USE_MOCK_DATA default.
const overrides = Object.fromEntries(SERVICE_IDS.map((id) => [id, null]));

export function setOverride(id, useMock) {
  if (id in overrides) overrides[id] = useMock;
}

// Effective mode for a service. A service with no key is ALWAYS forced to mock,
// regardless of toggles — you can't go live without credentials.
export function isMock(id) {
  if (!hasKey(id)) return true; // no credentials -> always mock
  if (overrides[id] !== null) return overrides[id]; // runtime toggle wins
  if (SERVICES[id].preferMock) return true; // service prefers mock by default
  return String(process.env.USE_MOCK_DATA).toLowerCase() !== 'false';
}

export function getOverride(id) {
  return overrides[id];
}
