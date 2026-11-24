const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDay = (s: string): boolean =>
  ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** "2026-11-16" -> "Monday 16 November 2026". Titles stay ISO; this is display only. */
export function dayLabel(iso: string): string {
  if (!isIsoDay(iso)) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));
}

/** Today's date (YYYY-MM-DD) in an IANA time zone. */
export function todayIn(timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2pm", "2:30 pm", "9.30", "14", "14:00" -> "HH:MM" (24h). Null when it isn't a time. */
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (ap && (h < 1 || h > 12)) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Time zone Cloudflare derives from the visitor's IP, when available. */
export const requestTimeZone = (request: Request): string | undefined =>
  (request as Request & { cf?: { timezone?: string } }).cf?.timezone;
