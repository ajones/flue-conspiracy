#!/usr/bin/env bun

import { printJson, printErrorAndExit, ok } from "../lib/json";
import { getCalendarsByNames, type CalendarRow } from "../lib/db";
import { queryRange, queryLastMatching } from "../lib/db-events";
import { fuzzyScore } from "../lib/fuzzy";
import { readCachedIcs } from "../lib/http";
import { parseEvents, type IcsEvent } from "../lib/ics";
import { expandRecurringEvents } from "../lib/recurrence";

interface Args {
  mode?: "range" | "fuzzy-range" | "next" | "last";
  from?: string;
  to?: string;
  nextDays?: number;
  timeRange?: "today" | "tomorrow" | "this_week";
  query?: string;
  calendars: string[];
  limit?: number;
  allDay?: boolean;
  sort?: "start_asc" | "start_desc";
  tzConvert?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { calendars: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--range":
        out.mode = "range";
        break;
      case "--fuzzy-range":
        out.mode = "fuzzy-range";
        break;
      case "--next":
        out.mode = "next";
        break;
      case "--last":
        out.mode = "last";
        break;
      case "--from":
        out.from = argv[++i];
        break;
      case "--to":
        out.to = argv[++i];
        break;
      case "--next-days":
        out.nextDays = Number(argv[++i]);
        break;
      case "--time-range": {
        const val = argv[++i] as Args["timeRange"];
        out.timeRange = val;
        break;
      }
      case "--query":
        out.query = argv[++i];
        break;
      case "--calendar":
        out.calendars.push(argv[++i]);
        break;
      case "--limit":
        out.limit = Number(argv[++i]);
        break;
      case "--all-day":
        out.allDay = argv[++i] === "true";
        break;
      case "--sort":
        out.sort = argv[++i] as Args["sort"];
        break;
      case "--tz-convert":
        out.tzConvert = argv[++i];
        break;
      default:
        // ignore unknown flags for now
        break;
    }
  }
  return out;
}

function validateArgs(args: Args) {
  if (!args.mode) {
    printErrorAndExit("invalid_arguments", "One of --range, --fuzzy-range, --next, --last is required");
  }

  const mode = args.mode;

  if (mode === "range") {
    if (!args.from || !args.to) {
      printErrorAndExit("invalid_arguments", "--range requires both --from and --to", {
        missing: [!args.from ? "from" : null, !args.to ? "to" : null].filter(Boolean),
        mode,
      });
    }
  }

  if (mode === "fuzzy-range") {
    if (!args.from || !args.to || !args.query) {
      printErrorAndExit("invalid_arguments", "--fuzzy-range requires --from, --to, and --query", {
        missing: [!args.from ? "from" : null, !args.to ? "to" : null, !args.query ? "query" : null]
          .filter(Boolean),
        mode,
      });
    }
  }

  if (mode === "next") {
    if (!args.nextDays && !args.timeRange) {
      printErrorAndExit("invalid_arguments", "--next requires --next-days or --time-range", {
        mode,
      });
    }
    if (args.nextDays && args.timeRange) {
      printErrorAndExit("invalid_arguments", "Use either --next-days or --time-range, not both", {
        mode,
      });
    }
  }

  if (mode === "last") {
    if (!args.query) {
      printErrorAndExit("invalid_arguments", "--last requires --query", { mode });
    }
  }
}

interface EventRow {
  calendar_id: number;
  uid: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  dtstart: string;
  dtend: string | null;
  all_day: number | boolean;
}

function icsToEventRow(ev: IcsEvent, calendarId: number): EventRow {
  return {
    calendar_id: calendarId,
    uid: ev.uid,
    summary: ev.summary ?? null,
    description: ev.description ?? null,
    location: ev.location ?? null,
    dtstart: ev.dtstart,
    dtend: ev.dtend ?? null,
    all_day: ev.allDay ? 1 : 0,
  };
}

function loadFutureEventsFromCache(
  calendars: CalendarRow[],
  fromIso: string,
  toIso: string,
  allDay: boolean | null,
): EventRow[] {
  const fromDate = new Date(fromIso);
  const toDate = new Date(toIso);
  const out: EventRow[] = [];
  for (const cal of calendars) {
    const ics = readCachedIcs(cal.url_hash);
    if (!ics) continue;
    const events = parseEvents(ics);
    const expanded = expandRecurringEvents(events, fromDate, toDate);
    for (const ev of expanded) {
      if (allDay !== null && ev.allDay !== allDay) continue;
      out.push(icsToEventRow(ev, cal.id));
    }
  }
  return out;
}

