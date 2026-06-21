// "Add to calendar" without any Google/third-party calendar API.
//
// We generate a standard .ics (iCalendar) file the browser downloads. Opening it
// adds the show to whatever calendar the user already uses (Google, Apple,
// Outlook) AND carries VALARM reminders, so the device fires the "coming up"
// alert natively — no API keys, no OAuth, works offline.
//
// We also keep a small local record of what's been added (cohear_calendar) so
// the month view can highlight it, and we best-effort schedule an in-app
// Notification while the tab is open as a bonus nudge.

const STORE_KEY = 'cohear_calendar';

export function readCalendar() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeCalendar(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

export function isCalendared(id) {
  return readCalendar().some((e) => e.id === id);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Date -> 20260701T200000Z (UTC, as iCalendar wants).
function toIcsUtc(ms) {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Fold/escape per RFC 5545.
function esc(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildIcs({ id, title, start, end, location, description, url }) {
  const stamp = toIcsUtc(Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cohere//Concert Passport//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id || stamp}@cohere`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end || start + 2.5 * 3600_000)}`,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : '',
    description ? `DESCRIPTION:${esc(description)}` : '',
    url ? `URL:${esc(url)}` : '',
    // Two reminders so it nudges the day before and an hour before doors.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)} — tomorrow`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)} — starts in 1 hour`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

function downloadIcs(filename, ics) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// Add a show: download the .ics, remember it locally, ask for notification
// permission (so the in-app nudge can fire), and schedule it if the tab stays
// open. Returns { ok } — toggles off (removes the local record) if already added.
export function addToCalendar(concert, startMs, endMs) {
  const list = readCalendar();
  const existing = list.findIndex((e) => e.id === concert.id);
  if (existing >= 0) {
    list.splice(existing, 1);
    writeCalendar(list);
    return { ok: true, added: false };
  }

  const title = `${concert.artist || 'Live concert'}${concert.venue ? ` · ${concert.venue}` : ''}`;
  const location = [concert.venue, concert.city, concert.region, concert.country].filter(Boolean).join(', ');
  const ics = buildIcs({
    id: concert.id,
    title,
    start: startMs,
    end: endMs,
    location,
    description: `Cohere — be in the crowd from anywhere. ${concert.artist || ''} at ${concert.venue || ''}.`.trim(),
  });
  const slug = (concert.artist || 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show';
  downloadIcs(`cohere-${slug}.ics`, ics);

  list.push({ id: concert.id, title, start: startMs });
  writeCalendar(list);

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(() => scheduleReminders());
  } else {
    scheduleReminders();
  }
  return { ok: true, added: true };
}

// Best-effort: while the tab is open, fire a Notification ~1h before each saved
// show (and at start). The .ics VALARMs are the durable reminder; this is a bonus.
let scheduled = new Set();
export function scheduleReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  for (const ev of readCalendar()) {
    for (const lead of [3600_000, 0]) {
      const at = ev.start - lead;
      const key = `${ev.id}:${lead}`;
      if (scheduled.has(key) || at <= now || at - now > 24 * 3600_000) continue;
      scheduled.add(key);
      setTimeout(() => {
        try {
          new Notification('Cohere — show coming up', {
            body: lead ? `${ev.title} starts in 1 hour` : `${ev.title} is starting now`,
          });
        } catch {
          /* ignore */
        }
      }, at - now);
    }
  }
}
