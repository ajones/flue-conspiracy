#!/usr/bin/env bun

import { parseCredentialsFile } from "../lib/credentials";
import { fetchWithCache } from "../lib/http";
import { getCalendarsByNames, upsertCalendar } from "../lib/db";
import { upsertPastEvents } from "../lib/db-events";
import { parseEvents } from "../lib/ics";
import { printJson, printErrorAndExit, ok } from "../lib/json";

function parseArgs(argv: string[]): { calendars?: string[] } {
  const calendars: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--calendar") calendars.push(argv[++i]);
  }
  return { calendars: calendars.length ? calendars : undefined };
}

async function main() {
  const { calendars } = parseArgs(process.argv);
  const creds = parseCredentialsFile();

  if (creds.length === 0) {
    printJson(ok({ calendars: [], errors: [] }));
    return;
  }

  const selectedCreds = calendars
    ? creds.filter((c) => calendars.includes(c.name))
    : creds;

  if (selectedCreds.length === 0) {
    printErrorAndExit("not_found", "No matching calendars in .ical.credentials", {
      requested: calendars,
    });
  }

  const results: any[] = [];
  const errors: any[] = [];

  for (const cred of selectedCreds) {
    // Ensure calendar row exists.
    const calRow = upsertCalendar(cred.name, cred.urlHash, cred.details);
    try {
      const { ics } = await fetchWithCache(cred.url, cred.name);
      const events = parseEvents(ics);
      const pastEventsUpserted = upsertPastEvents(calRow, events);

      const futureEventsCount = events.filter((ev) => {
        const end = ev.dtend ? new Date(ev.dtend) : new Date(ev.dtstart);
        return end >= new Date();
      }).length;

      results.push({
        name: calRow.name,
        status: "ok",
        pastEventsUpserted,
        futureEventsCount,
        lastSync: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        calendarName: cred.name,
        errorType: "fetch_failed",
        message,
      });
      results.push({
        name: calRow.name,
        status: "error",
      });
    }
  }

  printJson(ok({ calendars: results, errors }));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  printErrorAndExit("unexpected_error", message);
});