function convertIsoToTzLocal(iso: string | null | undefined, tz?: string, allDay?: boolean): string | null {
  if (!iso) return null;
  // All-day events have no meaningful time component — return date only, no tz shift.
  if (allDay) return iso.slice(0, 10);
  if (!tz) return iso; // preserve original UTC when no conversion requested
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
    const year = parts.year;
    const month = parts.month;
    const day = parts.day;
    const hour = parts.hour;
    const minute = parts.minute;
    const second = parts.second;
    if (!year || !month || !day || !hour || !minute || !second) return iso;
    // Return a local-without-offset ISO-like string; consumer should treat as local time in tz.
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  } catch {
    return iso;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  args.tzConvert ??= "America/Los_Angeles";
  validateArgs(args);

  const calendars = getCalendarsByNames(args.calendars.length ? args.calendars : undefined);
  const calendarIds = calendars.length ? calendars.map((c) => c.id) : null;

  const eventsOut: any[] = [];
  const errors: any[] = [];

  if (args.mode === "range" || args.mode === "fuzzy-range" || args.mode === "next") {
    // For now, map --next and --time-range into a date window using JS Date.
    let from = args.from;
    let to = args.to;

    if (args.mode === "next") {
      const now = new Date();
      const fromDate = now;
      let toDate = new Date(now);
      if (args.nextDays) {
        toDate = new Date(now.getTime() + args.nextDays * 24 * 60 * 60 * 1000);
      } else if (args.timeRange === "today") {
        toDate.setHours(23, 59, 59, 999);
      } else if (args.timeRange === "tomorrow") {
        fromDate.setDate(fromDate.getDate() + 1);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setHours(23, 59, 59, 999);
      } else if (args.timeRange === "this_week") {
        // simple: now to 7 days ahead
        toDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      from = fromDate.toISOString();
      to = toDate.toISOString();
    }

    if (!from || !to) {
      printErrorAndExit("invalid_arguments", "Range-like modes require a resolved from/to range");
    }

    const pastRows = queryRange(calendarIds, from, to, args.allDay ?? null, undefined);
    const futureRows = loadFutureEventsFromCache(calendars, from, to, args.allDay ?? null);
    const allRows: EventRow[] = [
      ...pastRows.map((r) => ({
        calendar_id: r.calendar_id,
        uid: r.uid,
        summary: r.summary,
        description: r.description,
        location: r.location,
        dtstart: r.dtstart,
        dtend: r.dtend,
        all_day: r.all_day,
      })),
      ...futureRows,
    ].sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime());

    const sortDesc = args.sort === "start_desc";
    const ordered = sortDesc ? [...allRows].reverse() : allRows;
    const limited = args.limit && args.limit > 0 ? ordered.slice(0, args.limit) : ordered;

    for (const row of limited) {
      const score = args.query
        ? fuzzyScore(args.query, {
            summary: row.summary ?? undefined,
            location: row.location ?? undefined,
            description: row.description ?? undefined,
          })
        : undefined;

      const isAllDay = !!row.all_day;
      const startLocal = convertIsoToTzLocal(row.dtstart, args.tzConvert, isAllDay);
      const endLocal = convertIsoToTzLocal(row.dtend, args.tzConvert, isAllDay);

      eventsOut.push({
        calendarId: row.calendar_id,
        uid: row.uid,
        summary: row.summary,
        description: row.description,
        location: row.location,
        start: startLocal,
        end: endLocal,
        allDay: !!row.all_day,
        fuzzyScore: score,
      });
    }
  } else if (args.mode === "last") {
    const rows = queryLastMatching(calendarIds);
    let best: { row: any; score: number } | null = null;
    for (const row of rows) {
      const score = fuzzyScore(args.query!, {
        summary: row.summary ?? undefined,
        location: row.location ?? undefined,
        description: row.description ?? undefined,
      });
      if (!best || score > best.score) best = { row, score };
    }
    if (best) {
      const row = best.row;
      const isAllDay = !!row.all_day;
      const startLocal = convertIsoToTzLocal(row.dtstart, args.tzConvert, isAllDay);
      const endLocal = convertIsoToTzLocal(row.dtend, args.tzConvert, isAllDay);
      eventsOut.push({
        calendarId: row.calendar_id,
        uid: row.uid,
        summary: row.summary,
        description: row.description,
        location: row.location,
        start: startLocal,
        end: endLocal,
        allDay: !!row.all_day,
        fuzzyScore: best.score,
      });
    }
  }

  const calendarInfo = calendars.map((c) => ({ id: c.id, name: c.name }));

  printJson(
    ok({
      query: {
        mode: args.mode,
        calendars: args.calendars.length ? args.calendars : undefined,
        from: args.from,
        to: args.to,
        nextDays: args.nextDays,
        timeRange: args.timeRange,
        text: args.query,
        tzConvert: args.tzConvert,
      },
      calendar_info: calendarInfo,
      events: eventsOut,
      errors,
    }),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  printErrorAndExit("unexpected_error", message);
});
