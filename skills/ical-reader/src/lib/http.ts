import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { getWorkspaceRoot, urlToHash } from "./credentials";

export interface CachedIcsResult {
  ics: string;
  etag?: string;
  lastModified?: string;
  contentHash: string;
}

interface MetaFile {
  calendarName?: string;
  calendarHash: string;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  lastSync?: string;
  lastError?: string;
}

function cacheDir(): string {
  const dir = resolve(getWorkspaceRoot(), "skills", "ical-reader", "cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function metaPath(hash: string): string {
  return resolve(cacheDir(), `${hash}.meta.json`);
}

function icsPath(hash: string): string {
  return resolve(cacheDir(), `${hash}.ics`);
}

function readMeta(hash: string): MetaFile | null {
  const p = metaPath(hash);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as MetaFile;
  } catch {
    return null;
  }
}

function writeMeta(hash: string, meta: MetaFile): void {
  writeFileSync(metaPath(hash), JSON.stringify(meta, null, 2), "utf8");
}

function sha256(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

export async function fetchValidatedIcs(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Not a valid ICS (missing BEGIN:VCALENDAR)");
  }
  return text;
}

export async function fetchWithCache(
  url: string,
  calendarName?: string,
): Promise<CachedIcsResult> {
  const hash = urlToHash(url);
  const existingMeta = readMeta(hash) ?? { calendarHash: hash };

  const headers: HeadersInit = {};
  if (existingMeta.etag) headers["If-None-Match"] = existingMeta.etag;
  if (existingMeta.lastModified) headers["If-Modified-Since"] = existingMeta.lastModified;

  const res = await fetch(url, { headers });

  if (res.status === 304 && existsSync(icsPath(hash)) && existingMeta.contentHash) {
    const cached = readFileSync(icsPath(hash), "utf8");
    return {
      ics: cached,
      etag: existingMeta.etag,
      lastModified: existingMeta.lastModified,
      contentHash: existingMeta.contentHash,
    };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Not a valid ICS (missing BEGIN:VCALENDAR)");
  }

  const contentHash = sha256(text);
  const nextMeta: MetaFile = {
    calendarHash: hash,
    calendarName: calendarName ?? existingMeta.calendarName,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
    contentHash,
    lastSync: new Date().toISOString(),
  };

  writeFileSync(icsPath(hash), text, "utf8");
  writeMeta(hash, nextMeta);

  return { ics: text, etag: nextMeta.etag, lastModified: nextMeta.lastModified, contentHash };
}

/**
 * Read raw ICS from cache by URL hash (no network, no URL in memory).
 * Used by ical-query to load future events without re-fetching.
 */
export function readCachedIcs(urlHash: string): string | null {
  const p = resolve(cacheDir(), `${urlHash}.ics`);
  if (!existsSync(p)) return null;
  try {
    const text = readFileSync(p, "utf8");
    return text.includes("BEGIN:VCALENDAR") ? text : null;
  } catch {
    return null;
  }
}
