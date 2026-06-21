// Expands recurring ICS events into individual occurrences within a date range.
// Handles RRULE, EXDATE, and RECURRENCE-ID overrides per RFC5545.

import { RRuleSet, rrulestr } from "rrule";
import type { IcsEvent } from "./ics";

const MAX_OCCURRENCES = 1000;

function toDateKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

// Format a Date's UTC components as a floating iCal datetime (no Z).
// Used for DTSTART when the event has a TZID — rrule then generates occurrences
// at the same wall-clock time, which we re-localise afterwards.
function formatFloating(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

// Format a Date's UTC components as a UTC iCal datetime (with Z).
function formatUtc(d: Date): string {
  return formatFloating(d) + "Z";
}

// Convert a UTC ISO string to local time components string in the given TZID.
// Returns "YYYY-MM-DDTHH:MM:SS" (no offset).
function utcToLocalStr(utcIso: string, tzid: string): string {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzid,
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
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

// Convert a floating local time string (no Z) to a true UTC Date using inverse-Intl trick.
function localStrToUtcDate(localStr: string, tzid: string): Date {
  const localAsUtc = new Date(localStr + "Z");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzid,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(localAsUtc).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const tzDisplayAsUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
  const offsetMs = tzDisplayAsUtc.getTime() - localAsUtc.getTime();
  return new Date(localAsUtc.getTime() - offsetMs);
}

function buildRRuleSet(master: IcsEvent, dtstartForRRule: Date, useFloating: boolean): RRuleSet | null {
  if (!master.rrule) return null;

  try {
    const dtStr = useFloating ? formatFloating(dtstartForRRule) : formatUtc(dtstartForRRule);
    const rruleStr = `DTSTART:${dtStr}\nRRULE:${master.rrule}`;
    const parsed = rrulestr(rruleStr, { forceset: true }) as RRuleSet;

    if (master.exdates) {
      for (const exIso of master.exdates) {
        let exDate: Date;

        if (useFloating && master.tzidStart) {
          // Keep EXDATEs in the same floating-local space as DTSTART/RRULE.
          // Without this, exclusions for TZID-backed recurring events won't line up
          // with the generated recurrence instances.
          const localStr = utcToLocalStr(exIso, master.tzidStart);
          exDate = new Date(localStr + "Z");
        } else {
          exDate = new Date(exIso);
        }

        if (!Number.isNaN(exDate.getTime())) {
          (parsed as RRuleSet).exdate(exDate);
        }
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

export function expandRecurringEvents(
  events: IcsEvent[],
  from: Date,
  to: Date,
): IcsEvent[] {
  const masters: IcsEvent[] = [];
  const overrides = new Map<string, IcsEvent>();
  const plain: IcsEvent[] = [];

  for (const ev of events) {
    if (ev.recurrenceId) {
      overrides.set(`${ev.uid}|${toDateKey(ev.recurrenceId)}`, ev);
    } else if (ev.rrule) {
      masters.push(ev);
    } else {
      plain.push(ev);
    }
  }

  const result: IcsEvent[] = [];

  for (const ev of plain) {
    const start = new Date(ev.dtstart).getTime();
    const end = ev.dtend ? new Date(ev.dtend).getTime() : start;
    if (start <= to.getTime() && end >= from.getTime()) {
      result.push(ev);
    }
  }

  for (const master of masters) {
    const utcDtstart = new Date(master.dtstart);
    if (Number.isNaN(utcDtstart.getTime())) continue;

    const durationMs = master.dtend
      ? new Date(master.dtend).getTime() - utcDtstart.getTime()
      : 0;

    const tzid = master.tzidStart;

    // When the event has a TZID, we feed rrule a *floating* DTSTART that contains
    // the original local time components (not UTC). rrule then generates occurrences
    // at the same wall-clock time on each recurrence date. We convert each generated
    // occurrence back to true UTC using the TZID, which correctly handles DST shifts.
    let dtstartForRRule: Date;
    if (tzid) {
      const localStr = utcToLocalStr(master.dtstart, tzid);
      dtstartForRRule = new Date(localStr + "Z"); // store local time in UTC fields
    } else {
      dtstartForRRule = utcDtstart;
    }

    const rset = buildRRuleSet(master, dtstartForRRule, !!tzid);
    if (!rset) {
      const start = utcDtstart.getTime();
      const end = start + durationMs;
      if (start <= to.getTime() && end >= from.getTime()) {
        result.push(master);
      }
      continue;
    }

    // Search window: pull back by duration so we catch events that started just before `from`.
    const searchFrom = new Date(from.getTime() - Math.max(durationMs, 0));

    // When using floating mode, rrule's `between` bounds also need to be in "local-as-UTC" space.
    let rruleFrom: Date;
    let rruleTo: Date;
    if (tzid) {
      rruleFrom = new Date(utcToLocalStr(searchFrom.toISOString(), tzid) + "Z");
      rruleTo = new Date(utcToLocalStr(to.toISOString(), tzid) + "Z");
    } else {
      rruleFrom = searchFrom;
      rruleTo = to;
    }

    const rawOccurrences = rset.between(rruleFrom, rruleTo, true).slice(0, MAX_OCCURRENCES);

    for (const rawOcc of rawOccurrences) {
      // Convert the "floating" occurrence back to a true UTC Date.
      let occStart: Date;
      if (tzid) {
        const localStr = formatFloating(rawOcc); // extract wall-clock time from rrule output
        occStart = localStrToUtcDate(
          `${localStr.slice(0, 4)}-${localStr.slice(4, 6)}-${localStr.slice(6, 8)}T${localStr.slice(9, 11)}:${localStr.slice(11, 13)}:${localStr.slice(13, 15)}`,
          tzid,
        );
      } else {
        occStart = rawOcc;
      }

      const occEnd = new Date(occStart.getTime() + durationMs);

      if (occStart.getTime() > to.getTime() || occEnd.getTime() < from.getTime()) {
        continue;
      }

      // Check if this occurrence has a RECURRENCE-ID override.
      // The override key uses the occurrence's local date in the TZID (or UTC date).
      const overrideDateKey = tzid
        ? toDateKey(utcToLocalStr(occStart.toISOString(), tzid))
        : toDateKey(occStart.toISOString());
      const overrideKey = `${master.uid}|${overrideDateKey}`;
      const override = overrides.get(overrideKey);

      if (override) {
        const ovStart = new Date(override.dtstart).getTime();
        const ovEnd = override.dtend ? new Date(override.dtend).getTime() : ovStart;
        if (ovStart <= to.getTime() && ovEnd >= from.getTime()) {
          result.push(override);
        }
      } else {
        result.push({
          ...master,
          dtstart: occStart.toISOString(),
          dtend: durationMs > 0 ? occEnd.toISOString() : master.dtend,
          recurrenceId: undefined,
          rrule: undefined,
          exdates: undefined,
        });
      }
    }
  }

  return result;
}
