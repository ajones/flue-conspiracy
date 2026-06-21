// Minimal ICS parsing focused on VEVENT blocks.
// This is intentionally lightweight and does not fully implement RFC5545.

export interface IcsEvent {
  uid: string;
  recurrenceId?: string;
  dtstart: string; // ISO string
  dtend?: string;  // ISO string
  allDay: boolean;
  tzidStart?: string;
  tzidEnd?: string;
  summary?: string;
  location?: string;
  description?: string;
  lastModified?: string;
  sequence?: number;
  rrule?: string;    // raw RRULE value e.g. "FREQ=WEEKLY;BYDAY=TH"
  exdates?: string[]; // ISO strings of excluded occurrences
}

function unfoldLines(ics: string): string[] {
  // ICS may fold long lines starting with space or tab.
  const raw = ics.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of raw) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}

// Convert a local datetime string (ISO-like, no offset) to UTC given a TZID.
// Uses the "inverse Intl" trick: treat local time as UTC, measure the tz offset
// Intl applies to it, then reverse that offset to get true UTC.
function tzLocalToUtc(localIso: string, tzid: string): string {
  try {
    const localAsUtc = new Date(localIso + "Z");
    if (Number.isNaN(localAsUtc.getTime())) return localIso + "Z";
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
    return new Date(localAsUtc.getTime() - offsetMs).toISOString();
  } catch {
    return localIso + "Z";
  }
}

function parseDateTime(value: string, tzid?: string): { iso: string; allDay: boolean } {
  // Handles date-only (YYYYMMDD) and date-time (YYYYMMDDThhmmss or YYYYMMDDThhmmssZ).
  if (/^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return { iso: `${year}-${month}-${day}T00:00:00.000Z`, allDay: true };
  }
  // YYYYMMDDThhmmss or YYYYMMDDThhmmssZ — normalize to ISO with Z for storage
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const h = value.slice(9, 11);
    const m = value.slice(11, 13);
    const s = value.slice(13, 15);
    const isUtc = value.endsWith("Z");
    if (!isUtc && tzid) {
      // Local time in a named timezone — convert to UTC
      const iso = tzLocalToUtc(`${year}-${month}-${day}T${h}:${m}:${s}`, tzid);
      return { iso, allDay: false };
    }
    return { iso: `${year}-${month}-${day}T${h}:${m}:${s}.000Z`, allDay: false };
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { iso: new Date(0).toISOString(), allDay: false };
  }
  return { iso: d.toISOString(), allDay: false };
}

export function parseEvents(ics: string): IcsEvent[] {
  const lines = unfoldLines(ics);
  const events: IcsEvent[] = [];
  let inEvent = false;
  let current: Partial<IcsEvent> & { allDay?: boolean } = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent && current.uid && current.dtstart) {
        events.push({
          uid: current.uid,
          recurrenceId: current.recurrenceId,
          dtstart: current.dtstart!,
          dtend: current.dtend,
          allDay: current.allDay ?? false,
          tzidStart: current.tzidStart,
          tzidEnd: current.tzidEnd,
          summary: current.summary,
          location: current.location,
          description: current.description,
          lastModified: current.lastModified,
          sequence: current.sequence,
          rrule: current.rrule,
          exdates: current.exdates,
        });
      }
      inEvent = false;
      current = {};
      continue;
    }
    if (!inEvent) continue;

    const [prop, ...rest] = line.split(":");
    if (!prop || rest.length === 0) continue;
    const value = rest.join(":");

    const [name, ...paramParts] = prop.split(";");
    const params = new Map<string, string>();
    for (const p of paramParts) {
      const [k, v] = p.split("=");
      if (k && v) params.set(k.toUpperCase(), v);
    }

    switch (name.toUpperCase()) {
      case "UID":
        current.uid = value;
        break;
      case "RECURRENCE-ID": {
        const { iso } = parseDateTime(value, params.get("TZID"));
        current.recurrenceId = iso;
        break;
      }
      case "DTSTART": {
        const tzid = params.get("TZID");
        const { iso, allDay } = parseDateTime(value, tzid);
        current.dtstart = iso;
        current.allDay = allDay;
        if (tzid) current.tzidStart = tzid;
        break;
      }
      case "DTEND": {
        const tzid = params.get("TZID");
        const { iso } = parseDateTime(value, tzid);
        current.dtend = iso;
        if (tzid) current.tzidEnd = tzid;
        break;
      }
      case "SUMMARY":
        current.summary = value;
        break;
      case "LOCATION":
        current.location = value;
        break;
      case "DESCRIPTION":
        current.description = value;
        break;
      case "LAST-MODIFIED": {
        const { iso } = parseDateTime(value);
        current.lastModified = iso;
        break;
      }
      case "SEQUENCE": {
        const n = Number(value);
        if (!Number.isNaN(n)) current.sequence = n;
        break;
      }
      case "RRULE":
        current.rrule = value;
        break;
      case "EXDATE": {
        const { iso: exIso } = parseDateTime(value, params.get("TZID"));
        if (!current.exdates) current.exdates = [];
        current.exdates.push(exIso);
        break;
      }
      default:
        break;
    }
  }

  return events;
}
