const DETECTED_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver';

export const SETTINGS_KEY = 'cohear_settings_v1';

export const DEFAULT_SETTINGS = {
  timezone: DETECTED_TIME_ZONE,
  currency: 'USD',
  themeAccent: '#e0662f',
  // How long an ended concert stays visible in Discover (hours). 0 = hide the
  // moment it ends; up to 8 = linger so you can still join to collect the stamp.
  endedGraceHours: 2,
  apiKeys: {
    ticketmaster: '',
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
  return merged;
}

export const ENDED_GRACE_OPTIONS = [0, 1, 2, 3, 4, 6, 8];
function clampHours(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 2;
  return Math.min(8, Math.max(0, n));
}

function withDetectedZone(zones) {
  if (zones.some((z) => z.zone === DETECTED_TIME_ZONE)) return zones;
  return [{ zone: DETECTED_TIME_ZONE, city: 'Local', label: `Local (${DETECTED_TIME_ZONE})` }, ...zones];
}
