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
    // The globe picks mock vs live per request via ?source= (curated demo tour
    // vs real search), so no service-level preferMock here.
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
  setlistfm: {
    label: 'setlist.fm',
    category: 'data',
    envKey: 'SETLISTFM_API_KEY',
    live: true,
    description: 'Real setlists (what was actually played)',
  },
  spotify: {
    label: 'Spotify',
    category: 'data',
    // Client-Credentials flow needs BOTH id + secret; the SECRET is the gating
    // credential (id alone can't auth), so hasKey() tracks the secret.
    envKey: 'SPOTIFY_CLIENT_SECRET',
    live: true,
    description: 'Track/artist popularity, followers, album & artist art',
  },
  openmeteo: {
    label: 'Open-Meteo',
    category: 'data',
    keyless: true, // free, no API key — venue weather (live + historical)
    live: true,
    description: 'Venue weather at showtime (live + historical for replays)',
  },
  ticketmaster: {
    label: 'Ticketmaster',
    category: 'data',
    envKey: 'TICKETMASTER_API_KEY',
    live: true,
    description: 'Future-show ticket price ranges and buy-ticket links',
  },
  websearch: {
    label: 'Web ticket search',
    category: 'data',
    envKey: 'GOOGLE_CSE_API_KEY',
    requiredEnvKeys: ['GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_ID'],
    live: true,
    description: 'Search-result ticket price snippets when official pricing is missing',
  },
  suno: {
    label: 'Suno (6 accounts)',
    category: 'library',
    keyless: true, // credentials come from suno-dl/accounts.json, not an env key
    live: true,
    description: 'Unified music library across all 6 Suno accounts (live feed)',
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
  pollinations: {
    label: 'Pollinations',
    category: 'ai',
    keyless: true, // free FLUX image gen, no API key/OAuth needed
    live: true,
    description: 'Free keyless FLUX image generation',
  },
  huggingface: {
    label: 'HuggingFace (FLUX)',
    category: 'ai',
    envKey: 'HF_TOKEN',
    live: true,
    // FLUX.1-schnell via HF Inference. Stays mock/no-key until HF_TOKEN is set.
    description: 'FLUX.1-schnell image gen (HF Inference)',
  },
  cerebras: {
    label: 'Cerebras',
    category: 'ai',
    envKey: 'CEREBRAS_API_KEY',
    live: true,
    // Free-tier, OpenAI-compatible text generation (gpt-oss-120b, GLM 4.7).
    // Text only — no image generation. From the ai-free workbench.
    description: 'Free-tier text generation (lore, prompts, summaries)',
  },
  groq: {
    label: 'Groq',
    category: 'ai',
    envKey: 'GROQ_API_KEY',
    live: true,
    // Free-tier, OpenAI-compatible text generation (+ vision/OCR & whisper,
    // not wired here). Text only — no image generation. From the ai-free workbench.
    description: 'Free-tier text generation (lore, prompts, summaries)',
  },
  lalalai: {
    label: 'LALAL.AI',
    category: 'audio',
    envKey: 'LALALAI_API_KEY',
    live: true,
    // Stem separation (upload -> split -> poll). Scoped to rights-clear audio we
    // host (Suno library tracks) -> a karaoke/sing-along instrumental. Results
    // disk-cached so the metered minutes aren't re-spent on repeats.
    description: 'Stem separation (vocals / instrumental) — Suno tracks',
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
  if (svc.requiredEnvKeys) return svc.requiredEnvKeys.every((key) => Boolean(process.env[key]?.trim()));
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
