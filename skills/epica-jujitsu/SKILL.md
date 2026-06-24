---
name: epica-jujitsu
description: >
  Interact with the Epica Jiu Jitsu Academy gymdesk parent portal
  (https://epicajiujitsu.gymdesk.com) for Cody and Leo's BJJ classes — check
  the weekly class schedule, see booking status, and book or cancel class
  attendance. Cody is only ever booked into "Little Kids BJJ (ages 3-5)" and
  Leo is only ever booked into "Big Kids BJJ (ages 6-8)" — never book either
  student into any other class.
metadata:
  openclaw:
    emoji: "🥋"
    requires: { bins: ["node"] }
    install:
      - id: npm
        kind: npm
        cwd: skills/epica-jujitsu
---

# Epica Jiu Jitsu Skill

Automates the Epica Jiu Jitsu Academy gymdesk parent portal:
`https://epicajiujitsu.gymdesk.com/login`

## Students

| Student | Allowed class |
|---------|---------------|
| `cody`  | Little Kids BJJ (ages 3-5) |
| `leo`   | Big Kids BJJ (ages 6-8) |

Never pass `--student cody` for a "Big Kids" class or `--student leo` for a "Little Kids"
class — the book/cancel scripts enforce this by only matching the allowed class title for
that student, but always double check before calling.

### Leo is not currently supported — DO NOT substitute Cody's data for Leo

Leo Jones' profile appears to have its own separate gymdesk login password — the shared
account password (that works for Cody) fails with "Password does not match" when Leo is
selected at the "Who is logging in?" step. `login.js --student leo` will fail immediately
with this explanation.

**Every session (and every `get-schedule.js` / `book-class.js` / `cancel-class.js` result)
reflects ONLY the logged-in student's own view — `booked: true` means *that student* is
booked, not the other one.** Because only Cody's login works, all data this skill can
currently retrieve is Cody's. There is no way to check Leo's schedule or booking status
via this skill.

If the user asks anything about Leo's schedule or bookings (booked/not booked, which
classes, etc.), do NOT run `get-schedule.js` under Cody's session and report results as
Leo's — even though "Little Kids BJJ" and "Big Kids BJJ" run on the same day/schedule grid,
a booking shown under Cody's session is Cody's booking, not Leo's, and tells you nothing
about Leo. Instead, tell the user this automation doesn't work for Leo yet and give them
the portal link to check/manage Leo's bookings manually:
**https://epicajiujitsu.gymdesk.com/login**

## Credentials Setup

The agent's workspace must have a `.epicajujitsu.credentials` file:

```
EPICAJUJITSU_EMAIL=user@example.com
EPICAJUJITSU_PASSWORD=secretpassword
```

Load credentials from `.epicajujitsu.credentials` in your workspace folder (the `workspacePath` from your input) before running any script:

```bash
EPICAJUJITSU_EMAIL=$(grep '^EPICAJUJITSU_EMAIL=' "$WORKSPACE/.epicajujitsu.credentials" | cut -d= -f2-)
EPICAJUJITSU_PASSWORD=$(grep '^EPICAJUJITSU_PASSWORD=' "$WORKSPACE/.epicajujitsu.credentials" | cut -d= -f2-)
```

Set `WORKSPACE` to your `workspacePath` value.

## Session Caching

Each student has their own session, since the portal login flow involves selecting which
family member ("Cody Jones" or "Leo Jones") is logging in. Sessions are cached at
`/tmp/epica-<student>-session.json` by default.

If a script reports the session expired, it deletes the state file automatically — just
re-run `login.js` for that student and retry.

## Scripts

All scripts are in `scripts/`. Run with `node`. All output JSON to
stdout and exit 0 on success, non-zero on failure.

---

### `login.js` — authenticate as Cody or Leo and save session

```bash
EPICAJUJITSU_EMAIL=... EPICAJUJITSU_PASSWORD=... node login.js --student cody [--state-file /tmp/epica-cody-session.json]
```

**Output:**
```json
{ "ok": true, "stateFile": "/tmp/epica-cody-session.json", "url": "https://...", "student": "cody" }
```

---

### `get-schedule.js` — weekly class schedule + booking status

```bash
node get-schedule.js --state-file /tmp/epica-cody-session.json [--weeks-ahead 0]
```

`--weeks-ahead` navigates forward N weeks from the current week (0 = this week, 1 = next
week, etc).

**Output:**
```json
{
  "ok": true,
  "classes": [
    {
      "title": "Little Kids BJJ (ages 3–5)",
      "date": "2026-06-15",
      "time": "16:00:00",
      "eventId": "1309573",
      "bookable": true,
      "booked": false,
      "bookingId": null,
      "canCancel": false
    }
  ]
}
```

---

### `book-class.js` — book a class

```bash
node book-class.js --state-file /tmp/epica-cody-session.json --student cody --date 2026-06-15 [--weeks-ahead 0]
```

- `--student` determines the allowed class title (see table above) — the script only
  matches classes whose title contains that student's allowed class name.
- `--date` is the YYYY-MM-DD of the class occurrence; use `--weeks-ahead` to navigate to
  the week containing that date first.
- If already booked, returns `{ "ok": true, "booked": true, "alreadyBooked": true, ... }`
  without re-booking.

**Output:**
```json
{ "ok": true, "booked": true, "title": "Little Kids BJJ (ages 3–5)", "date": "2026-06-15", "confirmed": true }
```

---

### `cancel-class.js` — cancel a booked class

```bash
node cancel-class.js --state-file /tmp/epica-cody-session.json --student cody --date 2026-06-15 [--weeks-ahead 0]
```

- Same `--student`/`--date`/`--weeks-ahead` semantics as `book-class.js`.
- If not currently booked, returns `{ "ok": true, "canceled": true, "alreadyCanceled": true, ... }`.
- Fails if the booking is past the cancellation window (`canCancel: false` from
  `get-schedule.js`).

**Output:**
```json
{ "ok": true, "canceled": true, "title": "Little Kids BJJ (ages 3–5)", "date": "2026-06-15" }
```

---

## Guardrails

- Never log or expose credentials in output.
- Always confirm with the user before booking or canceling a class — these are real
  actions with real-world consequences (class attendance, membership session usage).
- Use `get-schedule.js` first to check current booking status (`booked`, `bookable`,
  `canCancel`) before calling `book-class.js` or `cancel-class.js`.
- Never book Cody into a "Big Kids" class or Leo into a "Little Kids" class.
- Never answer a question about Leo's schedule/bookings using data from Cody's session —
  see "Leo is not currently supported" above. Point the user to
  https://epicajiujitsu.gymdesk.com/login instead.
