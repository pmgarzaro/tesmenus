// Calendar dates as "YYYY-MM-DD" strings (no time zone surprises).

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Paris";

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

/** Today in the household's time zone. */
export function today(timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (date: string) =>
  new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "lundi" */
export const weekdayName = fmt({ weekday: "long" });
/** "lun. 6 oct." */
export const shortDate = fmt({ weekday: "short", day: "numeric", month: "short" });
/** "6 octobre" */
export const longDate = fmt({ day: "numeric", month: "long" });

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && addDays(s, 0) === s;
}

/** Default start of a new plan: next Monday from Friday on, otherwise today. */
export function defaultStartDate(from = today()): string {
  const dow = new Date(`${from}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  if (dow === 5) return addDays(from, 3);
  if (dow === 6) return addDays(from, 2);
  if (dow === 0) return addDays(from, 1);
  return from;
}
