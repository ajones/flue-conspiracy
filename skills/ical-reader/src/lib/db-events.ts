import { getDb, CalendarRow } from "./db";
import type { IcsEvent } from "./ics";
import { tokenize } from "./fuzzy";

export interface StoredEvent {
  id: number;
  calendar_id: number;
  uid: string;
  recurrence_id: string | null;
  dtstart: string;
  dtend: string | null;
  all_day: number;
  tzid_start: string | null;
  tzid_end: string | null;
  summary: string | null;
  location: string | null;
  description: string | null;
}

export function upsertPastEvents(calendar: CalendarRow, events: IcsEvent[]): number {
  const db = getDb();
  const nowIso = new Date().toISOString();
  let count = 0;

  const insert = db.prepare(`
    INSERT INTO events (
      calendar_id, uid, recurrence_id, dtstart, dtend, all_day, tzid_start, tzid_end,
      summary, location, description, last_modified, sequence,
      tokens_summary, tokens_location, tokens_body,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(calendar_id, uid, recurrence_id) DO UPDATE SET
      dtstart=excluded.dtstart,
      dtend=excluded.dtend,
      all_day=excluded.all_day,
      tzid_start=excluded.tzid_start,
      tzid_end=excluded.tzid_end,
      summary=excluded.summary,
      location=excluded.location,
      description=excluded.description,
      last_modified=excluded.last_modified,
      sequence=excluded.sequence,
      tokens_summary=excluded.tokens_summary,
      tokens_location=excluded.tokens_location,
      tokens_body=excluded.tokens_body,
      updated_at=excluded.updated_at
  `);

  const now = new Date();

  for (const ev of events) {
    const end = ev.dtend ? new Date(ev.dtend) : new Date(ev.dtstart);
    if (end >= now) continue; // only persist past events

    const tokensSummary = tokenize(ev.summary ?? "").join(" ");
    const tokensLocation = tokenize(ev.location ?? "").join(" ");
    const tokensBody = tokenize(ev.description ?? "").join(" ");

    insert.run(
      calendar.id,
      ev.uid,
      ev.recurrenceId ?? "",
      ev.dtstart,
      ev.dtend ?? null,
      ev.allDay ? 1 : 0,
      ev.tzidStart ?? null,
      ev.tzidEnd ?? null,
      ev.summary ?? null,
      ev.location ?? null,
      ev.description ?? null,
      ev.lastModified ?? null,
      ev.sequence ?? null,
      tokensSummary,
      tokensLocation,
      tokensBody,
      nowIso,
      nowIso,
    );
    count++;
  }

  return count;
}

export function queryRange(
  calendarIds: number[] | null,
  fromIso: string,
  toIso: string,
  allDay: boolean | null,
  limit?: number,
): StoredEvent[] {
  const db = getDb();
  // Event overlaps [from, to]: starts before range end and (has end >= from, or no end and start is in range)
  const clauses: string[] = [
    "dtstart <= ?",
    "(dtend IS NOT NULL AND dtend >= ? OR dtend IS NULL AND dtstart >= ?)",
  ];
  const params: any[] = [toIso, fromIso, fromIso];

  if (calendarIds && calendarIds.length > 0) {
    clauses.push(`calendar_id IN (${calendarIds.map(() => "?").join(",")})`);
    params.push(...calendarIds);
  }

  if (allDay !== null) {
    clauses.push("all_day = ?");
    params.push(allDay ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitSql = limit && limit > 0 ? `LIMIT ${limit}` : "";

  const sql = `SELECT * FROM events ${where} ORDER BY dtstart ASC ${limitSql}`;
  return db.query<StoredEvent>(sql).all(...params);
}

export function queryLastMatching(
  calendarIds: number[] | null,
): StoredEvent[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: any[] = [];

  if (calendarIds && calendarIds.length > 0) {
    clauses.push(`calendar_id IN (${calendarIds.map(() => "?").join(",")})`);
    params.push(...calendarIds);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT * FROM events ${where} ORDER BY dtstart DESC`;
  return db.query<StoredEvent>(sql).all(...params);
}
