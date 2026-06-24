---
name: encoregym
description: >
  GYM (not swim): Interact with the Encore Gym parent portal (Jackrabbit Class)
  for Cody's gymnastics class — read class schedules, absences, available makeup
  slots, and announcements. Use when asked about Cody's GYM classes, schedules,
  makeups, or news for Encore Gym. Leo is not enrolled in gym; do not use for swim
  (use swim-class-finder for swim).
metadata:
  openclaw:
    emoji: "🏋️"
    requires: { bins: ["node"] }
    install:
      - id: npm
        kind: npm
        cwd: skills/encoregym
---

# Encore Gym Skill

Automates the Encore Gym Jackrabbit Class parent portal:
`https://app.jackrabbitclass.com/jr3.0/ParentPortal/Login?orgId=500004`

## Credentials Setup (per workspace)

Each workspace that uses this skill must have a `.encoregym.credentials` file:

```
email=user@example.com
password=secretpassword
```

Load credentials from `.encoregym.credentials` in your workspace folder (the `workspacePath` from your input) before running any script:

```bash
ENCOREGYM_EMAIL=$(grep '^email=' "$WORKSPACE/.encoregym.credentials" | cut -d= -f2)
ENCOREGYM_PASSWORD=$(grep '^password=' "$WORKSPACE/.encoregym.credentials" | cut -d= -f2)
```

Set `WORKSPACE` to your `workspacePath` value.

All scripts read `ENCOREGYM_EMAIL` and `ENCOREGYM_PASSWORD` from the environment.

## Session Caching

Scripts cache the browser session at `--state-file` (default `/tmp/encoregym-session.json`).
If the session is expired the script deletes the state file and exits with an error — re-run
with credentials set and it will log in fresh. Sessions are never committed.

## Scripts

All scripts are in `scripts/`. Run with `node`. All output JSON to stdout
and exit 0 on success, non-zero on failure.

---

### `login.js` — authenticate and save session

Logs in to the portal and saves a reusable browser session.

```bash
ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node login.js [--state-file /tmp/encoregym-session.json]
```

**Output:**
```json
{ "ok": true, "stateFile": "/tmp/encoregym-session.json", "url": "https://..." }
```

---

### `get-schedule.js` — class schedule

Fetches enrolled classes for all students in the account.

```bash
ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-schedule.js [--state-file ...]
```

**Output:**
```json
{
  "ok": true,
  "schedules": [
    {
      "student": "Cody Jones",
      "classes": [
        {
          "className": "Tiny Tumblers A Thursdays (Bench 1)",
          "days": "Th",
          "time": "10:15am - 11:00am",
          "instructor": "Serena Knott",
          "location": "Encore Gymnastics",
          "status": "Active",
          "enrollDate": "2026-05-03"
        }
      ],
      "makeups": [],
      "waitlists": []
    }
  ]
}
```

---

### `get-makeups.js` — absences eligible for makeup + available slots

Returns all unscheduled absences eligible for makeup, and the list of available
open-gym makeup slots (fetched by clicking "Schedule Makeup" in the portal UI).

```bash
ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-makeups.js [--state-file ...]
```

**Output:**
```json
{
  "ok": true,
  "orgAllowsMakeups": true,
  "makeups": [
    {
      "attendanceId": 486869811,
      "student": "Cody",
      "missedClass": "Tiny Tumblers A Thursdays (Bench 1)",
      "missedDate": "2026-05-14",
      "makeupExpiresDate": "2027-05-14",
      "makeupScheduled": null
    }
  ],
  "availableSlots": [
    {
      "className": "Open Gym Ages 1-5 Friday 6/12",
      "dateTime": "Fri Jun 12, 2026 @ 12:00pm",
      "date": "2026-06-12",
      "startTime": "12:00pm",
      "openings": 21,
      "location": "Encore Gymnastics",
      "classId": 21275651
    }
  ]
}
```

**Notes:**
- `makeups` — absences not yet made up (`makeupScheduled: null` means none booked)
- `availableSlots` — open-gym sessions available for any eligible absence; `classId` and `attendanceId` are the keys needed to book
- Available slots are the same regardless of which absence you're making up
- Age-appropriate slots for young children (1–5) are Fridays at noon; Thursday 7:45pm slots are Ages 10+

---

### `get-announcements.js` — latest gym announcement

Scrapes the News page for the current announcement and checks for unread messages.

```bash
ENCOREGYM_EMAIL=... ENCOREGYM_PASSWORD=... node get-announcements.js [--state-file ...]
```

**Output:**
```json
{
  "ok": true,
  "hasNewAnnouncement": false,
  "newMessageCount": 1,
  "announcement": {
    "date": "SUN, MAY 31, 2026",
    "text": "Welcome to Encore!\n\nEncore is OPEN for..."
  }
}
```

**Notes:**
- `hasNewAnnouncement` — true if the portal is flagging a new unread announcement
- `newMessageCount` — unread messages in the portal inbox (separate from announcements)
- `announcement` — the single latest announcement; the portal only shows one at a time

---

## Guardrails

- Never log or expose credentials in output.
- Do not book or cancel classes without explicit user confirmation.
- `attendanceId` + `classId` are the keys needed for booking — a booking script does not yet exist; confirm with the user before building one.
