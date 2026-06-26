import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const WORKSPACE_ROOT = resolve(process.env.WORKSPACE_ROOT ?? process.env.HOME ?? ".", "local", "raven", "flue-conspiracy", "workspace", "raven-lead");
const CREDENTIALS_PATH = resolve(WORKSPACE_ROOT, ".ical.credentials");

export interface CalendarCredential {
  url: string; // SECRET: never log/print
  name: string;
  details: string;
  urlHash: string;
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function parseCredentialsFile(): CalendarCredential[] {
  if (!existsSync(CREDENTIALS_PATH)) return [];
  const content = readFileSync(CREDENTIALS_PATH, "utf8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const creds: CalendarCredential[] = [];
  for (const line of lines) {
    const [url, name, details = ""] = line.split("|||");
    if (!url || !name) continue;
    creds.push({ url, name, details, urlHash: hashUrl(url) });
  }
  return creds;
}

export function appendCredential(url: string, name: string, details: string): void {
  const line = `${url}|||${name}|||${details ?? ""}`;
  const toWrite = existsSync(CREDENTIALS_PATH)
    ? readFileSync(CREDENTIALS_PATH, "utf8").trimEnd() + "\n" + line + "\n"
    : line + "\n";
  writeFileSync(CREDENTIALS_PATH, toWrite, "utf8");
}

export function getWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

export function credentialsPath(): string {
  return CREDENTIALS_PATH;
}

export function urlToHash(url: string): string {
  return hashUrl(url);
}
