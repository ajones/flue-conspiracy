import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { getWorkspaceRoot } from "./credentials";
import Database from "bun:sqlite";

let dbInstance: Database | null = null;

function dbPath(): string {
  const dir = resolve(getWorkspaceRoot(), "skills", "ical-reader");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "ical-events.sqlite");
}

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath());
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      url_hash TEXT NOT NULL,
      extra_details TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      uid TEXT NOT NULL,
      recurrence_id TEXT,
      dtstart TEXT NOT NULL,
      dtend TEXT,
      all_day INTEGER NOT NULL,
      tzid_start TEXT,
      tzid_end TEXT,
      summary TEXT,
      location TEXT,
      description TEXT,
      last_modified TEXT,
      sequence INTEGER,
      tokens_summary TEXT,
      tokens_location TEXT,
      tokens_body TEXT,
      embedding BLOB,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (calendar_id, uid, recurrence_id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_calendar_start
      ON events (calendar_id, dtstart);
    CREATE INDEX IF NOT EXISTS idx_events_start
      ON events (dtstart);
    CREATE INDEX IF NOT EXISTS idx_events_tokens
      ON events (tokens_summary, tokens_location, tokens_body);
  `);
}

export interface CalendarRow {
  id: number;
  name: string;
  url_hash: string;
  extra_details: string | null;
}

export function upsertCalendar(name: string, urlHash: string, details: string): CalendarRow {
  const db = getDb();
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO calendars (name, url_hash, extra_details, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET url_hash=excluded.url_hash, extra_details=excluded.extra_details, updated_at=excluded.updated_at`,
  ).run(name, urlHash, details, now, now);
  return db.query<CalendarRow>("SELECT * FROM calendars WHERE name = ?").get(name)!;
}

export function getCalendarsByNames(names?: string[]): CalendarRow[] {
  const db = getDb();
  if (!names || names.length === 0) {
    return db.query<CalendarRow>("SELECT * FROM calendars").all();
  }
  const placeholders = names.map(() => "?").join(",");
  return db.query<CalendarRow>(`SELECT * FROM calendars WHERE name IN (${placeholders})`).all(
    ...names,
  );
}
