/** Pure task helpers: recurrence and the inline title syntax. Dates are YYYY-MM-DD (UTC math). */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const x = d(s);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
};

export const REPEATS = ['Daily', 'Weekdays', 'Weekly', 'Monthly', 'Yearly'] as const;

/**
 * Next occurrence after `from` for a repeat rule. Monthly/yearly keep the day of
 * month of `anchor` (clamped to the month's length, e.g. 31 Jan -> 28 Feb).
 */
export function nextOccurrence(from: string, repeat: string, anchor = from): string {
  switch (repeat) {
    case 'Daily':
      return addDays(from, 1);
    case 'Weekdays': {
      let n = addDays(from, 1);
      while ([0, 6].includes(d(n).getUTCDay())) n = addDays(n, 1);
      return n;
    }
    case 'Weekly':
      return addDays(from, 7);
    case 'Monthly':
    case 'Yearly': {
      const f = d(from);
      const day = d(anchor).getUTCDate();
      const y = f.getUTCFullYear() + (repeat === 'Yearly' ? 1 : 0);
      const m = f.getUTCMonth() + (repeat === 'Monthly' ? 1 : 0);
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return iso(new Date(Date.UTC(y, m, Math.min(day, last))));
    }
    default:
      return from;
  }
}

/**
 * Where a recurring task goes when ticked. "Schedule" keeps the rhythm (next slot after
 * the planned date, skipping slots already in the past); "Completion" counts from today.
 */
export function nextDateOnComplete(date: string | null, repeat: string, repeatFrom: string | null, today: string): string {
  if (repeatFrom === 'Completion' || !date) return nextOccurrence(today, repeat, date ?? today);
  let next = nextOccurrence(date, repeat, date);
  for (let i = 0; i < 1000 && next <= today; i++) next = nextOccurrence(next, repeat, date);
  return next;
}

const PRIORITY = { '!': 'Low', '!!': 'Medium', '!!!': 'High' } as const;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Inline syntax in a new task's title, like Capacities: "!" .. "!!!" for priority and a
 * date word (today, tomorrow, a weekday, "next week", YYYY-MM-DD). The tokens are removed
 * from the title. Unknown text is left alone.
 */
export function parseTaskTitle(raw: string, today: string): { title: string; priority?: string; date?: string } {
  let title = ` ${raw} `;
  let priority: string | undefined;
  let date: string | undefined;

  const p = title.match(/\s(!{1,3})(?=\s)/);
  if (p) {
    priority = PRIORITY[p[1] as keyof typeof PRIORITY];
    title = title.replace(p[0], ' ');
  }

  const words: [RegExp, () => string][] = [
    [/\s(\d{4}-\d{2}-\d{2})(?=\s)/i, () => ''],
    [/\snext week(?=\s)/i, () => {
      const dow = d(today).getUTCDay();
      return addDays(today, ((8 - dow) % 7) || 7);
    }],
    [/\stomorrow(?=\s)/i, () => addDays(today, 1)],
    [/\stoday(?=\s)/i, () => today],
    [new RegExp(`\\s(?:on\\s)?(${WEEKDAYS.join('|')})(?=\\s)`, 'i'), () => ''],
  ];
  for (const [re, fn] of words) {
    const m = title.match(re);
    if (!m) continue;
    if (/^\s\d{4}/.test(m[0])) {
      if (!Number.isNaN(Date.parse(m[1]))) date = m[1];
      else continue;
    } else if (WEEKDAYS.includes((m[1] ?? '').toLowerCase())) {
      const want = WEEKDAYS.indexOf(m[1].toLowerCase());
      const dow = d(today).getUTCDay();
      date = addDays(today, ((want - dow + 7) % 7) || 7);
    } else {
      date = fn();
    }
    title = title.replace(m[0], ' ');
    break;
  }
  return { title: title.replace(/\s+/g, ' ').trim() || raw.trim(), priority, date };
}

export const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
