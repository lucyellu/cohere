const DETECTED_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver';

export const SETTINGS_KEY = 'cohear_settings_v1';

export const DEFAULT_SETTINGS = {
  timezone: DETECTED_TIME_ZONE,
  currency: 'USD',
  themeAccent: '#2f86d6',
  // Flips the monochrome ramp's light/dark poles — the "paper" (light) skin.
  themeInverted: false,
  // How long an ended concert stays visible in Discover (hours). 0 = hide the
  // moment it ends; up to 8 = linger so you can still join to collect the stamp.
  endedGraceHours: 2,
  apiKeys: {
    ticketmaster: '',
    seatgeek: '',
    gemini: '',
    googleCse: '',
  },
  affiliateIds: {
    ticketmaster: '',
  },
  searchEngineIds: {
    googleCse: '',
  },
};

export const TIME_ZONES = withDetectedZone([
  { zone: 'America/Vancouver', city: 'Vancouver', label: 'Vancouver / Pacific' },
  { zone: 'America/Los_Angeles', city: 'Los Angeles', label: 'Los Angeles / Pacific' },
  { zone: 'America/Denver', city: 'Denver', label: 'Denver / Mountain' },
  { zone: 'America/Chicago', city: 'Chicago', label: 'Chicago / Central' },
  { zone: 'America/New_York', city: 'New York', label: 'New York / Eastern' },
  { zone: 'America/Toronto', city: 'Toronto', label: 'Toronto / Eastern' },
  { zone: 'Europe/London', city: 'London', label: 'London' },
  { zone: 'Europe/Paris', city: 'Paris', label: 'Paris' },
  { zone: 'Asia/Tokyo', city: 'Tokyo', label: 'Tokyo' },
  { zone: 'Australia/Sydney', city: 'Sydney', label: 'Sydney' },
]);

export const CURRENCIES = [
  { code: 'USD', label: 'USD - US dollar' },
  { code: 'CAD', label: 'CAD - Canadian dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British pound' },
  { code: 'AUD', label: 'AUD - Australian dollar' },
  { code: 'JPY', label: 'JPY - Japanese yen' },
];

// One-time migration: the original default accent was a terracotta orange. Flip
// anyone still sitting on that exact default over to the new blue default once,
// without disturbing a colour the user later picked on purpose.
const OLD_DEFAULT_ACCENT = '#e0662f';
const ACCENT_MIGRATION_KEY = 'cohere_accent_blue_v1';
function migrateDefaultAccent() {
  try {
    if (localStorage.getItem(ACCENT_MIGRATION_KEY)) return;
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && String(parsed.themeAccent).toLowerCase() === OLD_DEFAULT_ACCENT) {
      parsed.themeAccent = DEFAULT_SETTINGS.themeAccent;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    }
    localStorage.setItem(ACCENT_MIGRATION_KEY, '1');
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}
migrateDefaultAccent();

export function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return normalizeSettings(parsed);
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys },
      affiliateIds: { ...DEFAULT_SETTINGS.affiliateIds },
      searchEngineIds: { ...DEFAULT_SETTINGS.searchEngineIds },
    };
  }
}

export function writeSettings(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  if (normalized.apiKeys.gemini) {
    localStorage.setItem('reverb_byoc_gemini', normalized.apiKeys.gemini);
  } else {
    localStorage.removeItem('reverb_byoc_gemini');
  }
  return normalized;
}

export function readApiKey(id) {
  return readSettings().apiKeys?.[id] || '';
}

export function normalizeSettings(settings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    apiKeys: {
      ...DEFAULT_SETTINGS.apiKeys,
      ...(settings?.apiKeys || {}),
    },
    affiliateIds: {
      ...DEFAULT_SETTINGS.affiliateIds,
      ...(settings?.affiliateIds || {}),
    },
    searchEngineIds: {
      ...DEFAULT_SETTINGS.searchEngineIds,
      ...(settings?.searchEngineIds || {}),
    },
  };
  if (!TIME_ZONES.some((tz) => tz.zone === merged.timezone)) merged.timezone = DETECTED_TIME_ZONE;
  if (!CURRENCIES.some((c) => c.code === merged.currency)) merged.currency = 'USD';
  merged.endedGraceHours = clampHours(merged.endedGraceHours);
  if (!/^#[0-9a-f]{6}$/i.test(merged.themeAccent)) merged.themeAccent = DEFAULT_SETTINGS.themeAccent;
  merged.themeInverted = Boolean(merged.themeInverted);
  return merged;
}

// Grace window, in hours. Sub-hour options (0.25 = 15 min, 0.5 = 30 min) sit
// alongside the hourly steps up to 8 hours. Stored as hours so the legacy
// integer values (and the `× 3600_000` math) keep working unchanged.
export const ENDED_GRACE_OPTIONS = [0, 0.25, 0.5, 1, 2, 3, 4, 6, 8];
function clampHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  // Snap to the nearest offered option so saved values always map to a choice.
  return ENDED_GRACE_OPTIONS.reduce(
    (best, opt) => (Math.abs(opt - n) < Math.abs(best - n) ? opt : best),
    ENDED_GRACE_OPTIONS[0],
  );
}

function withDetectedZone(zones) {
  if (zones.some((z) => z.zone === DETECTED_TIME_ZONE)) return zones;
  return [{ zone: DETECTED_TIME_ZONE, city: 'Local', label: `Local (${DETECTED_TIME_ZONE})` }, ...zones];
}
