/**
 * Date helpers for attendance and checkouts.
 *
 * These deliberately avoid `toISOString()`, which converts to UTC first. In any
 * timezone ahead of UTC, `new Date().toISOString().slice(0, 10)` returns
 * *yesterday* for the first hours after midnight — so a register marked at
 * 00:30 would be filed against the wrong school day. Attendance is a record
 * schools rely on, so it has to follow the local calendar, not UTC.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** Format a Date as `YYYY-MM-DD` using its *local* calendar fields. */
export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today, local. */
export function today(): string {
  return toLocalDate(new Date());
}

/** Current wall-clock time as `HH:MM`. */
export function nowTime(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isWeekend(isoDate: string): boolean {
  const day = parseLocalDate(isoDate).getDay();
  return day === 0 || day === 6;
}

/**
 * Parse `YYYY-MM-DD` into a local-midnight Date.
 *
 * `new Date('2026-07-20')` is parsed as UTC midnight by spec, which lands on
 * the previous day for negative offsets. Passing the parts explicitly keeps it
 * local.
 */
export function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Today, or the most recent weekday if today falls on a weekend. */
export function lastWeekday(): string {
  const date = new Date();
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return toLocalDate(date);
}

/** e.g. "Monday, 20 July 2026" — for confirming which day is being marked. */
export function describeDate(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
