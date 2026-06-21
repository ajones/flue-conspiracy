#!/usr/bin/env bun

import { printJson, printErrorAndExit, ok } from "../lib/json";
import { appendCredential, parseCredentialsFile, urlToHash } from "../lib/credentials";
import { fetchValidatedIcs } from "../lib/http";
import { upsertCalendar } from "../lib/db";

function parseArgs(argv: string[]): { url?: string; name?: string; details?: string } {
  const out: { url?: string; name?: string; details?: string } = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") out.url = argv[++i];
    else if (arg === "--name") out.name = argv[++i];
    else if (arg === "--details") out.details = argv[++i];
  }
  return out;
}

async function main() {
  const { url, name, details = "" } = parseArgs(process.argv);

  if (!url || !name) {
    printErrorAndExit("invalid_arguments", "--url and --name are required", {
      missing: [!url ? "url" : null, !name ? "name" : null].filter(Boolean),
    });
  }

  const existing = parseCredentialsFile();
  if (existing.some((c) => c.name === name)) {
    printErrorAndExit("duplicate_name", "Calendar name must be unique", {
      calendarName: name,
    });
  }

  try {
    // Validate URL by fetching and checking ICS content.
    await fetchValidatedIcs(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printErrorAndExit("validation_failed", "Failed to fetch or parse calendar", {
      reason: "fetch_or_parse_error",
      message,
      calendarName: name,
    });
  }

  // URL is considered valid at this point. Persist credential and DB row.
  const urlHash = urlToHash(url);
  appendCredential(url, name, details);
  const cal = upsertCalendar(name, urlHash, details);

  printJson(
    ok({
      calendar: {
        name: cal.name,
        details: cal.extra_details,
      },
    }),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  printErrorAndExit("unexpected_error", message);
});
