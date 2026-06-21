import { zonedTimeToUtc, utcToZonedTime, formatISO } from "date-fns-tz";

// Note: we intentionally allow date-only inputs like 2026-02-23
// and interpret them as whole-day ranges in the active timezone.

export interface Range {
  from: Date;
  to: Date;
}

export function parseDateOrDateTime(input: string, tz: string): Date {
  // Very small, robust parser: if it looks like date-only (YYYY-MM-DD),
  // interpret as local midnight in tz.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(`${input}T00:00:00`);
    return zonedTimeToUtc(date, tz);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return d;
}

export function buildRangeFromTo(fromStr: string, toStr: string, tz: string): Range {
  const from = parseDateOrDateTime(fromStr, tz);
  let to = parseDateOrDateTime(toStr, tz);
  // If both are date-only, ensure to is end-of-day in tz
  if (/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    const z = utcToZonedTime(to, tz);
    z.setHours(23, 59, 59, 999);
    to = zonedTimeToUtc(z, tz);
  }
  return { from, to };
}

export function convertToTz(dateIso: string, targetTz: string): { iso: string; originalIso: string } {
  const original = new Date(dateIso);
  const zoned = utcToZonedTime(original, targetTz);
  return { iso: formatISO(zoned), originalIso: dateIso };
}
